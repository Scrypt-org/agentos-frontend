import type { LocalKeystore } from '@/types/wallet';
import { saveWallet } from '../keystore/storage';
import { deriveInjectiveWalletFromMnemonic } from './mnemonic';
import { decryptMnemonic, getVault, putVault } from './vault';
import type { LocalMnemonicVaultV1 } from './vault';

export class LocalVaultMissingError extends Error {
  constructor() {
    super('The encrypted wallet copy is missing on this device. This can happen after browser data is cleared or when AgentOS is opened from a different local address. Recover it with the 24-word phrase.');
    this.name = 'LocalVaultMissingError';
  }
}

function readKeystoreVaultBackup(keystore: LocalKeystore): LocalMnemonicVaultV1 | null {
  if (!keystore.encryptedMnemonicVault) return null;
  try {
    const vault = JSON.parse(keystore.encryptedMnemonicVault) as Partial<LocalMnemonicVaultV1>;
    if (
      vault.version !== 1
      || vault.keyScheme !== 'local-mnemonic-v1'
      || typeof vault.address !== 'string'
      || vault.address.toLowerCase() !== keystore.address.toLowerCase()
      || typeof vault.ciphertext !== 'string'
      || typeof vault.iv !== 'string'
      || typeof vault.salt !== 'string'
      || vault.kdf?.name !== 'pbkdf2-sha256'
      || vault.cipher?.name !== 'AES-GCM'
    ) {
      return null;
    }
    return vault as LocalMnemonicVaultV1;
  } catch {
    return null;
  }
}

export async function getLocalWalletMnemonic(
  keystore: LocalKeystore,
  password: string,
): Promise<string> {
  let vault = await getVault(keystore.address).catch(() => null);
  const backupVault = readKeystoreVaultBackup(keystore);
  if (!vault && backupVault) {
    vault = backupVault;
    await putVault(backupVault).catch(() => undefined);
  }
  if (!vault) throw new LocalVaultMissingError();

  if (!keystore.encryptedMnemonicVault) {
    try {
      saveWallet({ ...keystore, encryptedMnemonicVault: JSON.stringify(vault) });
    } catch {
      // IndexedDB still contains the authoritative encrypted copy. A failed
      // redundancy update must not prevent the user from unlocking it.
    }
  }
  return decryptMnemonic(vault, password);
}

export async function unlockLocalMnemonicWallet(
  keystore: LocalKeystore,
  password: string,
): Promise<Uint8Array> {
  const mnemonic = await getLocalWalletMnemonic(keystore, password);
  const derived = deriveInjectiveWalletFromMnemonic(mnemonic);
  if (derived.address.toLowerCase() !== keystore.address.toLowerCase()) {
    throw new Error('The encrypted wallet does not match this local wallet record.');
  }
  return derived.privateKey;
}
