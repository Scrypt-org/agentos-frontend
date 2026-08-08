'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { usePin } from '@/contexts/PinContext';
import { estimateGas, getBalance, sendTransaction } from '@/wallet/chain';
import { DEFAULT_CHAIN, INJECTIVE_MAINNET, GasEstimate } from '@/types/chain';
import { isNFCSupported, readNFCCard } from '@/services/nfc';
import { resolveTransactionKey } from '@/services/transaction-key';
import LoadingSpinner from '@/components/LoadingSpinner';
import TransactionAuthModal from '@/components/TransactionAuthModal';
import { getInjectiveAddress, getEthereumAddress } from '@injectivelabs/sdk-ts';
import { isAddress, type Address } from 'viem';
import {
  getUsdcBalance,
  pollSponsoredUsdcTransfer,
  prepareSponsoredUsdcTransfer,
  SponsoredUsdcApiError,
  sponsoredUsdcErrorMessage,
  submitSponsoredUsdcTransfer,
  type SponsoredUsdcPrepareResponse,
  type SponsoredUsdcTransfer,
  type TokenBalance,
} from '@/services/sponsored-usdc';
import { signTypedDataJson } from '@/services/typed-data-signing';
import {
  cancelSponsoredUsdcIntent,
  createOperationGuard,
  createClearedSendIntent,
  getSponsoredUsdcPrimaryAction,
  getSponsoredUsdcStatusPresentation,
  getUsdcAmountValidation,
  isCurrentSponsoredUsdcIntent,
  type SponsoredUsdcIntent,
} from '@/services/send-page-sponsored-usdc';
import {
  DEFAULT_SEND_ASSET,
  SEND_ASSETS,
  getSendAssetToken,
  getSendTransferMode,
  parseSendAsset,
  type SendAsset,
} from '@/services/send-assets';
import {
  ZERO_ERC20_BALANCE,
  encodeErc20Transfer,
  getErc20Balance,
  parseErc20Amount,
  type Erc20Balance,
} from '@/services/erc20-transfer';

interface AddressBookEntry {
  name: string;
  address: string;
}

function toSponsoredUsdcMessage(cause: unknown): string {
  if (cause instanceof SponsoredUsdcApiError) {
    return sponsoredUsdcErrorMessage(cause.code);
  }
  if (
    cause instanceof Error
    && cause.message.startsWith('USDC amount must')
  ) {
    return cause.message;
  }
  return sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE');
}

