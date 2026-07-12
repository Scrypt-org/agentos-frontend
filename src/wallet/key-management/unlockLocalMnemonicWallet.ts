import type { LocalKeystore } from '@/types/wallet';
import { deriveInjectiveWalletFromMnemonic } from './mnemonic';
import { decryptMnemonic, getVault } from './vault';

export class LocalVaultMissingError extends Error {
  constructor() {
    super('The encrypted wallet vault is missing on this device. Recover it with the 24-word phrase or remove this local record.');
    this.name = 'LocalVaultMissingError';
  }
}

export async function getLocalWalletMnemonic(
  keystore: LocalKeystore,
  password: string,
): Promise<string> {
  const vault = await getVault(keystore.address);
  if (!vault) throw new LocalVaultMissingError();
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
