import { PrivateKey } from '@injectivelabs/sdk-ts';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { deriveSecp256k1, fromHex } from './deriveSecp256k1';

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function generateStandardMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

export function deriveInjectiveWalletFromMnemonic(mnemonic: string): {
  privateKey: Uint8Array;
  address: string;
} {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('Invalid recovery phrase. Check all 24 words and try again.');
  }
  const privateKeyHex = PrivateKey.fromMnemonic(normalized).toPrivateKeyHex().replace(/^0x/, '');
  return deriveSecp256k1(fromHex(privateKeyHex));
}
