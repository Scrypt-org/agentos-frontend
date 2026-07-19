import { describe, expect, it } from 'vitest';

import type { LocalKeystore } from '@/types/wallet';
import type { RecoverWalletResult } from '@/wallet/key-management';
import { recoverPasskeyForAuthorization } from './auth-passkey-recovery';

const address = '0x0000000000000000000000000000000000001234';

function storedWallet(keyScheme: 'prf-v1' | 'legacy-sha256'): LocalKeystore {
  return {
    address,
    encryptedPrivateKey: keyScheme === 'prf-v1' ? '' : 'ciphertext',
    source: 'passkey',
    keyScheme,
    credentialId: 'credential',
    createdAt: 1,
  };
}

function recovered(privateKey: Uint8Array): RecoverWalletResult {
  return {
    address: address.toUpperCase(),
    privateKey,
    credentialId: 'credential',
    walletName: 'Recovered wallet',
    keyScheme: 'legacy-sha256',
  };
}

describe('recoverPasskeyForAuthorization', () => {
  it.each(['prf-v1', 'legacy-sha256'] as const)(
    'returns the stored %s keystore and zeroes the recovery key',
    async (keyScheme) => {
      const privateKey = new Uint8Array([1, 2, 3]);
      const wallet = storedWallet(keyScheme);

      await expect(recoverPasskeyForAuthorization({
        recover: async () => ({ ...recovered(privateKey), keyScheme }),
        loadWallets: () => [wallet],
      })).resolves.toBe(wallet);

      expect(privateKey).toEqual(new Uint8Array([0, 0, 0]));
    },
  );

  it('zeroes the recovery key before failing when no saved keystore is found', async () => {
    const privateKey = new Uint8Array([9, 8, 7]);

    await expect(recoverPasskeyForAuthorization({
      recover: async () => recovered(privateKey),
      loadWallets: () => [],
    })).rejects.toThrow('The Passkey was verified but its wallet metadata was not saved.');

    expect(privateKey).toEqual(new Uint8Array([0, 0, 0]));
  });
});
