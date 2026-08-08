import type { LocalKeystore } from '@/types/wallet';
import { saveWallet } from '../keystore/storage';
import {
  deriveInjectiveWalletFromMnemonic,
  generateStandardMnemonic,
  isValidMnemonic,
  normalizeMnemonic,
} from './mnemonic';
import { deleteVault, encryptMnemonic, getVault, putVault } from './vault';
import type { LocalMnemonicVaultV1 } from './vault';

export interface CreateMnemonicVaultResult {
  address: string;
  privateKey: Uint8Array;
  keyScheme: 'local-mnemonic-v1';
  mnemonicForBackup: string;
}

export interface PreparedMnemonicWallet {
  address: string;
  mnemonic: string;
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

  let indexedDbPersisted = false;
  try {
    await putVault(vault);
    indexedDbPersisted = Boolean(await getVault(address));
  } catch {
    // The serialized encrypted copy below is sufficient to unlock the wallet
    // when IndexedDB is unavailable or being migrated.
  }
  const keystore: LocalKeystore = {
    address,
    encryptedPrivateKey: '',
    source: 'import',
    keyScheme: 'local-mnemonic-v1',
    encryptedMnemonicVault: JSON.stringify(vault),
    mnemonicBackupConfirmed: false,
    createdAt: now,
    walletName: params.walletName || 'My AgentOS',
  };
  try {
    saveWallet(keystore);
  } catch (error) {
    if (indexedDbPersisted) await deleteVault(address).catch(() => undefined);
    throw error;
  }

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
  mnemonic?: string;
}): Promise<CreateMnemonicVaultResult> {
  return persistMnemonicWallet({
    mnemonic: params.mnemonic || generateStandardMnemonic(),
    password: params.password,
    walletName: params.walletName,
  });
}

export function prepareLocalWalletSetup(): PreparedMnemonicWallet {
  const mnemonic = generateStandardMnemonic();
  const { address } = deriveInjectiveWalletFromMnemonic(mnemonic);
  return { address, mnemonic };
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
