import type { LocalKeystore } from '@/types/wallet';
import { loadWallet, saveWallet } from '../keystore/storage';
import { decryptText } from '../keystore/encryptKey';
import { unlockByPasskey } from './createByPasskey';
import { mnemonicToAccount } from 'viem/accounts';
import { getLocalWalletMnemonic } from './unlockLocalMnemonicWallet';

export async function revealWalletMnemonic(
  keystore: LocalKeystore,
  options?: { password?: string },
): Promise<string> {
  if (keystore.keyScheme === 'local-mnemonic-v1') {
    if (!options?.password) {
      throw new Error('Enter this wallet\'s local password to view the recovery phrase.');
    }
    return getLocalWalletMnemonic(keystore, options.password);
  }

  if (!keystore.credentialId || !keystore.encryptedMnemonic) {
    throw new Error('This wallet was not created with a recovery phrase.');
  }

  const entropy = await unlockByPasskey(keystore.credentialId);
  const mnemonic = await decryptText(keystore.encryptedMnemonic, entropy);
  const derivedAddress = mnemonicToAccount(mnemonic).address.toLowerCase();
  if (derivedAddress !== keystore.address.toLowerCase()) {
    throw new Error('Recovery phrase verification failed.');
  }
  return mnemonic;
}

export function markMnemonicBackedUp(expectedAddress: string): number {
  const current = loadWallet();
  if (!current || current.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('The active wallet changed during backup.');
  }

  const backedUpAt = Date.now();
  saveWallet({
    ...current,
    encryptedMnemonic: current.keyScheme === 'local-mnemonic-v1'
      ? current.encryptedMnemonic
      : undefined,
    mnemonicBackedUpAt: backedUpAt,
    mnemonicBackupConfirmed: true,
  });
  return backedUpAt;
}
