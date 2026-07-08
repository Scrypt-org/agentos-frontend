'use client';

import { useEffect, useRef, useState } from 'react';
import { usePin } from '@/contexts/PinContext';
import { useWallet } from '@/contexts/WalletContext';

interface TransactionAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transactionType: 'send' | 'swap' | 'chance';
  variant?: 'modal' | 'inline';
}

export default function TransactionAuthModal({
  isOpen,
  onClose,
  onSuccess,
  transactionType,
  variant = 'modal',
}: TransactionAuthModalProps) {
  const { defaultAuthMethod, verifyPin, resetActivity } = usePin();
  const { keystore, privateKey, unlock } = useWallet();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const requiresPasskeyUnlock = !privateKey;

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError('');
      setVerifying(false);
      return;
    }

    if (!requiresPasskeyUnlock && defaultAuthMethod === 'pin') {
      window.requestAnimationFrame(() => {
        pinInputRef.current?.focus();
      });
      return;
    }

    window.requestAnimationFrame(() => {
      primaryActionRef.current?.focus();
    });
  }, [defaultAuthMethod, isOpen, requiresPasskeyUnlock]);

  useEffect(() => {
    if (!isOpen || variant !== 'modal') return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, variant]);

  if (!isOpen && variant === 'modal') return null;

  const handlePinVerify = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const isValid = await verifyPin(pin);
      if (isValid) {
        resetActivity();
        onSuccess();
        setPin('');
      } else {
        setError('Incorrect PIN');
      }
    } catch {
      setError('Failed to verify PIN');
    } finally {
      setVerifying(false);
    }
  };

  const handlePasskeyVerify = async () => {
    setVerifying(true);
    setError('');

    try {
      const { unlockWalletKey } = await import('@/wallet/key-management');

      if (!keystore?.credentialId) {
        throw new Error('No passkey found');
      }

      const decryptedPrivateKey = await unlockWalletKey(keystore);
      unlock(decryptedPrivateKey, keystore);
      resetActivity();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify passkey');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerify = () => {
    if (!requiresPasskeyUnlock && defaultAuthMethod === 'pin') {
      handlePinVerify();
    } else {
      handlePasskeyVerify();
    }
  };

  const authCard = (
      <div
        className="bg-black border border-white/10 rounded-2xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-auth-modal-title"
        tabIndex={-1}
      >
        <div className="p-5 border-b border-white/5">
          <h3 id="tx-auth-modal-title" className="text-lg font-bold text-white">
            Verify {transactionType === 'send' ? 'Send' : transactionType === 'swap' ? 'Swap' : 'Chance Purchase'} Transaction
          </h3>
        </div>
        
        <div className="p-5 space-y-4">
          {/* Info message */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-400">
              {requiresPasskeyUnlock
                ? 'Your signing key needs to be re-unlocked with Passkey before this transaction can proceed'
                : defaultAuthMethod === 'pin' 
                  ? 'Enter your 6-digit PIN to authorize this transaction'
                  : 'Use your biometric authentication to authorize this transaction'
              }
            </p>
          </div>

          {defaultAuthMethod === 'pin' && !requiresPasskeyUnlock && (
            <div>
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                Enter PIN
              </label>
              <input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-all text-center text-2xl tracking-widest font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pin.length === 6) {
                    handleVerify();
                  }
                }}
              />
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={verifying}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/10 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              ref={primaryActionRef}
              onClick={handleVerify}
              disabled={verifying || (defaultAuthMethod === 'pin' && !requiresPasskeyUnlock && pin.length !== 6)}
              className="flex-1 py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {verifying ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Verifying...
                </>
              ) : (
                requiresPasskeyUnlock ? 'Unlock with Passkey' : 'Verify'
              )}
            </button>
          </div>
        </div>
      </div>
  );

  if (variant === 'inline') {
    return (
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center p-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onClose}
        />
        <div
          className={`relative w-full max-w-md transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isOpen ? 'translate-y-0 scale-100' : 'translate-y-4 scale-[0.97]'
          }`}
        >
          {authCard}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      {authCard}
    </div>
  );
}
