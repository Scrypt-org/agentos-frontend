import { beforeEach, describe, expect, it } from 'vitest';

import type { LocalKeystore } from '@/types/wallet';
import type { LocalMnemonicVaultV1 } from '@/wallet/key-management/vault';
import { mergeWalletSources } from '@/wallet/keystore/reconcile';
import { loadWallets, saveWallet } from '@/wallet/keystore/storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const legacyMnemonic: LocalKeystore = {
  address: '0x0000000000000000000000000000000000000001',
  encryptedPrivateKey: '',
  source: 'import',
  keyScheme: 'local-mnemonic-v1',
  encryptedMnemonicVault: '{"version":1}',
  createdAt: 1,
  walletName: 'Legacy mnemonic',
};

const prfWallet: LocalKeystore = {
  address: '0x0000000000000000000000000000000000000002',
  encryptedPrivateKey: '',
  source: 'passkey',
  keyScheme: 'prf-v1',
  credentialId: 'credential-2',
  createdAt: 2,
  walletName: 'PRF wallet',
};

const encryptedVault: LocalMnemonicVaultV1 = {
  version: 1,
  keyScheme: 'local-mnemonic-v1',
  address: legacyMnemonic.address,
  ciphertext: 'ciphertext',
  iv: 'iv',
  salt: 'salt',
  kdf: { name: 'pbkdf2-sha256', iterations: 600_000, outputLength: 32 },
  cipher: { name: 'AES-GCM', keyLength: 256, tagLength: 128 },
  createdAt: 1,
  updatedAt: 2,
};

describe('wallet storage migration', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('preserves the legacy active wallet when a new wallet is saved', () => {
    localStorage.setItem('injective-pass-wallet', JSON.stringify(legacyMnemonic));

    saveWallet(prfWallet);

    expect(loadWallets().map((wallet) => wallet.address)).toEqual([
      prfWallet.address,
      legacyMnemonic.address,
    ]);
  });

  it('reconstructs a missing mnemonic keystore without decrypting its vault', () => {
    const result = mergeWalletSources([prfWallet], prfWallet, [encryptedVault]);

    expect(result).toContainEqual(expect.objectContaining({
      address: encryptedVault.address,
      keyScheme: 'local-mnemonic-v1',
      encryptedMnemonicVault: JSON.stringify(encryptedVault),
    }));
  });

  it('keeps the complete indexed record when its encrypted vault is also present', () => {
    const result = mergeWalletSources([legacyMnemonic], legacyMnemonic, [encryptedVault]);

    expect(result).toHaveLength(1);
    expect(result[0].walletName).toBe('Legacy mnemonic');
  });
});