function SendPageContent() {
  const router = useRouter();
  const { isUnlocked, privateKey, address, isCheckingSession } = useWallet();
  const { isPinLocked, autoLockMinutes } = usePin();
  const intentVersionRef = useRef(0);
  const sponsoredPrepareGuardRef = useRef(createOperationGuard());
  const gasEstimateGuardRef = useRef(createOperationGuard());
  const selectedAssetRef = useRef<SendAsset>(DEFAULT_SEND_ASSET);
  const preparedUsdcIntentRef = useRef<SponsoredUsdcIntent | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [asset, setAsset] = useState<SendAsset>(DEFAULT_SEND_ASSET);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [costFlashing, setCostFlashing] = useState(false);
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [closingAddressBook, setClosingAddressBook] = useState(false);
  const [closingAddModal, setClosingAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [showNfcScanner, setShowNfcScanner] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcSuccess, setNfcSuccess] = useState(false);
  const [closingNfcScanner, setClosingNfcScanner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nfcError, setNfcError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [injBalance, setInjBalance] = useState('0');
  const [usdcBalance, setUsdcBalance] = useState<TokenBalance>({
    value: 0n,
    formatted: '0',
    decimals: 6,
    symbol: 'USDC',
  });
  const [erc20Balances, setErc20Balances] =
    useState<Partial<Record<SendAsset, Erc20Balance>>>({});
  const [preparedUsdc, setPreparedUsdc] =
    useState<SponsoredUsdcPrepareResponse | null>(null);
  const [sponsoredTransfer, setSponsoredTransfer] =
    useState<SponsoredUsdcTransfer | null>(null);
  const transferMode = getSendTransferMode(asset);
  const transferControlsLocked = transferMode === 'sponsored' && sponsoredTransfer !== null;
  const assetBalance = transferMode === 'sponsored'
    ? usdcBalance.formatted
    : transferMode === 'erc20'
      ? (erc20Balances[asset] ?? ZERO_ERC20_BALANCE).formatted
      : injBalance;

  // Load address book from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('addressBook');
    if (saved) {
      try {
        setAddressBook(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load address book:', e);
      }
    }
  }, []);

  // Check for address in URL params (from QR scanner)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsEmbedded(params.get('embed') === '1');

    const addressParam = params.get('address');
    if (addressParam) {
      console.log('[Send] Setting address from URL:', addressParam);
      setRecipient(addressParam);
    }

    // Deep links from the asset list arrive as ?asset=USDT. Unknown symbols are
    // ignored so a link can never land on a coin Send cannot actually move.
    const assetParam = parseSendAsset(params.get('asset'));
    if (assetParam) {
      selectedAssetRef.current = assetParam;
      setAsset(assetParam);
    }
  }, []);

  useEffect(() => {
    if (!address) return;
    getBalance(address, INJECTIVE_MAINNET)
      .then((balance) => setInjBalance(balance.formatted))
      .catch((error) => {
        console.error('[Send] Failed to load balance:', error);
      });
    getUsdcBalance(address as Address)
      .then(setUsdcBalance)
      .catch((error) => {
        console.error('[Send] Failed to load USDC balance:', error);
      });
    SEND_ASSETS
      .filter((option) => getSendTransferMode(option) === 'erc20')
      .forEach((option) => {
        const token = getSendAssetToken(option);
        getErc20Balance(
          address as Address,
          token.address as Address,
          token.decimals,
        )
          .then((balance) => {
            setErc20Balances((current) => ({ ...current, [option]: balance }));
          })
          .catch((error) => {
            console.error(`[Send] Failed to load ${option} balance:`, error);
          });
      });
  }, [address]);

  const clearTransferIntent = () => {
    intentVersionRef.current += 1;
    sponsoredPrepareGuardRef.current.invalidate();
    preparedUsdcIntentRef.current = null;
    setPreparedUsdc(null);
    setSponsoredTransfer(null);
    setTxHash('');
    setError('');
    setLoading(false);
  };

  // Save address to address book
  const saveToAddressBook = () => {
    if (!newName.trim() || !newAddress.trim()) return;
    
    const newEntry: AddressBookEntry = {
      name: newName.trim(),
      address: newAddress.trim(),
    };
    
    const updated = [...addressBook, newEntry];
    setAddressBook(updated);
    localStorage.setItem('addressBook', JSON.stringify(updated));
    
    setNewName('');
    setNewAddress('');
    setShowAddModal(false);
  };

  // Delete address from address book
  const deleteFromAddressBook = (index: number) => {
    const updated = addressBook.filter((_, i) => i !== index);
    setAddressBook(updated);
    localStorage.setItem('addressBook', JSON.stringify(updated));
  };

  // Select address from address book
  const selectAddress = (address: string) => {
    clearTransferIntent();
    setRecipient(address);
    closeAddressBook();
  };

  const closeAddressBook = () => {
    setClosingAddressBook(true);
    setTimeout(() => {
      setShowAddressBook(false);
      setClosingAddressBook(false);
    }, 150);
  };

  const closeAddModal = () => {
    setClosingAddModal(true);
    setTimeout(() => {
      setShowAddModal(false);
      setClosingAddModal(false);
      setNewName('');
      setNewAddress('');
    }, 200);
  };

  // Handle NFC Scanner
  const openNfcScanner = async () => {
    setShowNfcScanner(true);
    setNfcScanning(false);
    setNfcSuccess(false);
    setNfcError('');
    setClosingNfcScanner(false);
    
    // Check NFC support
    if (!isNFCSupported()) {
      setNfcError('NFC is not supported on this device. Please use an Android device with Chrome browser.');
      return;
    }
    
    // Start scanning
    setNfcScanning(true);
    try {
      const cardData = await readNFCCard();
      console.log('[Send] NFC card read:', cardData);
      
      // Success!
      setNfcScanning(false);
      setNfcSuccess(true);
      
      // If card has address, use it
      if (cardData.address) {
        setTimeout(() => {
          clearTransferIntent();
          setRecipient(cardData.address!);
          setTimeout(() => {
            closeNfcScanner();
          }, 1000);
        }, 500);
      } else {
        // Card has no address stored
        setNfcError('This card has no address stored. Please bind it first in Cards page.');
        setNfcSuccess(false);
        setNfcScanning(false);
      }
    } catch (error) {
      console.error('[Send] NFC read error:', error);
      setNfcScanning(false);
      setNfcError((error as Error).message || 'Failed to read NFC card. Please try again.');
    }
  };

  const closeNfcScanner = () => {
    setClosingNfcScanner(true);
    setTimeout(() => {
      setShowNfcScanner(false);
      setNfcScanning(false);
      setNfcSuccess(false);
      setNfcError('');
      setClosingNfcScanner(false);
    }, 350); // Match animation duration
  };

  // Check if address is EVM format (0x...)
  const isEvmAddress = (address: string): boolean => {
    return address.startsWith('0x') && address.length === 42;
  };

  // Check if address is Cosmos format (inj1...)
  const isCosmosAddress = (address: string): boolean => {
    return address.startsWith('inj1') && address.length >= 40;
  };

  const isValidRecipientAddress = useCallback((nextAddress: string): boolean => {
    if (!nextAddress) return true;
    return isEvmAddress(nextAddress) || isCosmosAddress(nextAddress);
  }, []);

  // Applies to every self-paid asset; sponsored USDC has its own validator.
  const isSelfPaidInsufficientBalance = (): boolean => {
    if (!amount || !recipient) return false;
    const nextAmount = parseFloat(amount);
    const nextBalance = parseFloat(assetBalance);
    return !Number.isNaN(nextAmount) && nextAmount > 0 && nextAmount > nextBalance;
  };

  const getButtonState = (): { label: string; isError: boolean; disabled: boolean } => {
    if (loading) {
      return {
        label: transferMode === 'sponsored' ? 'Processing...' : 'Sending...',
        isError: false,
        disabled: true,
      };
    }
    if (asset === 'USDC' && preparedUsdc) {
      return {
        label: 'Authorization ready',
        isError: false,
        disabled: true,
      };
    }
    if (asset === 'USDC' && sponsoredTransfer) {
      return getSponsoredUsdcPrimaryAction(sponsoredTransfer);
    }
    if (recipient && !isValidRecipientAddress(recipient)) {
      return { label: 'Invalid Address', isError: true, disabled: true };
    }
    if (asset === 'USDC' && amount) {
      const validation = getUsdcAmountValidation(amount, usdcBalance.value);
      if (!validation.valid) {
        return { label: 'Invalid USDC Amount', isError: true, disabled: true };
      }
      if (validation.insufficient) {
        return { label: 'Insufficient Balance', isError: true, disabled: true };
      }
    }
    if (
      transferMode !== 'sponsored'
      && recipient
      && amount
      && isSelfPaidInsufficientBalance()
    ) {
      return { label: 'Insufficient Balance', isError: true, disabled: true };
    }
    if (error) {
      return {
        label: transferMode === 'sponsored' ? 'Transfer unavailable' : error,
        isError: true,
        disabled: true,
      };
    }
    if (!recipient || !amount || (transferMode !== 'sponsored' && !gasEstimate)) {
      return { label: 'Send Transaction', isError: false, disabled: true };
    }
    return {
      label: asset === 'INJ' ? 'Send Transaction' : `Send ${asset}`,
      isError: false,
      disabled: false,
    };
  };

  const handleAssetChange = (nextAsset: SendAsset) => {
    if (nextAsset === asset || transferControlsLocked) return;
    const cleared = createClearedSendIntent();
    intentVersionRef.current += 1;
    sponsoredPrepareGuardRef.current.invalidate();
    gasEstimateGuardRef.current.invalidate();
    selectedAssetRef.current = nextAsset;
    preparedUsdcIntentRef.current = null;
    setAsset(nextAsset);
    setAmount(cleared.amount);
    setGasEstimate(cleared.gasEstimate);
    setPreparedUsdc(cleared.preparedUsdc);
    setSponsoredTransfer(cleared.sponsoredTransfer);
    setTxHash(cleared.txHash);
    setError(cleared.error);
    setLoading(false);
    setEstimating(false);
    setCostFlashing(false);
    setShowAuthModal(false);
  };

  // Convert between EVM and Cosmos addresses using official Injective SDK
  const convertAddress = () => {
    try {
      if (isEvmAddress(recipient)) {
        // EVM to Cosmos using official SDK (same as receive page)
        const cosmosAddress = getInjectiveAddress(recipient);
        clearTransferIntent();
        setRecipient(cosmosAddress);
      } else if (isCosmosAddress(recipient)) {
        // Cosmos to EVM using official SDK
        const evmAddress = getEthereumAddress(recipient);
        clearTransferIntent();
        setRecipient(evmAddress);
      }
    } catch (err) {
      setError('Failed to convert address');
      console.error('Address conversion error:', err);
    }
  };

  // Convert cosmos address to EVM for gas estimation using official SDK
  const getEvmAddress = useCallback((address: string): string => {
    if (isEvmAddress(address)) return address;
    if (isCosmosAddress(address)) {
      try {
        return getEthereumAddress(address);
      } catch {
        return address;
      }
    }
    return address;
  }, []);

  const handleEstimate = useCallback(async (useDefaults = false) => {
    const estimateAsset = asset;
    const estimateMode = getSendTransferMode(estimateAsset);
    // Sponsored transfers cost the user nothing, so there is nothing to quote.
    if (estimateMode === 'sponsored') return;
    if (selectedAssetRef.current !== estimateAsset) return;
    // Placeholder inputs only work for the native asset: an ERC-20 `transfer`
    // to the zero address reverts, so a default probe would just error out.
    if (useDefaults && estimateMode !== 'native') return;
    console.log('[Send] handleEstimate called:', { useDefaults, asset: estimateAsset, recipient, amount, address, hasPrivateKey: !!privateKey });

    // Use default values if requested or use actual values
    let estimateRecipient = useDefaults ? '0x0000000000000000000000000000000000000000' : recipient;
    const estimateAmount = useDefaults ? '0.001' : amount;
    
    if (!estimateRecipient || !estimateAmount || !address) {
      console.log('[Send] Skipping estimate - missing required fields:', { 
        hasRecipient: !!estimateRecipient, 
        hasAmount: !!estimateAmount, 
        hasAddress: !!address 
      });
      return;
    }

    // Convert cosmos address to EVM for estimation
    const originalRecipient = estimateRecipient;
    estimateRecipient = getEvmAddress(estimateRecipient);
    console.log('[Send] Address conversion:', { original: originalRecipient, converted: estimateRecipient });

    const estimateToken = gasEstimateGuardRef.current.begin();
    const isCurrentEstimate = () => (
      selectedAssetRef.current === estimateAsset
      && gasEstimateGuardRef.current.isCurrent(estimateToken)
    );

    setEstimating(true);
    setError('');
    setCostFlashing(true);
    
    try {
      // An ERC-20 transfer is a call to the token contract carrying zero value;
      // only the native asset puts the amount in the transaction value.
      let estimateTo = estimateRecipient;
      let estimateValue = estimateAmount;
      let estimateData: `0x${string}` | undefined;
      let estimateChain = INJECTIVE_MAINNET;
      if (estimateMode === 'erc20') {
        const token = getSendAssetToken(estimateAsset);
        estimateData = encodeErc20Transfer(
          estimateRecipient as Address,
          parseErc20Amount(estimateAmount, token.decimals),
        );
        estimateTo = token.address;
        estimateValue = '0';
        // Token addresses come from the network-aware registry. Calling a
        // testnet address over the mainnet RPC would hit an empty account and
        // "succeed" without moving anything, so keep the two in step.
        estimateChain = DEFAULT_CHAIN;
      }

      console.log('[Send] Calling estimateGas with:', {
        from: address,
        to: estimateTo,
        amount: estimateAmount,
        asset: estimateAsset,
        chain: estimateChain.name,
        rpcUrl: estimateChain.rpcUrl
      });

      const estimate = await estimateGas(
        address, // Use actual user address
        estimateTo,
        estimateValue,
        estimateData,
        estimateChain
      );

      console.log('[Send] Gas estimate successful:', {
        gasLimit: estimate.gasLimit.toString(),
        maxFeePerGas: estimate.maxFeePerGas.toString(),
        totalCost: estimate.totalCost.toString()
      });

      if (!isCurrentEstimate()) return;
      setGasEstimate(estimate);
    } catch (err) {
      console.error('[Send] Gas estimation error:', err);
      console.error('[Send] Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      });

      if (!isCurrentEstimate()) return;
      // Ignore transient validation issues while the user is still typing
      if (!useDefaults) {
        const msg = err instanceof Error ? err.message : 'Failed to estimate gas';
        // "0." and other half-typed amounts fail parseErc20Amount; that is not
        // an error worth surfacing until the field settles.
        const isHalfTypedAmount = msg.startsWith('Amount must be a positive number');
        if (
          !isHalfTypedAmount
          && !msg.includes('invalid')
          && !msg.includes('Invalid')
          && !msg.includes('checksum')
        ) {
          setError(msg);
        }
      }
    } finally {
      if (!isCurrentEstimate()) return;
      setEstimating(false);
      setTimeout(() => {
        if (isCurrentEstimate()) setCostFlashing(false);
      }, 300);
    }
  }, [asset, recipient, amount, address, privateKey, getEvmAddress]);

  // Initial gas estimate on page load with default values
  useEffect(() => {
    if (asset === 'INJ' && address && !recipient && !amount) {
      handleEstimate(true);
    }
  }, [asset, address, recipient, amount, handleEstimate]);

  // Auto-estimate gas when recipient and amount are filled
  useEffect(() => {
    if (
      getSendTransferMode(asset) !== 'sponsored'
      && recipient
      && amount
      && address
      && isValidRecipientAddress(recipient)
    ) {
      handleEstimate(false);
    }
  }, [asset, recipient, amount, address, handleEstimate, isValidRecipientAddress]);

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (getSendTransferMode(asset) === 'sponsored') return;
    const hasRealInput = Boolean(recipient && amount && isValidRecipientAddress(recipient));
    // Only the native asset can be quoted before the form is filled in.
    const useDefaults = asset === 'INJ' && !recipient && !amount;
    if (!address || (!hasRealInput && !useDefaults)) return;

    const interval = setInterval(() => {
      handleEstimate(useDefaults);
    }, 3000);

    return () => clearInterval(interval);
  }, [asset, recipient, amount, address, handleEstimate, isValidRecipientAddress]);

  const handleSend = async (authorizedKey?: Uint8Array) => {
    const transactionKey = resolveTransactionKey(authorizedKey, privateKey);
    if (!recipient || !amount || !transactionKey) return;

    setLoading(true);
    setError('');
    setTxHash('');
    
    try {
      const normalizedRecipient = getEvmAddress(recipient);
      let hash: string;
      if (transferMode === 'erc20') {
        const token = getSendAssetToken(asset);
        hash = await sendTransaction(
          transactionKey,
          token.address,
          '0',
          encodeErc20Transfer(
            normalizedRecipient as Address,
            parseErc20Amount(amount, token.decimals),
          ),
          // Same chain the address came from — see handleEstimate.
          DEFAULT_CHAIN
        );
      } else {
        hash = await sendTransaction(
          transactionKey,
          normalizedRecipient,
          amount,
          undefined,
          INJECTIVE_MAINNET
        );
      }

      setTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleSendClick = async () => {
    if (transferMode === 'sponsored') {
      if (loading || preparedUsdc || sponsoredTransfer) return;
      const prepareToken = sponsoredPrepareGuardRef.current.tryBegin();
      if (prepareToken === null) return;
      const intentVersion = intentVersionRef.current + 1;
      intentVersionRef.current = intentVersion;
      setLoading(true);
      setError('');
      setTxHash('');
      setPreparedUsdc(null);
      setSponsoredTransfer(null);

      try {
        const normalizedRecipient = getEvmAddress(recipient);
        if (!isAddress(normalizedRecipient)) {
          throw new SponsoredUsdcApiError('INVALID_RECIPIENT');
        }
        const prepared = await prepareSponsoredUsdcTransfer(
          normalizedRecipient,
          amount,
        );
        if (
          intentVersionRef.current !== intentVersion
          || !sponsoredPrepareGuardRef.current.isCurrent(prepareToken)
        ) return;
        preparedUsdcIntentRef.current = {
          token: prepareToken,
          transferId: prepared.transferId,
        };
        setPreparedUsdc(prepared);
        setShowAuthModal(true);
      } catch (cause) {
        if (intentVersionRef.current === intentVersion) {
          setError(toSponsoredUsdcMessage(cause));
        }
      } finally {
        sponsoredPrepareGuardRef.current.finish(prepareToken);
        if (intentVersionRef.current === intentVersion) {
          setLoading(false);
        }
      }
      return;
    }

    if (!privateKey || isPinLocked || autoLockMinutes === 0) {
      setShowAuthModal(true);
      return;
    }
    await handleSend(privateKey);
  };

  const handleSponsoredUsdcAuthorization = async (
    authorizedKey: Uint8Array,
    intent: SponsoredUsdcIntent,
    prepared: SponsoredUsdcPrepareResponse,
  ) => {
    const isCurrentIntent = () => isCurrentSponsoredUsdcIntent(
      sponsoredPrepareGuardRef.current,
      intent,
      asset,
      preparedUsdcIntentRef.current?.transferId ?? null,
    ) && prepared.transferId === intent.transferId;

    if (!isCurrentIntent()) return;

    const intentVersion = intentVersionRef.current;
    setLoading(true);
    setError('');

    try {
      const signature = await signTypedDataJson(authorizedKey, prepared.typedData);
      if (
        intentVersionRef.current !== intentVersion
        || !isCurrentIntent()
      ) return;

      const queued = await submitSponsoredUsdcTransfer(
        prepared.transferId,
        signature,
      );
      if (
        intentVersionRef.current !== intentVersion
        || !sponsoredPrepareGuardRef.current.isCurrent(intent.token)
      ) return;
      preparedUsdcIntentRef.current = null;
      setPreparedUsdc(null);
      setSponsoredTransfer(queued);

      const finalOrPending = await pollSponsoredUsdcTransfer(queued.id);
      if (intentVersionRef.current !== intentVersion) return;
      setSponsoredTransfer(finalOrPending);
      if (
        finalOrPending.status === 'CONFIRMED'
        && finalOrPending.txHash
      ) {
        setTxHash(finalOrPending.txHash);
        if (address) {
          setUsdcBalance(await getUsdcBalance(address as Address));
        }
      }
    } catch (cause) {
      if (
        intentVersionRef.current === intentVersion
        && sponsoredPrepareGuardRef.current.isCurrent(intent.token)
      ) {
        setError(toSponsoredUsdcMessage(cause));
      }
    } finally {
      if (
        intentVersionRef.current === intentVersion
        && sponsoredPrepareGuardRef.current.isCurrent(intent.token)
      ) {
        setLoading(false);
      }
    }
  };

  const handleSponsoredUsdcRefresh = async () => {
    if (!sponsoredTransfer) return;
    const intentVersion = intentVersionRef.current;
    setLoading(true);
    setError('');

    try {
      const finalOrPending = await pollSponsoredUsdcTransfer(
        sponsoredTransfer.id,
      );
      if (intentVersionRef.current !== intentVersion) return;
      setSponsoredTransfer(finalOrPending);
      if (
        finalOrPending.status === 'CONFIRMED'
        && finalOrPending.txHash
      ) {
        setTxHash(finalOrPending.txHash);
        if (address) {
          setUsdcBalance(await getUsdcBalance(address as Address));
        }
      }
    } catch (cause) {
      if (intentVersionRef.current === intentVersion) {
        setError(toSponsoredUsdcMessage(cause));
      }
    } finally {
      if (intentVersionRef.current === intentVersion) {
        setLoading(false);
      }
    }
  };

  const handleAuthSuccess = async (authorizedKey: Uint8Array) => {
    if (transferMode !== 'sponsored') {
      setShowAuthModal(false);
      await handleSend(authorizedKey);
      return;
    }

    const intent = preparedUsdcIntentRef.current;
    const prepared = preparedUsdc;
    if (
      !intent
      || !prepared
      || !isCurrentSponsoredUsdcIntent(
        sponsoredPrepareGuardRef.current,
        intent,
        asset,
        prepared.transferId,
      )
    ) return;

    setShowAuthModal(false);
    await handleSponsoredUsdcAuthorization(authorizedKey, intent, prepared);
  };

  const handleAuthModalClose = () => {
    if (transferMode === 'sponsored') {
      cancelSponsoredUsdcIntent(
        sponsoredPrepareGuardRef.current,
        () => {
          preparedUsdcIntentRef.current = null;
          setPreparedUsdc(null);
        },
      );
    }
    setShowAuthModal(false);
  };

  const sponsoredStatus = sponsoredTransfer
    ? getSponsoredUsdcStatusPresentation(sponsoredTransfer)
    : null;
  const sponsoredPrimaryAction = sponsoredTransfer
    ? getSponsoredUsdcPrimaryAction(sponsoredTransfer)
    : null;
  const successExplorerUrl = transferMode === 'sponsored'
    ? sponsoredTransfer?.explorerUrl
    : txHash
      ? `${INJECTIVE_MAINNET.explorerUrl}/tx/${txHash}`
      : null;

  if (isCheckingSession) {
    return <LoadingSpinner progress={44} statusLabel="Checking wallet session" />;
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen pb-24 md:pb-8 bg-black flex items-center justify-center">
        <div className="text-center px-4">
          <div className="mb-6">
            <svg className="w-16 h-16 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeWidth={2} />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeWidth={2} />
            </svg>
          </div>
          <p className="text-gray-400 mb-6">Please unlock your wallet first</p>
          <button 
            onClick={() => router.push('/welcome')}
            className="px-6 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all"
          >
            Go to Wallet
          </button>
        </div>
      </div>
    );
  }

  if (txHash) {
    return (
      <div className={`${isEmbedded ? 'bg-black' : 'min-h-screen pb-24 md:pb-8 bg-black'}`}>
        {!isEmbedded && (
          <div className="bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 py-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="15 18 9 12 15 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Transaction Complete</h1>
                  <p className="text-gray-400 text-xs">Your transaction has been sent</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className={`max-w-2xl mx-auto px-4 ${isEmbedded ? 'py-6' : 'py-8'}`}>
          {/* Success Message */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Sent Successfully</h2>
            <p className="text-gray-400 text-sm">Your transaction has been sent to the network</p>
          </div>

          {/* Transaction Hash Card */}
          <div className="p-6 rounded-2xl bg-black border border-white/10 mb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Transaction Hash</span>
              <div className="flex items-center gap-2">
                {/* Copy Button */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(txHash);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 transition-all group"
                  title="Copy Hash"
                >
                  {copied ? (
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                      <rect width="11" height="11" x="4" y="4" rx="1" ry="1" strokeWidth="1.5" />
                      <path d="M2 10c-0.8 0-1.5-0.7-1.5-1.5V2c0-0.8 0.7-1.5 1.5-1.5h8.5c0.8 0 1.5 0.7 1.5 1.5" strokeWidth="1.5" />
                    </svg>
                  )}
                </button>
                
                {/* View Explorer Button */}
                {successExplorerUrl && (
                  <a
                    href={successExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-white/10 transition-all group"
                    title="View on Explorer"
                  >
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
                
                {/* Share Button */}
                <button
                  onClick={() => {
                    const shareText = `Transaction: ${txHash}`;
                    if (navigator.share) {
                      navigator.share({ text: shareText });
                    } else {
                      navigator.clipboard.writeText(shareText);
                    }
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 transition-all group"
                  title="Share"
                >
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="font-mono text-sm text-white break-all bg-white/5 p-3 rounded-xl">
              {txHash}
            </div>
          </div>

          {/* Transaction Details Card */}
          <div className="p-5 rounded-2xl bg-black border border-white/10 mb-6 space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-400">Status</span>
              <span className="text-sm font-bold text-white">Confirmed</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">Amount</span>
              <span className="text-sm font-mono font-bold text-white">
                {amount} {asset}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">To</span>
              <span className="text-sm font-mono text-white">{recipient.slice(0,6)}...{recipient.slice(-4)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">Network</span>
              <span className="text-sm font-bold text-white">Monad</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">Timestamp</span>
              <span className="text-sm font-mono text-white">{new Date().toLocaleString()}</span>
            </div>
          </div>

          {/* Back to Dashboard - Main Button */}
          {!isEmbedded && (
            <button 
              onClick={() => router.push('/dashboard')}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold hover:bg-gray-100 transition-all shadow-lg"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  const buttonState = getButtonState();

  return (
    <div className={`${isEmbedded ? 'bg-black' : 'min-h-screen pb-24 md:pb-8 bg-black'}`}>
      {!isEmbedded && (
        <div className="bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="15 18 9 12 15 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Send</h1>
                  <p className="text-gray-400 text-xs">Transfer tokens</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`max-w-2xl mx-auto px-4 ${isEmbedded ? 'py-5' : 'py-6'}`}>
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-6">
          {/* Asset */}
          <div>
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
              Asset
            </label>
            <div
              className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1"
              role="group"
              aria-label="Send asset"
            >
              {SEND_ASSETS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAssetChange(option)}
                  disabled={transferControlsLocked}
                  aria-pressed={asset === option}
                  className={`min-h-10 rounded-lg px-4 text-sm font-bold transition ${
                    asset === option
                      ? 'bg-white text-black'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
              Recipient Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={recipient}
                disabled={transferControlsLocked}
                onChange={(e) => {
                  clearTransferIntent();
                  setRecipient(e.target.value);
                }}
                placeholder="0x... or inj1..."
              className="w-full py-4 px-4 pr-32 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-all font-mono text-sm"
            />

              {/* Convert Address Button */}
              <button
                onClick={convertAddress}
                disabled={
                  transferControlsLocked
                  || (!isEvmAddress(recipient) && !isCosmosAddress(recipient))
                }
                className={`absolute right-24 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                  isEvmAddress(recipient) || isCosmosAddress(recipient)
                    ? 'hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer'
                    : 'text-gray-600 cursor-not-allowed opacity-30'
                }`}
                title={isEvmAddress(recipient) ? 'Convert to Cosmos address (inj1...)' : isCosmosAddress(recipient) ? 'Convert to EVM address (0x...)' : 'Convert address format'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>

              {/* NFC Scan Button (Hand/Touch Icon) */}
              <button
                onClick={openNfcScanner}
                disabled={transferControlsLocked}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 transition-all"
                title="Scan Card (Experimental)"
              >
                <svg className="w-5 h-5 text-gray-400 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                </svg>
              </button>

              {/* Address Book Button */}
              <button
                onClick={() => setShowAddressBook(!showAddressBook)}
                disabled={transferControlsLocked}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 transition-all"
                title="Address Book"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </button>

              {/* Address Book Dropdown */}
              {showAddressBook && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={closeAddressBook}
                  />
                  <div className={`dropdown-menu absolute right-0 top-full mt-2 w-full md:w-96 bg-black border border-white/10 rounded-2xl shadow-2xl z-50 max-h-96 overflow-hidden flex flex-col ${closingAddressBook ? 'closing' : ''}`}>
                    {/* Header */}
                    <div className="p-4 border-b border-white/10 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Address Book</h3>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                        title="Add New Address"
                      >
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Address List */}
                    <div className="flex-1 overflow-y-auto">
                      {addressBook.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <p className="text-sm">No saved addresses</p>
                        </div>
                      ) : (
                        <div className="p-2">
                          {addressBook.map((entry, index) => (
                            <div
                              key={index}
                              className="p-3 rounded-xl hover:bg-white/5 transition-all mb-2 group"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  onClick={() => selectAddress(entry.address)}
                                  className="flex-1 text-left"
                                >
                                  <div className="text-sm font-bold text-white mb-1">{entry.name}</div>
                                  <div className="text-xs font-mono text-gray-400 truncate">{entry.address}</div>
                                </button>
                                <button
                                  onClick={() => deleteFromAddressBook(index)}
                                  className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                                  title="Delete"
                                >
                                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <label className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                Amount
              </label>
              <span className="min-w-0 truncate text-right text-xs text-gray-500">
                Balance:{' '}
                <span className="font-mono text-gray-300">
                  {assetBalance} {asset}
                </span>
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                disabled={transferControlsLocked}
                onChange={(e) => {
                  clearTransferIntent();
                  setAmount(e.target.value);
                }}
                placeholder={asset === 'INJ' ? '0.001' : '0.00'}
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-4 pr-20 font-mono text-sm text-white placeholder-gray-500 transition-all focus:border-white/30 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-300">
                {asset}
              </span>
            </div>
          </div>

          {transferMode !== 'sponsored' ? (
            <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <svg className={`w-4 h-4 text-gray-400 ${estimating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gas Estimate</span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-400">Gas Limit:</span>
                <span className="text-sm font-mono text-white">
                  {gasEstimate ? gasEstimate.gasLimit.toString() : '--'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-400">Max Fee:</span>
                <span className="text-sm font-mono text-white">
                  {gasEstimate ? `${(Number(gasEstimate.maxFeePerGas) / 1e9).toFixed(2)} Gwei` : '--'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-t border-white/10 pt-3">
                <span className="text-sm font-bold text-gray-300">Est. Cost:</span>
                <span className={`text-sm font-mono font-bold text-white transition-opacity duration-300 ${costFlashing ? 'opacity-30' : 'opacity-100'}`}>
                  {gasEstimate ? `${(Number(gasEstimate.totalCost) / 1e18).toFixed(6)} INJ` : '--'}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black p-5">
              <div className="flex justify-between gap-4 py-2">
                <span className="text-sm text-gray-400">Network fee</span>
                <span className="text-sm font-mono font-bold text-white">0 INJ</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
                <span className="text-sm text-gray-400">Gas sponsor</span>
                <span className="text-right text-sm font-bold text-emerald-300">
                  Sponsored by AgentOS
                </span>
              </div>
            </div>
          )}

          {asset === 'USDC' && (preparedUsdc || sponsoredStatus) && (
            <div
              className={`rounded-2xl border p-4 ${
                sponsoredStatus?.tone === 'error'
                  ? 'border-red-500/30 bg-red-500/10'
                  : sponsoredStatus?.tone === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5'
              }`}
              role="status"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {sponsoredStatus?.label ?? 'Authorization ready'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    {sponsoredStatus?.message
                      ?? 'Review and authorize this sponsored USDC transfer.'}
                  </p>
                </div>
                {(sponsoredStatus?.pending ?? true) && (
                  <span className="mt-1 h-2 w-2 flex-none rounded-full bg-amber-300" />
                )}
              </div>
              {sponsoredStatus?.canRefresh && (
                <button
                  type="button"
                  onClick={handleSponsoredUsdcRefresh}
                  disabled={loading}
                  className="mt-3 text-sm font-bold text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white disabled:opacity-40"
                >
                  Refresh status
                </button>
              )}
              {sponsoredPrimaryAction?.canRetry && (
                <button
                  type="button"
                  onClick={() => clearTransferIntent()}
                  disabled={loading}
                  className="mt-3 text-sm font-bold text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white disabled:opacity-40"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {/* Send Button */}
          <button
            onClick={handleSendClick}
            disabled={buttonState.disabled}
            className={`w-full py-4 rounded-2xl font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              buttonState.isError
                ? 'bg-red-500/14 border border-red-500/30 text-red-200'
                : 'bg-white text-black hover:bg-gray-100'
            }`}
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {buttonState.label}
              </>
            ) : (
              <>
                {!buttonState.isError && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="12" y1="19" x2="12" y2="5" strokeWidth={2.5} strokeLinecap="round" />
                    <polyline points="5 12 12 5 19 12" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {buttonState.label}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Add Address Modal */}
      {showAddModal && (
        <div 
          className={`modal-overlay fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 ${closingAddModal ? 'closing' : ''}`}
          onClick={closeAddModal}
        >
          <div 
            className={`modal-content bg-black border border-white/10 rounded-2xl max-w-md w-full shadow-2xl ${closingAddModal ? 'closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Add New Address</h3>
              <button
                onClick={closeAddModal}
                className="p-2 rounded-lg hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Name Input */}
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-all text-sm"
                  autoFocus
                />
              </div>

              {/* Address Input */}
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Address
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="inj1..."
                  className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-all font-mono text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewName('');
                    setNewAddress('');
                  }}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={saveToAddressBook}
                  disabled={!newName.trim() || !newAddress.trim()}
                  className="flex-1 py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NFC Scanner Modal - OKX Style */}
      {showNfcScanner && (
        <div 
          className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end justify-center z-50 transition-opacity duration-200 ${closingNfcScanner ? 'opacity-0' : 'opacity-100'}`}
          onClick={closeNfcScanner}
        >
          <div 
            className={`nfc-scanner-modal bg-black border-t border-white/10 rounded-t-3xl w-full max-w-2xl shadow-2xl ${
              closingNfcScanner ? 'slide-down' : 'slide-up'
            }`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '75vh' }}
          >
            {/* Header - Clean and Simple */}
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Scan Card (Experimental)</h3>
                  <p className="text-gray-400 text-xs">Hold your device near the card</p>
                </div>
                <button
                  onClick={closeNfcScanner}
                  className="p-2 rounded-xl hover:bg-white/10 transition-all"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Scanner Body */}
            <div className="p-8 flex flex-col items-center justify-center min-h-[350px]">
              {!nfcSuccess ? (
                <>
                  {/* Scanning Animation - Card on left + 3 breathing circles on right */}
                  <div className="flex items-center justify-center gap-8 mb-6">
                    {/* Horizontal Card on the left */}
                    <div className="relative">
                      <div className="w-52 h-36 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border-[3px] border-white/20 flex items-center justify-between p-5 shadow-2xl">
                        {/* Left side - Card chip and details */}
                        <div className="flex flex-col justify-between h-full">
                          {/* Card chip */}
                          <div className="w-12 h-10 rounded bg-gradient-to-br from-yellow-400/30 to-yellow-600/30"></div>
                          
                          {/* Card text/logo */}
                          <div>
                            <div className="text-xs text-white/60 font-bold mb-2">CARD</div>
                            <div className="w-28 h-4 rounded bg-white/5 mb-1"></div>
                            <div className="w-20 h-3 rounded bg-white/5"></div>
                          </div>
                        </div>

                        {/* Right side - NFC symbol */}
                        <div className="flex items-center justify-center">
                          <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Three breathing circles on the right - White color */}
                    {nfcScanning && (
                      <div className="flex flex-col gap-4">
                        <div className="breathing-circle w-3 h-3 rounded-full bg-white" style={{ animationDelay: '0s' }}></div>
                        <div className="breathing-circle w-3 h-3 rounded-full bg-white" style={{ animationDelay: '0.2s' }}></div>
                        <div className="breathing-circle w-3 h-3 rounded-full bg-white" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    )}
                  </div>
                  
                  <h4 className="text-base font-bold text-white mb-1">
                    {nfcScanning ? 'Scanning...' : 'Ready to Scan'}
                  </h4>
                  <p className="text-gray-400 text-sm text-center mb-8">
                    {nfcError ? (
                      <span className="text-red-400">{nfcError}</span>
                    ) : nfcScanning ? (
                      <>
                        Please hold your device steady, <button onClick={() => router.push('/cards')} className="text-white underline hover:text-gray-200 transition-colors">need help?</button>
                      </>
                    ) : (
                      'Tap the card to your device'
                    )}
                  </p>
                  
                  {/* Close or Retry Button */}
                  {nfcError && (
                    <button
                      onClick={nfcError.includes('not supported') ? closeNfcScanner : openNfcScanner}
                      className="px-8 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all shadow-lg"
                    >
                      {nfcError.includes('not supported') ? 'Close' : 'Retry'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Success Animation - Circular Design with White Rings (85% size) */}
                  <div className="relative mb-6 flex items-center justify-center w-40 h-40">
                    {/* Three white glow rings - 85% size */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-40 h-40 rounded-full border-2 border-white/30 animate-ping"></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-32 h-32 rounded-full border-2 border-white/40 animate-ping" style={{ animationDelay: '0.15s' }}></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-28 h-28 rounded-full border-2 border-white/50 animate-ping" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                    
                    {/* Main success circle - 85% size */}
                    <div className="relative w-24 h-24 rounded-full bg-white flex items-center justify-center success-bounce shadow-2xl">
                      {/* Check mark */}
                      <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  
                  <h4 className="text-base font-bold text-white mb-1">Scan Complete!</h4>
                  <p className="text-gray-400 text-sm text-center">Address has been filled in</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transaction Authentication Modal */}
      <TransactionAuthModal
        isOpen={showAuthModal}
        onClose={handleAuthModalClose}
        onSuccess={handleAuthSuccess}
        transactionType="send"
      />
    </div>
  );
}

export default function SendPage() {
  return <SendPageContent />;
}
