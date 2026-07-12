import type { LocalKeystore } from '@/types/wallet';
import { saveWallet } from '../keystore/storage';
import {
  deriveInjectiveWalletFromMnemonic,
  generateStandardMnemonic,
  isValidMnemonic,
  normalizeMnemonic,
} from './mnemonic';
import { encryptMnemonic, putVault } from './vault';
import type { LocalMnemonicVaultV1 } from './vault';

export interface CreateMnemonicVaultResult {
  address: string;
  privateKey: Uint8Array;
  keyScheme: 'local-mnemonic-v1';
  mnemonicForBackup: string;
}

function validatePassword(password: string): void {
  if (password.length < 10) {
    throw new Error('Use at least 10 characters for the local wallet password.');
  }
}

async function persistMnemonicWallet(params: {
  mnemonic: string;
  password: string;
  walletName?: string;
}): Promise<CreateMnemonicVaultResult> {
  validatePassword(params.password);
  const mnemonic = normalizeMnemonic(params.mnemonic);
  const { privateKey, address } = deriveInjectiveWalletFromMnemonic(mnemonic);
  const encrypted = await encryptMnemonic({ mnemonic, password: params.password, address });
  const now = Date.now();
  const vault: LocalMnemonicVaultV1 = {
    version: 1,
    keyScheme: 'local-mnemonic-v1',
    address,
    ...encrypted,
    createdAt: now,
    updatedAt: now,
  };

  await putVault(vault);
  const keystore: LocalKeystore = {
    address,
    encryptedPrivateKey: '',
    source: 'import',
    keyScheme: 'local-mnemonic-v1',
    mnemonicBackupConfirmed: false,
    createdAt: now,
    walletName: params.walletName || 'My INJ Pass',
  };
  saveWallet(keystore);

  return {
    address,
    privateKey,
    keyScheme: 'local-mnemonic-v1',
    mnemonicForBackup: mnemonic,
  };
}

export function completeLocalWalletSetup(params: {
  password: string;
  walletName?: string;
}): Promise<CreateMnemonicVaultResult> {
  return persistMnemonicWallet({
    mnemonic: generateStandardMnemonic(),
    password: params.password,
    walletName: params.walletName,
  });
}

export function importMnemonicWallet(params: {
  mnemonic: string;
  password: string;
  walletName?: string;
}): Promise<CreateMnemonicVaultResult> {
  if (!isValidMnemonic(params.mnemonic)) {
    throw new Error('Invalid recovery phrase. Check all 24 words and try again.');
  }
  return persistMnemonicWallet(params);
}
