'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TunnelBackground from '@/components/TunnelBackground';
import TrustPillBadge from '@/components/TrustPillBadge';
import WelcomeThemeIconButton from '@/components/WelcomeThemeIconButton';
import { WalletErrorToast } from '@/components/WalletErrorToast';
import { useTheme } from '@/contexts/ThemeContext';
import { useWalletErrorToast } from '@/lib/useWalletErrorToast';
import { unlockByPasskey } from '@/wallet/key-management/createByPasskey';
import { unlockWalletKey } from '@/wallet/key-management';
import { loadWallet } from '@/wallet/keystore/storage';
import { signAndSendTransaction } from '@/wallet/chain/evm/sendTransaction';
import { INJECTIVE_MAINNET, INJECTIVE_TESTNET, type TransactionRequest } from '@/types/chain';
import { NETWORK_CONFIG } from '@/config/network';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import type {
  AuthRequest,
  AuthResponse,
  WalletConnectRequest,
  WalletConnectResponse,
} from '@/lib/auth-bridge';

/** Embedded-dApp transaction request relayed from the /embed iframe. */
interface EmbedTxRequest {
  to: string;
  data?: string;
  value?: string;
  gas?: string;
}

/**
 * Convert an EIP-1193 `eth_sendTransaction` payload (hex-quantity strings, as
 * ethers/wagmi produce) into the viem-backed TransactionRequest shape. Missing
 * gas/fee/nonce are left undefined so viem fills them at broadcast time.
 */
function normalizeTx(tx: EmbedTxRequest): TransactionRequest {
  const req: TransactionRequest = { to: tx.to };
  if (tx.data) req.data = tx.data as `0x${string}`;
  if (tx.value !== undefined && tx.value !== null && tx.value !== '')
    req.value = BigInt(tx.value);
  if (tx.gas !== undefined && tx.gas !== null && tx.gas !== '')
    req.gasLimit = BigInt(tx.gas);
  return req;
}

/** Human-readable INJ amount from a hex/decimal wei string (18 decimals). */
function formatInjValue(value?: string): string {
  if (!value) return '0';
  try {
    const wei = BigInt(value);
    if (wei === 0n) return '0';
    const whole = wei / 1_000_000_000_000_000_000n;
    const frac = (wei % 1_000_000_000_000_000_000n)
      .toString()
      .padStart(18, '0')
      .slice(0, 6)
      .replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return value;
  }
}

function hashPersonalMessage(message: string): Uint8Array {
  const msgBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(
    `\x19Ethereum Signed Message:\n${msgBytes.length}`
  );
  const combined = new Uint8Array(prefix.length + msgBytes.length);
  combined.set(prefix);
  combined.set(msgBytes, prefix.length);
  return keccak_256(combined);
}

/** Extract a user-friendly error message from verbose RPC/viem errors. */
function friendlyErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient funds') || lower.includes('sender balance')) {
    return 'Insufficient funds to cover transaction cost + gas.';
  }
  if (lower.includes('user rejected') || lower.includes('user denied')) {
    return 'Transaction rejected by user.';
  }
  if (lower.includes('nonce')) {
    return 'Nonce too low. Please try again.';
  }
  if (lower.includes('gas required exceeds allowance') || lower.includes('out of gas')) {
    return 'Transaction gas limit too low.';
  }
  if (lower.includes('execution reverted')) {
    const match = raw.match(/execution reverted[:\s]*(.*?)(?:\s*Version:|$)/i);
    return match?.[1]?.trim() || 'Contract execution reverted.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Transaction timed out.';
  }
  // For other errors, truncate to first sentence
  const firstSentence = raw.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length < 120) return firstSentence[0];
  return raw.length > 120 ? raw.slice(0, 117) + '...' : raw;
}

function BrandLockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="11" width="16" height="9" rx="2.8" />
      <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function FingerprintIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" d="M12 4.5a6.5 6.5 0 00-6.5 6.5" />
      <path strokeLinecap="round" d="M12 4.5a6.5 6.5 0 016.5 6.5" />
      <path strokeLinecap="round" d="M8 11a4 4 0 018 0v2.4" />
      <path strokeLinecap="round" d="M8.2 15.4c.2 2.4-.4 4.1-1.7 5.6" />
      <path strokeLinecap="round" d="M12 8a3 3 0 013 3v4.5c0 2.2-.5 4.1-1.7 5.8" />
      <path strokeLinecap="round" d="M11.2 12.5v3.8c0 1.5-.3 2.8-1.2 4.2" />
      <path strokeLinecap="round" d="M16.8 11.8v1.6c0 3.1-.3 5.3-1.6 7.6" />
    </svg>
  );
}

function SparkIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 4.5L18 9.3l-4.2 1.8L12 16l-1.8-4.9L6 9.3l4.2-1.8L12 3z" />
      <path strokeLinecap="round" d="M19 15l.9 2.2L22 18l-2.1.8L19 21l-.9-2.2L16 18l2.1-.8L19 15z" />
    </svg>
  );
}

function CheckIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.1 4.1L19 7.5" />
    </svg>
  );
}

function XIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" d="M7 7l10 10" />
      <path strokeLinecap="round" d="M17 7L7 17" />
    </svg>
  );
}

function callerOriginToLabel(origin: string | null) {
  if (!origin) return 'Connected app';
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function AuthPageContent() {
  const { theme } = useTheme();
  const isLightMode = theme === 'light';

  const [query] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        requestId: null as string | null,
        originParam: null as string | null,
        action: 'connect',
      };
    }

    const params = new URLSearchParams(window.location.search);
    return {
      requestId: params.get('requestId'),
      originParam: params.get('origin'),
      action: params.get('action') || 'connect',
    };
  });

  const { requestId, originParam, action } = query;

  const [status, setStatus] = useState<
    'waiting' | 'sign_pending' | 'tx_pending' | 'processing' | 'success' | 'error' | 'ready'
  >('waiting');
  const [message, setMessage] = useState('');
  const [currentSignRequest, setCurrentSignRequest] = useState<{
    requestId: string;
    message: string;
    origin: string;
  } | null>(null);
  const [currentTxRequest, setCurrentTxRequest] = useState<{
    requestId: string;
    tx: EmbedTxRequest;
    origin: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const { errorToast, showErrorToast, dismissErrorToast } = useWalletErrorToast();

  const BALL_W = 82;
  const BALL_H = 82;
  const FULL_W = 400;
  const FULL_H = 800;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (status === 'ready') {
      window.resizeTo(BALL_W, BALL_H);
      window.moveTo(
        Math.max(0, screen.availWidth - BALL_W - 20),
        Math.max(0, screen.availHeight - BALL_H - 60)
      );
    } else if (status !== 'waiting') {
      window.resizeTo(FULL_W, FULL_H);
      window.moveTo(
        Math.max(0, screen.availWidth - FULL_W - 20),
        Math.max(0, screen.availHeight - FULL_H - 60)
      );
      window.focus();
    }
  }, [status]);

  // Use a ref for status so the message listener never needs re-registration.
  // This prevents the brief window where messages could be lost between
  // cleanup and re-registration when status changes.
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const handleSignRequest = (event: MessageEvent) => {
      const isLocalhost = event.origin.startsWith('http://localhost:');
      const isSameOrigin = event.origin === originParam;
      const isSameDomain = event.origin === window.location.origin;
      if (!isLocalhost && !isSameOrigin && !isSameDomain) return;

      const { type, requestId: reqId, message: msg, tx } = event.data;
      if (type === 'SIGN_REQUEST' && statusRef.current === 'ready') {
        setCurrentSignRequest({
          requestId: reqId,
          message: msg,
          origin: event.origin,
        });
        setStatus('sign_pending');
      }
      if (type === 'TX_REQUEST' && statusRef.current === 'ready') {
        setCurrentTxRequest({
          requestId: reqId,
          tx: tx as EmbedTxRequest,
          origin: event.origin,
        });
        setStatus('tx_pending');
      }
    };

    window.addEventListener('message', handleSignRequest);
    return () => window.removeEventListener('message', handleSignRequest);
  }, [originParam]);

  useEffect(() => {
    if (action === 'sign_persistent') {
      setStatus('ready');
    }
  }, [action]);

  const handleConfirmSign = async () => {
    if (!currentSignRequest) return;

    const { requestId: reqId, message: msg, origin: reqOrigin } =
      currentSignRequest;

    setErrorMessage('');
    setStatus('processing');
    setMessage('Unlocking your INJ Pass...');

    try {
      dismissErrorToast(true);
      const keystore = loadWallet();
      if (!keystore?.credentialId) throw new Error('Wallet not found');

      const privateKey = await unlockWalletKey(keystore);
      setMessage('Authorizing signature...');

      const messageHash = hashPersonalMessage(msg);
      const sigBytes = secp256k1.sign(messageHash, privateKey, {
        lowS: true,
        prehash: false,
        format: 'recovered',
      });

      const ethSig = new Uint8Array(65);
      ethSig.set(sigBytes.slice(1, 33), 0);
      ethSig.set(sigBytes.slice(33, 65), 32);
      ethSig[64] = sigBytes[0] + 27;

      window.opener?.postMessage(
        {
          type: 'SIGN_RESPONSE',
          requestId: reqId,
          signature: Array.from(ethSig),
          address: keystore.address,
        },
        reqOrigin
      );
      try {
        const bc = new BroadcastChannel('injpass_tx');
        bc.postMessage({
          type: 'SIGN_RESPONSE',
          requestId: reqId,
          signature: Array.from(ethSig),
          address: keystore.address,
        });
        bc.close();
      } catch {}

      setCurrentSignRequest(null);
      setStatus('success');
      setMessage('Authorization complete');
      setTimeout(() => setStatus('ready'), 1800);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Signing failed';
      const friendlyMsg = friendlyErrorMessage(rawMsg);
      console.error('[INJ Pass /auth] Sign failed:', rawMsg);
      showErrorToast(friendlyMsg);
      window.opener?.postMessage(
        {
          type: 'SIGN_RESPONSE',
          requestId: reqId,
          error: friendlyMsg,
        },
        currentSignRequest.origin
      );
      try {
        const bc = new BroadcastChannel('injpass_tx');
        bc.postMessage({ type: 'SIGN_RESPONSE', requestId: reqId, error: friendlyMsg });
        bc.close();
      } catch {}
      setCurrentSignRequest(null);
      setErrorMessage(friendlyMsg);
      setStatus('error');
      setTimeout(() => {
        setErrorMessage('');
        setStatus('ready');
      }, 6000);
    }
  };

  const handleRejectSign = () => {
    if (currentSignRequest) {
      window.opener?.postMessage(
        {
          type: 'SIGN_RESPONSE',
          requestId: currentSignRequest.requestId,
          error: 'User rejected the request.',
        },
        currentSignRequest.origin
      );
    }
    setCurrentSignRequest(null);
    setStatus('ready');
  };

  const handleConfirmTx = async () => {
    if (!currentTxRequest) return;

    const { requestId: reqId, tx, origin: reqOrigin } = currentTxRequest;

    setErrorMessage('');
    setStatus('processing');
    setMessage('Unlocking your INJ Pass...');

    try {
      dismissErrorToast(true);
      const keystore = loadWallet();
      if (!keystore?.credentialId) throw new Error('Wallet not found');

      const privateKey = await unlockWalletKey(keystore);
      setMessage('Signing & broadcasting transaction...');

      const activeChain = NETWORK_CONFIG.isMainnet ? INJECTIVE_MAINNET : INJECTIVE_TESTNET;
      const txHash = await signAndSendTransaction(privateKey, normalizeTx(tx), activeChain);

      console.log('[INJ Pass /auth] TX broadcast success, txHash:', txHash);

      // Send response via both channels:
      // 1. window.opener → embed page → dApp (may fail if opener is cross-origin)
      // 2. BroadcastChannel → dApp directly (reliable fallback)
      // NOTE: requestId must be at top level (flat) to match embed's listener
      window.opener?.postMessage(
        {
          type: 'TX_RESPONSE',
          requestId: reqId,
          txHash,
        },
        reqOrigin
      );
      console.log('[INJ Pass /auth] TX_RESPONSE sent via postMessage to opener, requestId:', reqId);
      try {
        const bc = new BroadcastChannel('injpass_tx');
        bc.postMessage({ type: 'TX_RESPONSE', requestId: reqId, txHash });
        console.log('[INJ Pass /auth] TX_RESPONSE sent via BroadcastChannel, requestId:', reqId);
        bc.close();
      } catch (bcErr) {
        console.error('[INJ Pass /auth] BroadcastChannel send failed:', bcErr);
      }

      setCurrentTxRequest(null);
      setStatus('success');
      setMessage('Transaction submitted');
      setTimeout(() => setStatus('ready'), 1800);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Transaction failed';
      const friendlyMsg = friendlyErrorMessage(rawMsg);
      console.error('[INJ Pass /auth] TX failed:', rawMsg);
      showErrorToast(friendlyMsg);
      window.opener?.postMessage(
        {
          type: 'TX_RESPONSE',
          requestId: reqId,
          error: friendlyMsg,
        },
        reqOrigin
      );
      try {
        const bc = new BroadcastChannel('injpass_tx');
        bc.postMessage({ type: 'TX_RESPONSE', requestId: reqId, error: friendlyMsg });
        bc.close();
      } catch {}
      setCurrentTxRequest(null);
      setErrorMessage(friendlyMsg);
      setStatus('error');
      setTimeout(() => {
        setErrorMessage('');
        setStatus('ready');
      }, 6000);
    }
  };

  const handleRejectTx = () => {
    if (currentTxRequest) {
      window.opener?.postMessage(
        {
          type: 'TX_RESPONSE',
          requestId: currentTxRequest.requestId,
          error: 'User rejected the request.',
        },
        currentTxRequest.origin
      );
    }
    setCurrentTxRequest(null);
    setStatus('ready');
  };

  useEffect(() => {
    if (action === 'sign_persistent') {
      return;
    }

    if (!requestId || !originParam) {
      showErrorToast('Invalid request parameters');
      setStatus('error');
      return;
    }

    let processingStarted = false;

    const handleWalletConnect = async (
      request: WalletConnectRequest,
      targetOrigin: string
    ) => {
      if (request.requestId !== requestId) {
        return;
      }

      if (processingStarted) {
        return;
      }

      processingStarted = true;
      setStatus('processing');
      setMessage('Preparing secure authorization...');

      try {
        dismissErrorToast(true);
        const keystore = loadWallet();
        if (!keystore) {
          throw new Error(
            'No wallet found. Please create a wallet first at injpass.com'
          );
        }
        if (!keystore.credentialId) {
          // A wallet exists but has no passkey credential — i.e. a
          // password-fallback wallet created when this device/browser lacks
          // WebAuthn PRF. dApp connect is passkey-only for now, so surface a
          // clear, actionable message instead of the misleading "No wallet
          // found" (which sends users hunting for a wallet they actually have).
          throw new Error(
            'This is a password wallet (your device does not support passkey). ' +
              'Connecting to dApps is not supported for password wallets yet. ' +
              'Please use a device with passkey support.'
          );
        }

        setMessage('Verifying with passkey...');
        await unlockByPasskey(keystore.credentialId);

        const response: WalletConnectResponse = {
          type: 'WALLET_CONNECT_RESPONSE',
          requestId: request.requestId,
          address: keystore.address,
          walletName: keystore.walletName || 'INJ Pass Wallet',
        };

        window.opener?.postMessage(response, targetOrigin);

        setStatus('ready');
        setMessage('Ready to sign transactions');
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : 'Connection failed';
        const friendlyMsg = friendlyErrorMessage(rawMsg);
        console.error('[INJ Pass /auth] Connect failed:', rawMsg);
        showErrorToast(friendlyMsg);
        setErrorMessage(friendlyMsg);
        setStatus('error');

        const response: WalletConnectResponse = {
          type: 'WALLET_CONNECT_RESPONSE',
          requestId: request.requestId,
          error: friendlyMsg,
        };

        window.opener?.postMessage(response, targetOrigin);
      }
    };

    const handlePasskeySign = async (
      request: AuthRequest,
      targetOrigin: string
    ) => {
      if (request.requestId !== requestId) {
        return;
      }

      if (processingStarted) {
        return;
      }

      processingStarted = true;
      setStatus('processing');
      setMessage('Preparing secure signature...');

      try {
        dismissErrorToast(true);
        const keystore = loadWallet();
        if (!keystore || !keystore.credentialId) {
          throw new Error('Wallet not found');
        }

        setMessage('Unlocking your INJ Pass...');
        const privateKey = await unlockWalletKey(keystore);

        setMessage('Signing message...');
        const messageHash = hashPersonalMessage(request.message);
        const sigBytes = secp256k1.sign(messageHash, privateKey, {
          lowS: true,
          prehash: false,
          format: 'recovered',
        });

        const recovery = sigBytes[0];
        const r = sigBytes.slice(1, 33);
        const s = sigBytes.slice(33, 65);
        const ethSignature = new Uint8Array(65);
        ethSignature.set(r, 0);
        ethSignature.set(s, 32);
        ethSignature[64] = recovery + 27;

        const response: AuthResponse = {
          type: 'PASSKEY_SIGN_RESPONSE',
          requestId: request.requestId,
          signature: Array.from(ethSignature),
          address: keystore.address,
        };

        window.opener?.postMessage(response, targetOrigin);

        setStatus('success');
        setMessage('Authorization complete');
        setTimeout(() => window.close(), 1500);
      } catch (err) {
        const rawMsg =
          err instanceof Error ? err.message : 'Authentication failed';
        const friendlyMsg = friendlyErrorMessage(rawMsg);
        console.error('[INJ Pass /auth] Auth failed:', rawMsg);
        showErrorToast(friendlyMsg);
        setErrorMessage(friendlyMsg);
        setStatus('error');

        const response: AuthResponse = {
          type: 'PASSKEY_SIGN_RESPONSE',
          requestId: request.requestId,
          error: friendlyMsg,
        };

        window.opener?.postMessage(response, targetOrigin);
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      const isLocalhost = event.origin.startsWith('http://localhost:');
      const isSameOrigin = event.origin === originParam;

      if (!isLocalhost && !isSameOrigin) {
        showErrorToast('Origin verification failed');
        setStatus('error');
        return;
      }

      const data = event.data;

      if (data.type === 'WALLET_CONNECT' && data.requestId === requestId) {
        await handleWalletConnect(data as WalletConnectRequest, event.origin);
      }

      if (data.type === 'PASSKEY_SIGN' && data.requestId === requestId) {
        await handlePasskeySign(data as AuthRequest, event.origin);
      }

      if (data.type === 'SIGN_REQUEST' && data.requestId === requestId) {
        setCurrentSignRequest({
          requestId: data.requestId,
          message: data.message,
          origin: event.origin,
        });
        setStatus('sign_pending');
      }

      if (data.type === 'TX_REQUEST' && data.requestId === requestId) {
        // Handle TX_REQUEST regardless of current status, so transactions
        // can be reviewed even when the popup was opened for wallet connection.
        setCurrentTxRequest({
          requestId: data.requestId,
          tx: data.tx as EmbedTxRequest,
          origin: event.origin,
        });
        setStatus('tx_pending');
      }
    };

    window.addEventListener('message', handleMessage);

    if (window.opener) {
      window.opener.postMessage(
        { type: 'AUTH_WINDOW_READY', requestId },
        originParam
      );
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [action, dismissErrorToast, originParam, requestId, showErrorToast]);

  const callerLabel = useMemo(() => callerOriginToLabel(originParam), [originParam]);

  const pageTone = isLightMode ? 'bg-[#e9eff7] text-[#171b24]' : 'bg-[#020202] text-white';
  const headerTone = isLightMode ? 'text-[#59657a]' : 'text-white/58';
  const cardTone = isLightMode
    ? 'border-[#cad7eb] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(242,246,252,0.88))] text-[#171b24] shadow-[0_32px_100px_rgba(98,110,132,0.18)]'
    : 'border-white/10 bg-[linear-gradient(180deg,rgba(21,16,30,0.9),rgba(8,8,14,0.95))] text-white shadow-[0_40px_120px_rgba(5,4,8,0.58)]';
  const surfaceTone = isLightMode
    ? 'border-[#d6dfed] bg-white/74'
    : 'border-white/10 bg-white/[0.05]';
  const secondaryButtonTone = isLightMode
    ? 'border-[#cfd8ea] bg-white/76 text-[#2c394d] hover:bg-white'
    : 'border-white/10 bg-white/[0.06] text-white/84 hover:bg-white/[0.1]';
  const primaryButtonTone = isLightMode
    ? 'border-[#c9d5e8] bg-[linear-gradient(180deg,#ffffff_0%,#eef4fb_100%)] text-[#243043] hover:brightness-[1.02]'
    : 'border-[#d0b7ff]/24 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.08))] text-white hover:bg-white/[0.15]';

  if (status === 'ready') {
    return (
      <div
        style={{ width: BALL_W, height: BALL_H }}
        className={`relative overflow-hidden ${pageTone}`}
      >
        <div
          className={`absolute inset-0 ${
            isLightMode
              ? 'bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(234,239,247,0.88)_60%,rgba(220,227,240,0.8))]'
              : 'bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),rgba(88,63,134,0.26)_35%,rgba(13,12,22,0.96)_75%)]'
          }`}
        />
        <div className="relative flex h-full w-full items-center justify-center">
          <div
            className={`flex h-[68px] w-[68px] items-center justify-center rounded-full border backdrop-blur-xl ${
              isLightMode
                ? 'border-[#c8d4e8] text-[#4f48df] shadow-[0_14px_36px_rgba(88,102,129,0.18)]'
                : 'border-white/10 text-white shadow-[0_16px_44px_rgba(6,5,10,0.5)]'
            }`}
          >
            <BrandLockIcon className="h-6 w-6" />
          </div>
        </div>
      </div>
    );
  }

  const title =
    status === 'sign_pending'
      ? 'Review authorization request'
      : status === 'tx_pending'
        ? 'Review transaction request'
      : status === 'processing'
        ? 'Authorizing with passkey'
        : status === 'success'
          ? 'Authorization complete'
          : status === 'error'
            ? 'Authorization failed'
            : action === 'connect'
              ? 'Connect your INJ Pass'
              : 'Authorize secure action';

  const description =
    status === 'sign_pending'
      ? `Review the request from ${callerLabel} before approving with your passkey.`
      : status === 'tx_pending'
        ? `Review the transaction from ${callerLabel} before approving with your passkey.`
      : status === 'processing'
        ? message || 'Preparing secure authorization...'
      : status === 'success'
          ? 'The secure session is ready and will return to its compact state.'
      : status === 'error'
            ? errorMessage || 'An unexpected error occurred. Please try again.'
            : action === 'connect'
              ? 'Your paired wallet stays self-custodial while INJ Pass opens the secure session.'
              : 'INJ Pass is preparing the next authorization flow.';

  return (
    <div
      style={{ width: FULL_W, height: FULL_H }}
      className={`relative overflow-hidden transition-colors duration-500 ${pageTone}`}
    >
      <TunnelBackground mode={theme} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
        {errorToast ? (
          <WalletErrorToast
            key={errorToast.id}
            message={errorToast.message}
            isExiting={errorToast.isExiting}
            isLightMode={isLightMode}
          />
        ) : null}
      </div>
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div className={`absolute left-0 top-0 h-px w-full overflow-hidden ${isLightMode ? 'opacity-70' : 'opacity-60'}`}>
          <span className={`edge-marquee-x absolute left-0 top-0 h-full w-[30%] ${isLightMode ? 'bg-[linear-gradient(90deg,transparent,rgba(121,88,255,0.7),rgba(255,133,175,0.38),transparent)]' : 'bg-[linear-gradient(90deg,transparent,rgba(179,123,255,0.72),rgba(255,123,170,0.42),transparent)]'}`} />
        </div>
        <div className={`absolute bottom-0 left-0 h-px w-full overflow-hidden ${isLightMode ? 'opacity-55' : 'opacity-50'}`}>
          <span className={`edge-marquee-x-reverse absolute left-0 top-0 h-full w-[28%] ${isLightMode ? 'bg-[linear-gradient(90deg,transparent,rgba(255,140,173,0.34),rgba(121,88,255,0.62),transparent)]' : 'bg-[linear-gradient(90deg,transparent,rgba(255,129,166,0.4),rgba(174,131,255,0.62),transparent)]'}`} />
        </div>
        <div className={`absolute left-0 top-0 h-full w-px overflow-hidden ${isLightMode ? 'opacity-65' : 'opacity-55'}`}>
          <span className={`edge-marquee-y absolute left-0 top-0 h-[28%] w-full ${isLightMode ? 'bg-[linear-gradient(180deg,transparent,rgba(121,88,255,0.68),rgba(255,138,177,0.28),transparent)]' : 'bg-[linear-gradient(180deg,transparent,rgba(179,123,255,0.72),rgba(255,123,170,0.28),transparent)]'}`} />
        </div>
        <div className={`absolute right-0 top-0 h-full w-px overflow-hidden ${isLightMode ? 'opacity-55' : 'opacity-50'}`}>
          <span className={`edge-marquee-y-reverse absolute left-0 top-0 h-[30%] w-full ${isLightMode ? 'bg-[linear-gradient(180deg,transparent,rgba(255,140,173,0.3),rgba(121,88,255,0.64),transparent)]' : 'bg-[linear-gradient(180deg,transparent,rgba(255,129,166,0.32),rgba(174,131,255,0.68),transparent)]'}`} />
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-0 z-[2] ${
          isLightMode
            ? 'bg-[radial-gradient(circle_at_14%_18%,rgba(147,114,255,0.13),transparent_28%),radial-gradient(circle_at_84%_16%,rgba(255,126,175,0.1),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(233,239,247,0.32)_40%,rgba(233,239,247,0.82))]'
            : 'bg-[radial-gradient(circle_at_14%_18%,rgba(144,92,255,0.16),transparent_28%),radial-gradient(circle_at_84%_16%,rgba(255,102,168,0.11),transparent_24%),linear-gradient(180deg,rgba(7,8,14,0.16),rgba(2,2,2,0.78))]'
        }`}
      />

      <div className="relative z-10 flex h-full flex-col p-4">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={`text-[0.96rem] font-medium tracking-[-0.02em] ${isLightMode ? 'text-[#263144]' : 'text-white/[0.92]'}`}>
              INJ Pass Authorization
            </div>
            <div className={`mt-1 text-xs ${headerTone}`}>
              Agent Wallet for Injective
            </div>
          </div>
          <WelcomeThemeIconButton />
        </header>

        <div className={`relative mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border p-5 backdrop-blur-2xl ${cardTone}`}>
          <div
            className={`absolute inset-0 ${
              isLightMode
                ? 'bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,118,168,0.08),transparent_36%)]'
                : 'bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,118,168,0.09),transparent_36%)]'
            }`}
          />

          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border ${
                  isLightMode
                    ? 'border-[#d4deed] bg-white/82 text-[#4f48df]'
                    : 'border-white/10 bg-white/[0.06] text-white'
                }`}
              >
                {status === 'sign_pending' || status === 'tx_pending' ? (
                  <SparkIcon />
                ) : status === 'processing' ? (
                  <FingerprintIcon />
                ) : status === 'success' ? (
                  <CheckIcon />
                ) : status === 'error' ? (
                  <XIcon />
                ) : (
                  <BrandLockIcon />
                )}
              </div>

              <div className="min-w-0">
                <div className={`text-[10px] font-medium uppercase tracking-[0.22em] ${headerTone}`}>
                  Secure authorization
                </div>
                <h1 className="mt-2 text-[1.38rem] font-semibold tracking-[-0.035em]">
                  {title}
                </h1>
                <p className={`mt-2 text-sm leading-6 ${headerTone}`}>
                  {description}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <TrustPillBadge label="Passkey Security" icon="passkey" isLightMode={isLightMode} showActivation activationIndex={0} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.16em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
              <TrustPillBadge label="Sovereign Custody" icon="custody" isLightMode={isLightMode} showActivation activationIndex={1} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.16em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
              <TrustPillBadge label="Agent Session" icon="lock" isLightMode={isLightMode} showActivation activationIndex={2} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.16em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
            </div>

            {status === 'sign_pending' && currentSignRequest ? (
              <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3">
                <div className={`rounded-[24px] border p-4 ${surfaceTone}`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                    Message
                  </p>
                  <div className={`mt-2 max-h-32 overflow-auto rounded-[20px] border px-3 py-3 font-mono text-xs leading-5 ${isLightMode ? 'border-[#d7dfed] bg-white/80 text-[#243043]' : 'border-white/10 bg-black/20 text-white/88'}`}>
                    {currentSignRequest.message}
                  </div>
                </div>

                <div className={`rounded-[24px] border p-4 ${surfaceTone}`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                    Requested by
                  </p>
                  <p className="mt-2 text-sm">{callerOriginToLabel(currentSignRequest.origin)}</p>
                  <p className={`mt-1 truncate text-xs ${headerTone}`}>
                    {currentSignRequest.origin}
                  </p>
                </div>

                <div className={`rounded-[22px] border px-4 py-3 text-sm ${isLightMode ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-amber-400/20 bg-amber-500/10 text-amber-100'}`}>
                  Your passkey approval is required before this signature can be released.
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    onClick={handleRejectSign}
                    className={`rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all ${secondaryButtonTone}`}
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleConfirmSign}
                    className={`rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all ${primaryButtonTone}`}
                  >
                    Sign with Passkey
                  </button>
                </div>
              </div>
            ) : status === 'tx_pending' && currentTxRequest ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2.5">
                <div className={`rounded-[20px] border px-4 py-3 ${surfaceTone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                      Amount
                    </p>
                    <p className="font-mono text-sm font-semibold">
                      {formatInjValue(currentTxRequest.tx.value)} INJ
                    </p>
                  </div>
                  <div className="mt-2">
                    <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                      To
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] leading-5">
                      {currentTxRequest.tx.to}
                    </p>
                  </div>
                  {currentTxRequest.tx.data && currentTxRequest.tx.data !== '0x' ? (
                    <div className="mt-2">
                      <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                        Data
                      </p>
                      <div className={`mt-1 max-h-14 overflow-auto rounded-[12px] border px-2.5 py-1.5 font-mono text-[10px] leading-4 ${isLightMode ? 'border-[#d7dfed] bg-white/80 text-[#243043]' : 'border-white/10 bg-black/20 text-white/82'}`}>
                        {currentTxRequest.tx.data}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={`rounded-[20px] border px-4 py-2.5 ${surfaceTone}`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                    Requested by
                  </p>
                  <p className="mt-1 text-xs">{callerOriginToLabel(currentTxRequest.origin)}</p>
                </div>

                <div className={`rounded-[16px] border px-3 py-2 text-xs ${isLightMode ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-amber-400/20 bg-amber-500/10 text-amber-100'}`}>
                  Passkey approval is required to sign this transaction.
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-1 flex-shrink-0">
                  <button
                    onClick={handleRejectTx}
                    className={`rounded-[18px] border px-3 py-2.5 text-sm font-semibold transition-all ${secondaryButtonTone}`}
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleConfirmTx}
                    className={`rounded-[18px] border px-3 py-2.5 text-sm font-semibold transition-all ${primaryButtonTone}`}
                  >
                    Approve with Passkey
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex min-h-0 flex-1 flex-col justify-between gap-4">
                <div className={`rounded-[24px] border p-5 ${surfaceTone}`}>
                  <div className="flex flex-col items-center justify-center gap-4 py-4 text-center">
                    {status === 'waiting' || status === 'processing' ? (
                      <div
                        className={`h-12 w-12 animate-spin rounded-full border-[3px] ${
                          isLightMode
                            ? 'border-[#d5deed] border-t-[#5a4cff]'
                            : 'border-white/10 border-t-white'
                        }`}
                      />
                    ) : status === 'success' ? (
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isLightMode ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/10 text-emerald-200'}`}>
                        <CheckIcon className="h-6 w-6" />
                      </div>
                    ) : status === 'error' ? (
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isLightMode ? 'bg-rose-50 text-rose-700' : 'bg-rose-500/10 text-rose-200'}`}>
                        <XIcon className="h-6 w-6" />
                      </div>
                    ) : (
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isLightMode ? 'bg-white text-[#4f48df]' : 'bg-white/[0.06] text-white'}`}>
                        <BrandLockIcon className="h-6 w-6" />
                      </div>
                    )}

                    <div>
                      <p className="text-base font-semibold">
                        {status === 'waiting'
                          ? 'Initializing secure window'
                          : status === 'processing'
                            ? message || 'Authorizing...'
                            : status === 'success'
                              ? message || 'Authorization complete'
                              : status === 'error'
                                ? 'Authorization failed'
                                : 'Secure session ready'}
                      </p>
                      <p className={`mt-1 text-xs leading-5 ${headerTone}`}>
                        {status === 'error'
                          ? 'Review the alert above and try again.'
                          : status === 'success'
                            ? 'Returning to the compact secure session.'
                            : `Requested by ${callerLabel}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-[24px] border p-4 ${surfaceTone}`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                    Security notice
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    INJ Pass authorizes from a self-custodial wallet secured by passkeys. Your private key never leaves this secure window.
                  </p>
                  {originParam ? (
                    <p className={`mt-2 text-xs ${headerTone}`}>
                      Requested by: {originParam}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes edgeMarqueeX {
          from { transform: translateX(-135%); }
          to { transform: translateX(420%); }
        }

        @keyframes edgeMarqueeXReverse {
          from { transform: translateX(420%); }
          to { transform: translateX(-135%); }
        }

        @keyframes edgeMarqueeY {
          from { transform: translateY(-135%); }
          to { transform: translateY(420%); }
        }

        @keyframes edgeMarqueeYReverse {
          from { transform: translateY(420%); }
          to { transform: translateY(-135%); }
        }

        .edge-marquee-x {
          animation: edgeMarqueeX 9.8s linear infinite;
        }

        .edge-marquee-x-reverse {
          animation: edgeMarqueeXReverse 11.4s linear infinite;
        }

        .edge-marquee-y {
          animation: edgeMarqueeY 10.4s linear infinite;
        }

        .edge-marquee-y-reverse {
          animation: edgeMarqueeYReverse 12.2s linear infinite;
        }
      `}</style>
    </div>
  );
}

export default function AuthPage() {
  return <AuthPageContent />;
}
