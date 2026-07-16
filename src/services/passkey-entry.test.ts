import { describe, expect, it, vi } from 'vitest';

import type { LocalKeystore } from '@/types/wallet';
import type { RecoverWalletResult } from '@/wallet/key-management';
import { enterExistingPasskey } from './passkey-entry';

const recoveredPrivateKey = new Uint8Array([1, 2, 3]);

function recoveredWallet(keyScheme: RecoverWalletResult['keyScheme']): RecoverWalletResult {
  return {
    address: '0x1234',
    privateKey: recoveredPrivateKey,
    credentialId: 'credential-from-ceremony',
    walletName: 'Recovered wallet',
    keyScheme,
  };
}

function storedWallet(): LocalKeystore {
  return {
    address: '0x1234',
    encryptedPrivateKey: '',
    source: 'passkey',
    keyScheme: 'legacy-sha256',
    credentialId: 'stale-credential',
    createdAt: 1,
  };
}

describe('enterExistingPasskey', () => {
  it.each(['prf-v1', 'legacy-sha256'] as const)(
    'preserves the detected %s scheme when unlocking the recovered wallet',
    async (keyScheme) => {
      const unlock = vi.fn();

      const result = await enterExistingPasskey({
        recover: async () => recoveredWallet(keyScheme),
        loadRecoveredWallet: storedWallet,
        unlock,
      });

      expect(result.keyScheme).toBe(keyScheme);
      expect(unlock).toHaveBeenCalledWith(recoveredPrivateKey, expect.objectContaining({
        keyScheme,
        credentialId: 'credential-from-ceremony',
      }));
    },
  );

  it('fails clearly when recovery does not produce a stored wallet', async () => {
    await expect(enterExistingPasskey({
      recover: async () => recoveredWallet('prf-v1'),
      loadRecoveredWallet: () => null,
      unlock: vi.fn(),
    })).rejects.toThrow('The Passkey was verified but the wallet could not be recovered.');
  });
});
