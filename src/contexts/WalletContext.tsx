/**
 * Wallet context for global state management
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { LocalKeystore } from '@/types/wallet';
import { loadWallet, hasWallet, deleteWallet } from '@/wallet/keystore';
import {
  hasValidSession,
  isTokenLocallyValid,
  validateAndRefreshSession,
  getAuthToken,
  logout as logoutService,
} from '@/services/passkey';

const LAST_TX_AUTH_KEY = 'injpass_last_tx_auth';
const AUTO_LOCK_KEY = 'auto_lock_minutes';

interface WalletContextType {
  isUnlocked: boolean;
  address: string | null;
  keystore: LocalKeystore | null;
  privateKey: Uint8Array | null;
  isCheckingSession: boolean;
  unlock: (pk: Uint8Array, ks: LocalKeystore) => void;
  lock: () => void;
  logout: () => Promise<void>;
  checkExistingWallet: () => boolean;
  hasValidToken: () => Promise<boolean>;
  /** Extend the PIN-free transaction window (call after each signed tx). */
  resetTxAuth: () => void;
  /** Clear only the signing key from memory (session token stays valid). */
  clearSigningKey: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [keystore, setKeystore] = useState<LocalKeystore | null>(null);
  const [privateKey, setPrivateKey] = useState<Uint8Array | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Check for existing wallet and valid session on mount.
  //
  // Optimistic routing: routing must NOT block on a backend round-trip (that is
  // what made the "Checking local session" screen hang on cold starts). We use a
  // cheap offline JWT expiry check to decide the route instantly, then verify
  // with the backend in the background — the backend stays authoritative.
  useEffect(() => {
    const initSession = async () => {
      const existing = loadWallet();
      if (existing) {
        setKeystore(existing);
        setAddress(existing.address);
      }

      // Local, no-network decision: wallet present + token not yet expired.
      if (existing && isTokenLocallyValid()) {
        setIsUnlocked(true);
      }
      // Unblock routing immediately — no awaiting the network here.
      setIsCheckingSession(false);

      // Background authoritative check (single verify-token round-trip + refresh).
      // Only a definitive `false` (expired/revoked) drops the session, so transient
      // network/cold-start failures don't bounce a legitimately logged-in user.
      if (existing && getAuthToken()) {
        try {
          const valid = await validateAndRefreshSession();
          if (!valid) {
            setPrivateKey(null);
            setIsUnlocked(false);
          }
        } catch (err) {
          console.warn('[WalletContext] Background session validation failed:', err);
        }
      }
    };

    void initSession();
  }, []);

  const resetTxAuth = useCallback(() => {
    localStorage.setItem(LAST_TX_AUTH_KEY, Date.now().toString());
  }, []);

  const clearSigningKey = useCallback(() => {
    setPrivateKey(null);
  }, []);

  const unlock = (pk: Uint8Array, ks: LocalKeystore) => {
    setPrivateKey(pk);
    setKeystore(ks);
    setAddress(ks.address);
    setIsUnlocked(true);
    // Stamp the tx-auth timestamp so the PIN-free window starts now
    localStorage.setItem(LAST_TX_AUTH_KEY, Date.now().toString());
  };

  // Auto-clear signing key when the PIN-free window expires
  useEffect(() => {
    if (!privateKey) return;

    const tick = () => {
      const autoLockMinutes = parseInt(localStorage.getItem(AUTO_LOCK_KEY) ?? '5', 10);
      if (autoLockMinutes <= 0) return; // 0 = never auto-clear
      const lastAuth = parseInt(localStorage.getItem(LAST_TX_AUTH_KEY) ?? '0', 10);
      if (Date.now() - lastAuth > autoLockMinutes * 60 * 1000) {
        setPrivateKey(null); // clear key; isUnlocked / session token unaffected
      }
    };

    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [privateKey]);

  const lock = () => {
    setPrivateKey(null);
    setIsUnlocked(false);
  };

  const logout = async () => {
    await logoutService();
    setPrivateKey(null);
    setIsUnlocked(false);
  };

  const checkExistingWallet = () => {
    return hasWallet();
  };

  const hasValidToken = async () => {
    return await hasValidSession();
  };

  return (
    <WalletContext.Provider
      value={{
        isUnlocked,
        address,
        keystore,
        privateKey,
        isCheckingSession,
        unlock,
        lock,
        logout,
        checkExistingWallet,
        hasValidToken,
        resetTxAuth,
        clearSigningKey,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
