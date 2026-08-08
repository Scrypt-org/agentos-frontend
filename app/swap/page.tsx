'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { usePin } from '@/contexts/PinContext';
import Image from 'next/image';
import { getSwapQuote, executeSwap, getTokenBalances } from '@/services/dex-swap';
import { TOKENS } from '@/services/tokens';
import { resolveTransactionKey } from '@/services/transaction-key';
import { privateKeyToHex } from '@/utils/wallet';
import type { Address } from 'viem';
import LoadingSpinner from '@/components/LoadingSpinner';
import TransactionAuthModal from '@/components/TransactionAuthModal';

interface Token {
  symbol: string;
  name: string;
  icon: string;
  balance: string;
}

export default function SwapPage() {
  const router = useRouter();
  const { isUnlocked, isCheckingSession, address, privateKey } = useWallet();
  const { isPinLocked, autoLockMinutes } = usePin();
  const [fromToken, setFromToken] = useState<Token>({ symbol: 'MON', name: 'Monad', icon: '/injswap.png', balance: '0.0000' });
  const [toToken, setToToken] = useState<Token>({ symbol: 'USDT', name: 'Tether USD', icon: '/USDT_Logo.png', balance: '0.00' });
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [showFromTokens, setShowFromTokens] = useState(false);
  const [showToTokens, setShowToTokens] = useState(false);
  const [closingFromTokens, setClosingFromTokens] = useState(false);
  const [closingToTokens, setClosingToTokens] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiIntent, setAiIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [priceImpact, setPriceImpact] = useState('0.00');
  const [gasEstimate, setGasEstimate] = useState('0.00025');
  const [txHash, setTxHash] = useState('');
  const [swapSuccess, setSwapSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [swapButtonError, setSwapButtonError] = useState<string | null>(null);

  const GAS_RESERVE_INJ = 0.0008;

  // Check if from and to tokens are the same
  const isSameTokenPair = (): boolean => {
    return fromToken.symbol === toToken.symbol;
  };

  // Check if amount is a valid number format
  const isInvalidAmountFormat = (): boolean => {
    if (!fromAmount || fromAmount === '') return false;
    const num = parseFloat(fromAmount);
    if (isNaN(num) || num <= 0) return true;
    if (/^0\d+/.test(fromAmount) && !fromAmount.startsWith('0.')) return true;
    return false;
  };

  // Check if amount exceeds balance
  const isAmountExceedsBalance = () => {
    if (!fromAmount || fromAmount === '') return false;
    const amount = parseFloat(fromAmount);
    const balance = parseFloat(fromToken.balance);
    return !isNaN(amount) && amount > balance;
  };

  // Check if INJ balance is sufficient for gas (when swapping non-INJ tokens)
  const isInsufficientINJForGas = (): boolean => {
    if (!fromAmount || fromAmount === '') return false;
    if (fromToken.symbol === 'INJ') {
      const amount = parseFloat(fromAmount);
      const balance = parseFloat(fromToken.balance);
      return !isNaN(amount) && (amount + GAS_RESERVE_INJ) > balance;
    }
    const injToken = tokens.find(t => t.symbol === 'INJ');
    const injBalance = injToken ? parseFloat(injToken.balance) : 0;
    return injBalance < GAS_RESERVE_INJ;
  };

  // Handle max button click
  const handleMaxClick = () => {
    if (fromToken.symbol === 'INJ') {
      const balance = parseFloat(fromToken.balance);
      const maxAmount = balance - GAS_RESERVE_INJ;
      if (maxAmount <= 0) {
        setFromAmount('0');
      } else {
        const floored = Math.floor(maxAmount * 10000) / 10000;
        setFromAmount(floored.toFixed(4));
      }
    } else {
      setFromAmount(fromToken.balance);
    }
  };

  // Get swap button state
  const getSwapButtonState = (): { label: string; isError: boolean; disabled: boolean } => {
    if (loading) return { label: 'Swapping...', isError: false, disabled: true };
    if (swapButtonError) {
      return { label: swapButtonError, isError: true, disabled: true };
    }
    if (fromAmount && isInvalidAmountFormat()) {
      return { label: 'Wrong Amount', isError: true, disabled: true };
    }
    if (isAmountExceedsBalance()) {
      return { label: `Insufficient ${fromToken.symbol} Balance`, isError: true, disabled: true };
    }
    if (fromAmount && parseFloat(fromAmount) > 0 && isInsufficientINJForGas()) {
      return { label: 'Insufficient INJ Balance', isError: true, disabled: true };
    }
    if (isSameTokenPair()) {
      return { label: 'Swap Tokens', isError: false, disabled: true };
    }
    if (!fromAmount || !toAmount || quoteLoading) {
      return { label: 'Swap Tokens', isError: false, disabled: true };
    }
    return { label: 'Swap Tokens', isError: false, disabled: false };
  };

  // Token list with real balances
  const [tokens, setTokens] = useState<Token[]>([
    { symbol: 'MON', name: 'Monad', icon: '/injswap.png', balance: '0.0000' },
    { symbol: 'USDT', name: 'Tether USD', icon: '/USDT_Logo.png', balance: '0.00' },
    { symbol: 'USDC', name: 'USD Coin', icon: '/USDC_Logo.png', balance: '0.00' },
  ]);

  // Fetch real token balances
  useEffect(() => {
    if (isUnlocked && address) {
      fetchBalances();
    }
  }, [isUnlocked, address]);

  const fetchBalances = async () => {
    if (!address) return;
    
    try {
      const balances = await getTokenBalances(['INJ', 'USDT', 'USDC'], address as Address);
      
      setTokens([
        { symbol: 'MON', name: 'Monad', icon: '/injswap.png', balance: parseFloat(balances.INJ).toFixed(4) },
        { symbol: 'USDT', name: 'Tether USD', icon: '/USDT_Logo.png', balance: parseFloat(balances.USDT).toFixed(2) },
        { symbol: 'USDC', name: 'USD Coin', icon: '/USDC_Logo.png', balance: parseFloat(balances.USDC).toFixed(2) },
      ]);

      const currentFrom = tokens.find(t => t.symbol === fromToken.symbol);
      const currentTo = tokens.find(t => t.symbol === toToken.symbol);
      if (currentFrom) setFromToken({ ...currentFrom, balance: balances[currentFrom.symbol] });
      if (currentTo) setToToken({ ...currentTo, balance: balances[currentTo.symbol] });
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    }
  };

  // Get real swap quote
  const fetchQuote = useCallback(async (amount: string) => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setToAmount('');
      return;
    }

    // Skip quote for same token pair or invalid format
    if (fromToken.symbol === toToken.symbol) {
      setToAmount('');
      return;
    }

    if (/^0\d+/.test(amount) && !amount.startsWith('0.')) {
      setToAmount('');
      return;
    }

    setQuoteLoading(true);

    try {
      const quote = await getSwapQuote(
        fromToken.symbol,
        toToken.symbol,
        amount,
        parseFloat(slippage)
      );

      setToAmount(quote.expectedOutput);
      setPriceImpact(quote.priceImpact);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      setToAmount('');
    } finally {
      setQuoteLoading(false);
    }
  }, [fromToken, toToken, slippage]);

  // Clear swap button error when inputs change
  useEffect(() => {
    setSwapButtonError(null);
  }, [fromAmount, fromToken, toToken]);

  // Debounced quote fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fromAmount) {
        fetchQuote(fromAmount);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken, fetchQuote]);

  // Parse AI intent
  const parseAiIntent = () => {
    setLoading(true);
    // Mock AI parsing
    setTimeout(() => {
      const intent = aiIntent.toLowerCase();
      
      // Extract amount
      const amountMatch = intent.match(/(\d+\.?\d*)/);
      if (amountMatch) {
        setFromAmount(amountMatch[1]);
      }
      
      // Extract tokens
      if (intent.includes('inj') && intent.includes('usdt')) {
        if (intent.indexOf('inj') < intent.indexOf('usdt')) {
          setFromToken(tokens[0]);
          setToToken(tokens[1]);
        } else {
          setFromToken(tokens[1]);
          setToToken(tokens[0]);
        }
      }
      
      setLoading(false);
      setAiMode(false);
    }, 1000);
  };

  const switchTokens = () => {
    const temp = fromToken;
    const tempAmount = fromAmount;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const closeFromTokensDropdown = () => {
    setClosingFromTokens(true);
    setTimeout(() => {
      setShowFromTokens(false);
      setClosingFromTokens(false);
    }, 150);
  };

  const closeToTokensDropdown = () => {
    setClosingToTokens(true);
    setTimeout(() => {
      setShowToTokens(false);
      setClosingToTokens(false);
    }, 150);
  };

  const handleSwapClick = () => {
    // Check if authentication is needed
    if (isPinLocked || autoLockMinutes === 0) {
      // Need authentication
      setShowAuthModal(true);
    } else {
      // Within PIN-free window, swap directly
      handleSwap();
    }
  };

  const handleSwap = async (authorizedKey?: Uint8Array) => {
    const transactionKey = resolveTransactionKey(authorizedKey, privateKey);
    if (!address || !transactionKey) {
      console.error('[Swap] Wallet not connected');
      return;
    }

    if (!fromAmount || !toAmount) {
      console.error('[Swap] Missing amount');
      return;
    }

    const amount = parseFloat(fromAmount);
    const balance = parseFloat(fromToken.balance);
    
    if (isNaN(amount) || amount <= 0) {
      setSwapButtonError('Wrong Amount');
      return;
    }

    if (amount > balance) {
      setSwapButtonError(`Insufficient ${fromToken.symbol} Balance`);
      return;
    }

    setLoading(true);
    setSwapButtonError(null);

    try {
      // Convert private key format
      const pkHex = privateKeyToHex(transactionKey);
      
      // Execute swap
      const hash = await executeSwap({
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amountIn: fromAmount,
        slippage: parseFloat(slippage),
        userAddress: address as Address,
        privateKey: pkHex,
      });

      // Show success screen
      setTxHash(hash);
      setSwapSuccess(true);

      // Refresh balances
      await fetchBalances();
    } catch (error) {
      console.error('Swap failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('exceeds the balance')) {
        setSwapButtonError('Insufficient INJ Balance');
      } else if (errorMessage.includes('reverted') || errorMessage.includes('execution')) {
        setSwapButtonError('Swap Execution Failed');
      } else if (errorMessage.includes('slippage') || errorMessage.includes('INSUFFICIENT_OUTPUT')) {
        setSwapButtonError('Slippage Too High');
      } else if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setSwapButtonError('Transaction Rejected');
      } else {
        setSwapButtonError('Swap Failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = (authorizedKey: Uint8Array) => {
    setShowAuthModal(false);
    handleSwap(authorizedKey);
  };

  if (isCheckingSession) {
    return <LoadingSpinner progress={44} statusLabel="Checking wallet session" />;
  }

  if (!isUnlocked) {
    router.push('/');
    return null;
  }

  // Success screen
  if (swapSuccess && txHash) {
    return (
      <div className="min-h-screen pb-24 md:pb-8 bg-black">
        {/* Header - Dashboard Style */}
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
                <h1 className="text-xl font-bold text-white">Swap Complete</h1>
                <p className="text-gray-400 text-xs">Your swap has been executed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Success Message */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Swap Successful</h2>
            <p className="text-gray-400 text-sm">Your tokens have been swapped successfully</p>
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
                <a
                  href={`https://blockscout.injective.network/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-white/10 transition-all group"
                  title="View on Explorer"
                >
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                
                {/* Share Button */}
                <button
                  onClick={() => {
                    const shareText = `Swap Transaction: ${txHash}`;
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

          {/* Swap Details Card */}
          <div className="p-5 rounded-2xl bg-black border border-white/10 mb-6 space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-400">Status</span>
              <span className="text-sm font-bold text-white">Confirmed</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">From</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-white">{fromAmount} {fromToken.symbol}</span>
                <Image src={fromToken.icon} alt={fromToken.symbol} width={20} height={20} className="rounded-full" />
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">To</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-white">{toAmount} {toToken.symbol}</span>
                <Image src={toToken.icon} alt={toToken.symbol} width={20} height={20} className="rounded-full" />
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">Price Impact</span>
              <span className="text-sm font-mono text-white">{priceImpact}%</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">Network</span>
              <span className="text-sm font-bold text-white">Monad Testnet</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="text-sm text-gray-400">Timestamp</span>
              <span className="text-sm font-mono text-white">{new Date().toLocaleString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* Back to Dashboard - Main Button */}
            <button 
              onClick={() => router.push('/dashboard')}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold hover:bg-gray-100 transition-all shadow-lg"
            >
              Back to Dashboard
            </button>
            
            {/* Make Another Swap - Secondary Button */}
            <button 
              onClick={() => {
                setSwapSuccess(false);
                setTxHash('');
                setFromAmount('');
                setToAmount('');
              }}
              className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
            >
              Make Another Swap
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8 bg-black">
      {/* Header - OKX Style */}
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
                <h1 className="text-xl font-bold text-white">Swap</h1>
                <p className="text-gray-400 text-xs">Exchange tokens</p>
              </div>
            </div>

            {/* AI Mode Toggle */}
            <button 
              onClick={() => setAiMode(!aiMode)}
              className={`p-2.5 rounded-xl font-bold transition-all ${
                aiMode 
                  ? 'bg-white text-black' 
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
              }`}
              title={aiMode ? "AI Mode Active" : "Enable AI Mode"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {aiMode ? (
          /* AI Intent Mode */
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                  <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">AI Swap Assistant</h3>
                  <p className="text-xs text-gray-400">Describe what you want to swap</p>
                </div>
              </div>

              <textarea
                value={aiIntent}
                onChange={(e) => setAiIntent(e.target.value)}
                placeholder="e.g., Swap 10 INJ to USDT"
                className="w-full h-32 py-4 px-4 rounded-xl bg-black border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-all text-sm resize-none"
              />

              <button
                onClick={parseAiIntent}
                disabled={!aiIntent.trim() || loading}
                className="w-full mt-4 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Parse Intent'}
              </button>
            </div>

            {/* Gas Estimate - Always Display in AI Mode */}
            <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gas Estimate</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-400">Gas Limit:</span>
                <span className="text-sm font-mono text-white">150000</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-400">Max Fee:</span>
                <span className="text-sm font-mono text-white">2.50 Gwei</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-t border-white/10 pt-3">
                <span className="text-sm font-bold text-gray-300">Est. Cost:</span>
                <span className="text-sm font-mono font-bold text-white">{gasEstimate} INJ</span>
              </div>
            </div>
          </div>
        ) : (
          /* Manual Swap Mode */
          <div className="space-y-4">
            {/* From Token */}
            <div className={`p-5 rounded-2xl bg-black border transition-all ${
              isAmountExceedsBalance() 
                ? 'border-red-500/50 shadow-red-500/20 shadow-lg' 
                : 'border-white/10'
            } ${showFromTokens ? 'relative z-[200]' : 'relative z-[1]'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">From</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Balance: {fromToken.balance}</span>
                  <button
                    onClick={handleMaxClick}
                    className="px-2 py-1 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded transition-all"
                    title="Set maximum amount"
                  >
                    Max
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowFromTokens(!showFromTokens)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                    style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-white flex items-center justify-center">
                      <Image src={fromToken.icon} alt={fromToken.symbol} width={24} height={24} className="w-full h-full object-contain" />
                    </div>
                    <span className="font-bold text-sm">{fromToken.symbol}</span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Token Dropdown */}
                  {showFromTokens && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={closeFromTokensDropdown} />
                      <div className={`dropdown-menu absolute top-full left-0 mt-2 w-64 bg-black border border-white/10 rounded-xl shadow-2xl z-[101] p-2 ${closingFromTokens ? 'closing' : ''}`}>
                        {tokens.map((token) => (
                          <button
                            key={token.symbol}
                            onClick={() => {
                              setFromToken(token);
                              closeFromTokensDropdown();
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all"
                          >
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-white">
                              <Image src={token.icon} alt={token.symbol} width={32} height={32} className="w-full h-full object-contain" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-bold">{token.symbol}</div>
                              <div className="text-xs text-gray-500">{token.name}</div>
                            </div>
                            <div className="text-xs text-gray-400">{token.balance}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="decimal"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0.0"
                  disabled={loading}
                  className={`flex-1 bg-transparent text-2xl font-bold placeholder-gray-600 focus:outline-none font-mono text-right disabled:opacity-50 ${
                    isAmountExceedsBalance() 
                      ? 'text-red-400 placeholder-red-400/50' 
                      : 'text-white'
                  }`}
                  style={{ 
                    WebkitUserSelect: 'text', 
                    userSelect: 'text',
                    WebkitTapHighlightColor: 'transparent',
                    pointerEvents: 'auto',
                    touchAction: 'manipulation',
                    minWidth: 0
                  }}
                />
              </div>
            </div>

            {/* Switch Button */}
            <div className="flex justify-center -my-2 relative pb-4">
              <button
                onClick={switchTokens}
                className="w-10 h-10 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center shadow-lg transition-all hover:scale-110"
              >
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* To Token */}
            <div className={`p-5 rounded-2xl bg-black border transition-all ${
              isSameTokenPair() && fromAmount
                ? 'border-red-500/50 shadow-red-500/20 shadow-lg'
                : 'border-white/10'
            } ${showToTokens ? 'relative z-[200]' : 'relative z-[1]'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">To</span>
                <span className="text-xs text-gray-500">Balance: {toToken.balance}</span>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowToTokens(!showToTokens)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                    style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-white flex items-center justify-center">
                      <Image src={toToken.icon} alt={toToken.symbol} width={24} height={24} className="w-full h-full object-contain" />
                    </div>
                    <span className="font-bold text-sm">{toToken.symbol}</span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Token Dropdown */}
                  {showToTokens && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={closeToTokensDropdown} />
                      <div className={`dropdown-menu absolute top-full left-0 mt-2 w-64 bg-black border border-white/10 rounded-xl shadow-2xl z-[101] p-2 ${closingToTokens ? 'closing' : ''}`}>
                        {tokens.map((token) => (
                          <button
                            key={token.symbol}
                            onClick={() => {
                              setToToken(token);
                              closeToTokensDropdown();
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all"
                          >
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-white">
                              <Image src={token.icon} alt={token.symbol} width={32} height={32} className="w-full h-full object-contain" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-bold">{token.symbol}</div>
                              <div className="text-xs text-gray-500">{token.name}</div>
                            </div>
                            <div className="text-xs text-gray-400">{token.balance}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <input
                  type="text"
                  inputMode="decimal"
                  value={quoteLoading ? 'Loading...' : toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  placeholder="0.0"
                  disabled={loading || quoteLoading}
                  readOnly
                  className="flex-1 bg-transparent text-2xl font-bold text-white placeholder-gray-600 focus:outline-none font-mono text-right disabled:opacity-50 pr-3"
                  style={{ 
                    WebkitUserSelect: 'text', 
                    userSelect: 'text',
                    WebkitTapHighlightColor: 'transparent',
                    pointerEvents: 'auto',
                    touchAction: 'manipulation',
                    minWidth: 0
                  }}
                />
              </div>
            </div>

            {/* Swap Details */}
            {fromAmount && toAmount && (
              <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Swap Details</span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-400">Rate:</span>
                  <span className="text-sm font-mono text-white">
                    1 {fromToken.symbol} ≈ {toAmount && fromAmount ? (parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(4) : '0'} {toToken.symbol}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-400">Price Impact:</span>
                  <span className="text-sm font-mono text-green-400">&lt;{priceImpact}%</span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-400">Slippage:</span>
                  <span className="text-sm font-mono text-white">{slippage}%</span>
                </div>
              </div>
            )}

            {/* Gas Estimate - Always Display */}
            <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gas Estimate</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-400">Gas Limit:</span>
                <span className="text-sm font-mono text-white">150000</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-400">Max Fee:</span>
                <span className="text-sm font-mono text-white">2.50 Gwei</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-t border-white/10 pt-3">
                <span className="text-sm font-bold text-gray-300">Est. Cost:</span>
                <span className="text-sm font-mono font-bold text-white">{gasEstimate} INJ</span>
              </div>
            </div>

            {/* Swap Button */}
            {(() => {
              const btnState = getSwapButtonState();
              return (
                <button
                  onClick={handleSwapClick}
                  disabled={btnState.disabled}
                  className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                    btnState.isError
                      ? 'bg-red-500 text-white cursor-not-allowed'
                      : 'bg-white text-black hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Swapping...</span>
                    </>
                  ) : btnState.isError ? (
                    <span>{btnState.label}</span>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <polyline points="16 3 21 3 21 8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="4" y1="20" x2="21" y2="3" strokeWidth={2.5} strokeLinecap="round" />
                        <polyline points="21 16 21 21 16 21" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="15" y1="15" x2="21" y2="21" strokeWidth={2.5} strokeLinecap="round" />
                        <line x1="4" y1="4" x2="9" y2="9" strokeWidth={2.5} strokeLinecap="round" />
                      </svg>
                      <span>Swap Tokens</span>
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        )}
      </div>

      {/* Transaction Authentication Modal */}
      <TransactionAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        transactionType="swap"
      />
    </div>
  );
}
