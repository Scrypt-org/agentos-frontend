import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/wallet-auth', () => ({
  authenticateWalletSession: vi.fn(),
}));

vi.mock('@/contexts/PinContext', () => ({
  usePin: vi.fn(),
}));

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

import {
  finishTransactionAuthorization,
  requestTransactionAuthClose,
} from '@/components/TransactionAuthModal';

describe('transaction authorization completion', () => {
  it('returns the exact newly authorized key to the caller', () => {
    const key = Uint8Array.from([1, 2, 3]);
    const rememberKey = vi.fn();
    const resetActivity = vi.fn();
    const onSuccess = vi.fn();

    finishTransactionAuthorization(key, rememberKey, resetActivity, onSuccess);

    expect(rememberKey).toHaveBeenCalledOnce();
    expect(rememberKey.mock.calls[0]?.[0]).toBe(key);
    expect(resetActivity).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0]?.[0]).toBe(key);
  });

  it('does not close from the backdrop while verification is active', () => {
    const onClose = vi.fn();

    requestTransactionAuthClose(true, onClose);
    expect(onClose).not.toHaveBeenCalled();

    requestTransactionAuthClose(false, onClose);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
