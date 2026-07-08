'use client';

import { useEffect, useRef, useState } from 'react';
import TunnelBackground from '@/components/TunnelBackground';
import TrustPillBadge from '@/components/TrustPillBadge';
import WelcomeThemeIconButton from '@/components/WelcomeThemeIconButton';
import { WalletErrorToast } from '@/components/WalletErrorToast';
import { useTheme } from '@/contexts/ThemeContext';
import { useWalletErrorToast } from '@/lib/useWalletErrorToast';
import { importPrivateKey } from '@/wallet/key-management';
import { encryptKey, decryptKey, loadWallet, saveWallet } from '@/wallet/keystore';
import { unlockWalletKey } from '@/wallet/key-management';
import { sendTransaction } from '@/wallet/chain/evm/sendTransaction';
import type { Address } from 'viem';

const KNOWN_ORIGINS = [
  'https://hash-mahjong-two.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

type Step = 'loading' | 'unlock' | 'import' | 'connected' | 'signing';

interface SignRequest {
  id: string;
  to: string;
  value: string;
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

function WalletIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" d="M4 7.5A2.5 2.5 0 016.5 5h10" />
      <path strokeLinecap="round" d="M19.5 8H7a3 3 0 000 6h12.5" />
      <path strokeLinecap="round" d="M19 8.2V18a2 2 0 01-2 2H6.8A2.8 2.8 0 014 17.2V7.8A2.8 2.8 0 016.8 5H17a2 2 0 012 2v1.2Z" />
      <circle cx="16.1" cy="11" r="0.8" fill="currentColor" stroke="none" />
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

function ShieldIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 5-3.4 8-7 10-3.6-2-7-5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.3 12.1l1.8 1.8 3.8-4.1" />
    </svg>
  );
}

function ArrowRightIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 6l6 6-6 6" />
    </svg>
  );
}

function EyeIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

function EyeOffIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" d="M3 3l18 18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.8 5.5A10.2 10.2 0 0112 5.3c6 0 9.5 6 9.5 6a17.2 17.2 0 01-3.6 4.3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 14.7a3 3 0 01-4.1-4.1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8.2A17.1 17.1 0 002.5 12s3.5 6 9.5 6c1 0 2-.2 2.8-.4" />
    </svg>
  );
}

function truncateAddress(value: string, start = 10, end = 8) {
  if (!value) return '';
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function callerOriginToLabel(origin: string) {
  if (!origin || origin === '*') {
    return 'Connected app';
  }

  try {
    return new URL(origin).hostname;
  } catch {
    return 'Connected app';
  }
}

export default function ConnectPage() {
  const { theme } = useTheme();
  const isLightMode = theme === 'light';

  const [step, setStep] = useState<Step>('loading');
  const [callerOrigin, setCallerOrigin] = useState('*');
  const [address, setAddress] = useState('');
  const [signRequest, setSignRequest] = useState<SignRequest | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [walletSource, setWalletSource] = useState<'passkey' | 'import' | null>(null);
  const [pkInput, setPkInput] = useState('');
  const [showPk, setShowPk] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [importPasswordConfirm, setImportPasswordConfirm] = useState('');
  const [importStep, setImportStep] = useState<'key' | 'password'>('key');
  const { errorToast, showErrorToast, dismissErrorToast } = useWalletErrorToast();

  const privateKeyRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const explicitOrigin = params.get('origin');
    const fallbackOrigin = document.referrer
      ? new URL(document.referrer).origin
      : '*';
    const nextOrigin = explicitOrigin || fallbackOrigin;

    if (nextOrigin && nextOrigin !== window.location.origin) {
      setCallerOrigin(nextOrigin);
    }

    const keystore = loadWallet();
    if (keystore) {
      setWalletSource(keystore.source as 'passkey' | 'import');
      setStep('unlock');
    } else {
      setStep('import');
    }
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'INJPASS_SIGN_TX') return;
      if (!KNOWN_ORIGINS.includes(event.origin) && event.origin !== callerOrigin) return;

      setSignRequest({
        id: event.data.id,
        to: event.data.to,
        value: event.data.value,
      });
      setStep('signing');
      setStatusMsg('');
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [callerOrigin]);

  const postToOpener = (message: object) => {
    window.opener?.postMessage(message, callerOrigin === '*' ? '*' : callerOrigin);
  };

  const afterAuth = (privateKey: Uint8Array, nextAddress: string) => {
    privateKeyRef.current = privateKey;
    setAddress(nextAddress);
    setStatusMsg('');
    setStep('connected');
    postToOpener({ type: 'INJPASS_CONNECTED', address: nextAddress });
  };

  const handlePasskeyUnlock = async () => {
    dismissErrorToast(true);
    setLoading(true);

    try {
      const keystore = loadWallet();
      if (!keystore?.credentialId) {
        throw new Error('No passkey found');
      }

      const privateKey = await unlockWalletKey(keystore);
      afterAuth(privateKey, keystore.address);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Authentication failed';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUnlock = async () => {
    if (!password) return;

    dismissErrorToast(true);
    setLoading(true);

    try {
      const keystore = loadWallet();
      if (!keystore) {
        throw new Error('No wallet found');
      }

      const rawEntropy = new TextEncoder().encode(password);
      const entropy = new Uint8Array(Math.max(rawEntropy.length, 32));
      entropy.set(rawEntropy);
      const privateKey = await decryptKey(keystore.encryptedPrivateKey, entropy);
      afterAuth(privateKey, keystore.address);
    } catch {
      showErrorToast('Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  const handleImportKey = async () => {
    if (!pkInput.trim() || !importPassword || importPassword !== importPasswordConfirm) {
      return;
    }

    dismissErrorToast(true);
    setLoading(true);

    try {
      const { privateKey, address: nextAddress } = importPrivateKey(pkInput.trim());
      const rawEntropy = new TextEncoder().encode(importPassword);
      const entropy = new Uint8Array(Math.max(rawEntropy.length, 32));
      entropy.set(rawEntropy);
      const encryptedPrivateKey = await encryptKey(privateKey, entropy);

      saveWallet({
        address: nextAddress,
        encryptedPrivateKey,
        source: 'import',
        createdAt: Date.now(),
        walletName: 'INJ Pass',
      });

      afterAuth(privateKey, nextAddress);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid key';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!signRequest || !privateKeyRef.current) return;

    setLoading(true);
    setStatusMsg('Broadcasting transaction...');

    try {
      const txHash = await sendTransaction(
        privateKeyRef.current,
        signRequest.to as Address,
        signRequest.value
      );

      postToOpener({ type: 'INJPASS_TX_RESULT', id: signRequest.id, txHash });
      setStatusMsg('Execution complete');
      setSignRequest(null);
      setStep('connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postToOpener({ type: 'INJPASS_TX_RESULT', id: signRequest.id, error: message });
      showErrorToast(message);
      setStatusMsg('');
      setStep('connected');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = () => {
    if (!signRequest) return;
    postToOpener({ type: 'INJPASS_TX_RESULT', id: signRequest.id, error: 'User rejected' });
    setSignRequest(null);
    setStep('connected');
    setStatusMsg('');
  };

  const callerLabel = callerOriginToLabel(callerOrigin);
  const pageTone = isLightMode
    ? 'bg-[#e9eff7] text-[#171b24]'
    : 'bg-[#020202] text-white';
  const headerTone = isLightMode ? 'text-[#59657a]' : 'text-white/58';
  const cardTone = isLightMode
    ? 'border-[#cad7eb] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(242,246,252,0.88))] text-[#171b24] shadow-[0_32px_100px_rgba(98,110,132,0.18)]'
    : 'border-white/10 bg-[linear-gradient(180deg,rgba(21,16,30,0.9),rgba(8,8,14,0.95))] text-white shadow-[0_40px_120px_rgba(5,4,8,0.58)]';
  const surfaceTone = isLightMode
    ? 'border-[#d6dfed] bg-white/74'
    : 'border-white/10 bg-white/[0.05]';
  const inputTone = isLightMode
    ? 'border-[#d4deec] bg-white/80 text-[#171b24] placeholder:text-[#7f8aa0]'
    : 'border-white/10 bg-white/[0.05] text-white placeholder:text-white/30';
  const secondaryButtonTone = isLightMode
    ? 'border-[#cfd8ea] bg-white/76 text-[#2c394d] hover:bg-white'
    : 'border-white/10 bg-white/[0.06] text-white/84 hover:bg-white/[0.1]';
  const primaryButtonTone = isLightMode
    ? 'border-[#c9d5e8] bg-[linear-gradient(180deg,#ffffff_0%,#eef4fb_100%)] text-[#243043] hover:brightness-[1.02]'
    : 'border-[#d0b7ff]/24 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.08))] text-white hover:bg-white/[0.15]';

  const title =
    step === 'loading'
      ? 'Opening secure session'
      : step === 'unlock'
        ? walletSource === 'passkey'
          ? 'Enter your INJ Pass'
          : 'Unlock local session'
        : step === 'import'
          ? importStep === 'key'
            ? 'Bring an existing wallet'
            : 'Set a local password'
          : step === 'connected'
            ? 'INJ Pass is ready'
            : 'Approve transaction';

  const description =
    step === 'loading'
      ? 'Preparing the secure connector window and restoring your INJ Pass context.'
      : step === 'unlock'
        ? walletSource === 'passkey'
          ? 'Approve the passkey request to reopen the paired wallet in this browser session.'
          : 'Use the local password tied to this imported wallet before continuing.'
        : step === 'import'
          ? importStep === 'key'
            ? 'Paste a private key to continue from an existing wallet in this secure connector flow.'
            : 'This password only protects the imported wallet inside this browser session.'
          : step === 'connected'
            ? `Your wallet is connected. Keep this window open for requests from ${callerLabel}.`
            : `Review the request from ${callerLabel} before authorizing the next onchain action.`;

  return (
    <div className={`relative min-h-screen overflow-hidden transition-colors duration-500 ${pageTone}`}>
      <TunnelBackground mode={theme} />
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
        <div className={`absolute left-0 top-0 h-full w-px overflow-hidden ${isLightMode ? 'opacity-65' : 'opacity-50'}`}>
          <span className={`edge-marquee-y absolute left-0 top-0 h-[28%] w-full ${isLightMode ? 'bg-[linear-gradient(180deg,transparent,rgba(121,88,255,0.68),rgba(255,138,177,0.28),transparent)]' : 'bg-[linear-gradient(180deg,transparent,rgba(179,123,255,0.72),rgba(255,123,170,0.28),transparent)]'}`} />
        </div>
        <div className={`absolute right-0 top-0 h-full w-px overflow-hidden ${isLightMode ? 'opacity-55' : 'opacity-50'}`}>
          <span className={`edge-marquee-y-reverse absolute left-0 top-0 h-[30%] w-full ${isLightMode ? 'bg-[linear-gradient(180deg,transparent,rgba(255,140,173,0.3),rgba(121,88,255,0.64),transparent)]' : 'bg-[linear-gradient(180deg,transparent,rgba(255,129,166,0.32),rgba(174,131,255,0.68),transparent)]'}`} />
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-0 ${
          isLightMode
            ? 'bg-[radial-gradient(circle_at_14%_18%,rgba(147,114,255,0.13),transparent_28%),radial-gradient(circle_at_84%_16%,rgba(255,126,175,0.1),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(233,239,247,0.32)_40%,rgba(233,239,247,0.82))]'
            : 'bg-[radial-gradient(circle_at_14%_18%,rgba(144,92,255,0.16),transparent_28%),radial-gradient(circle_at_84%_16%,rgba(255,102,168,0.11),transparent_24%),linear-gradient(180deg,rgba(7,8,14,0.16),rgba(2,2,2,0.78))]'
        }`}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
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

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-5xl items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="w-full max-w-[31rem]">
          <div className={`relative overflow-hidden rounded-[32px] border p-5 backdrop-blur-2xl transition-colors duration-500 sm:p-6 ${cardTone}`}>
            <div
              className={`absolute inset-0 ${
                isLightMode
                  ? 'bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,118,168,0.08),transparent_36%)]'
                  : 'bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,118,168,0.09),transparent_36%)]'
              }`}
            />

            <div className="relative z-10">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border ${
                    isLightMode
                      ? 'border-[#d4deed] bg-white/82 text-[#4f48df]'
                      : 'border-white/10 bg-white/[0.06] text-white'
                  }`}
                >
                  {step === 'signing' ? (
                    <SparkIcon />
                  ) : step === 'connected' ? (
                    <ShieldIcon />
                  ) : step === 'import' ? (
                    <WalletIcon />
                  ) : step === 'unlock' && walletSource === 'passkey' ? (
                    <FingerprintIcon />
                  ) : (
                    <BrandLockIcon />
                  )}
                </div>

                <div className="min-w-0">
                  <div className={`text-[10px] font-medium uppercase tracking-[0.22em] ${headerTone}`}>
                    Secure connector
                  </div>
                  <h1 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.035em] sm:text-[1.55rem]">
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

              <div className="mt-5">
                {step === 'loading' ? (
                  <div className={`rounded-[24px] border p-5 ${surfaceTone}`}>
                    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                      <div
                        className={`h-10 w-10 animate-spin rounded-full border-[3px] ${
                          isLightMode
                            ? 'border-[#d5deed] border-t-[#5a4cff]'
                            : 'border-white/10 border-t-white'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-semibold">Preparing INJ Pass</p>
                        <p className={`mt-1 text-xs leading-5 ${headerTone}`}>
                          Restoring wallet state and connector permissions.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 'unlock' ? (
                  <div className="space-y-3">
                    <div className={`rounded-[24px] border p-4 ${surfaceTone}`}>
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border ${
                            isLightMode
                              ? 'border-[#d7dfed] bg-white/85 text-[#4f48df]'
                              : 'border-white/10 bg-white/[0.05] text-white'
                          }`}
                        >
                          {walletSource === 'passkey' ? <FingerprintIcon className="h-[18px] w-[18px]" /> : <WalletIcon className="h-[18px] w-[18px]" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {walletSource === 'passkey' ? 'Paired passkey session' : 'Imported local wallet'}
                          </p>
                          <p className={`mt-1 text-xs leading-5 ${headerTone}`}>
                            {walletSource === 'passkey'
                              ? 'Approve the secure passkey prompt to continue into the connected wallet.'
                              : 'Unlock the locally imported wallet before reviewing requests.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {walletSource === 'passkey' ? (
                      <button
                        onClick={handlePasskeyUnlock}
                        disabled={loading}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-[22px] border px-4 py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${primaryButtonTone}`}
                      >
                        {loading ? (
                          <>
                            <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-current/25 border-t-current" />
                            Authenticating...
                          </>
                        ) : (
                          <>
                            <FingerprintIcon className="h-[18px] w-[18px]" />
                            Authenticate with Passkey
                          </>
                        )}
                      </button>
                    ) : (
                      <>
                        <input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              handlePasswordUnlock();
                            }
                          }}
                          placeholder="Wallet password"
                          className={`w-full rounded-[20px] border px-4 py-3 text-sm outline-none transition-all focus:border-[#9f8cff] ${inputTone}`}
                          autoFocus
                        />
                        <button
                          onClick={handlePasswordUnlock}
                          disabled={loading || !password}
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-[22px] border px-4 py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${primaryButtonTone}`}
                        >
                          {loading ? 'Unlocking...' : 'Unlock session'}
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => {
                        setImportStep('key');
                        setStep('import');
                      }}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all ${secondaryButtonTone}`}
                    >
                      <WalletIcon className="h-[18px] w-[18px]" />
                      Import a different wallet
                    </button>
                  </div>
                ) : null}

                {step === 'import' ? (
                  <div className="space-y-3">
                    {importStep === 'key' ? (
                      <>
                        <div className={`rounded-[24px] border p-4 ${surfaceTone}`}>
                          <p className="text-sm font-semibold">Private key</p>
                          <p className={`mt-1 text-xs leading-5 ${headerTone}`}>
                            The key stays inside this secure connector session and is only used locally.
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type={showPk ? 'text' : 'password'}
                            value={pkInput}
                            onChange={(event) => setPkInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && pkInput.trim()) {
                                setImportStep('password');
                              }
                            }}
                            placeholder="Private key (hex)"
                            className={`min-w-0 flex-1 rounded-[20px] border px-4 py-3 text-sm font-mono outline-none transition-all focus:border-[#9f8cff] ${inputTone}`}
                            autoFocus
                          />
                          <button
                            onClick={() => setShowPk((value) => !value)}
                            className={`inline-flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-[20px] border transition-all ${secondaryButtonTone}`}
                            aria-label={showPk ? 'Hide private key' : 'Show private key'}
                          >
                            {showPk ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            setImportStep('password');
                          }}
                          disabled={!pkInput.trim()}
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-[22px] border px-4 py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${primaryButtonTone}`}
                        >
                          Continue
                          <ArrowRightIcon />
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="password"
                          value={importPassword}
                          onChange={(event) => setImportPassword(event.target.value)}
                          placeholder="Password (min 8 chars)"
                          className={`w-full rounded-[20px] border px-4 py-3 text-sm outline-none transition-all focus:border-[#9f8cff] ${inputTone}`}
                          autoFocus
                        />
                        <input
                          type="password"
                          value={importPasswordConfirm}
                          onChange={(event) => setImportPasswordConfirm(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              handleImportKey();
                            }
                          }}
                          placeholder="Confirm password"
                          className={`w-full rounded-[20px] border px-4 py-3 text-sm outline-none transition-all focus:border-[#9f8cff] ${inputTone}`}
                        />

                        {importPassword && importPasswordConfirm && importPassword !== importPasswordConfirm ? (
                          <div
                            className={`rounded-[20px] border px-4 py-3 text-sm ${
                              isLightMode
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-amber-400/20 bg-amber-500/10 text-amber-100'
                            }`}
                          >
                            Passwords do not match.
                          </div>
                        ) : null}

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            onClick={() => setImportStep('key')}
                            className={`inline-flex items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all ${secondaryButtonTone}`}
                          >
                            Back
                          </button>
                          <button
                            onClick={handleImportKey}
                            disabled={loading || !importPassword || importPassword !== importPasswordConfirm}
                            className={`inline-flex items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${primaryButtonTone}`}
                          >
                            {loading ? 'Importing...' : 'Open wallet'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {step === 'connected' ? (
                  <div className="space-y-3">
                    <div className={`rounded-[24px] border p-5 ${surfaceTone}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-[16px] border ${
                            isLightMode
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-emerald-400/24 bg-emerald-500/10 text-emerald-200'
                          }`}
                        >
                          <ShieldIcon className="h-[18px] w-[18px]" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Connected session</p>
                          <p className={`mt-1 text-xs leading-5 ${headerTone}`}>
                            This secure window remains active for new requests.
                          </p>
                        </div>
                      </div>

                      <div className={`mt-4 rounded-[20px] border px-4 py-3 ${isLightMode ? 'border-[#d7dfed] bg-white/80' : 'border-white/10 bg-black/20'}`}>
                        <p className={`text-[10px] uppercase tracking-[0.2em] ${headerTone}`}>
                          Wallet address
                        </p>
                        <p className="mt-1 break-all font-mono text-sm">
                          {address}
                        </p>
                      </div>
                    </div>

                    {statusMsg ? (
                      <div
                        className={`rounded-[20px] border px-4 py-3 text-sm ${
                          isLightMode
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                        }`}
                      >
                        {statusMsg}
                      </div>
                    ) : null}

                    <p className={`text-center text-xs leading-5 ${headerTone}`}>
                      Waiting for transaction requests from {callerLabel}.
                    </p>
                  </div>
                ) : null}

                {step === 'signing' && signRequest ? (
                  <div className="space-y-3">
                    <div className={`rounded-[24px] border p-4 ${surfaceTone}`}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className={`text-[10px] uppercase tracking-[0.18em] ${headerTone}`}>
                            Destination
                          </span>
                          <span className="max-w-[15rem] break-all text-right font-mono text-xs">
                            {signRequest.to}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className={`text-[10px] uppercase tracking-[0.18em] ${headerTone}`}>
                            Amount
                          </span>
                          <span className="text-sm font-semibold">{signRequest.value} INJ</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className={`text-[10px] uppercase tracking-[0.18em] ${headerTone}`}>
                            Session
                          </span>
                          <span className="text-xs">{truncateAddress(address)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={handleReject}
                        disabled={loading}
                        className={`inline-flex items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${secondaryButtonTone}`}
                      >
                        Reject
                      </button>
                      <button
                        onClick={handleSign}
                        disabled={loading}
                        className={`inline-flex items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${primaryButtonTone}`}
                      >
                        {loading ? 'Sending...' : 'Confirm'}
                      </button>
                    </div>

                    <p className={`text-center text-xs leading-5 ${headerTone}`}>
                      Your private key remains inside this secure INJ Pass window.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
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
