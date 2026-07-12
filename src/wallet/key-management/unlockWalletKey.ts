/**
 * Single entry point to obtain a passkey wallet's private key, routed by the
 * keystore's `keyScheme`. Callers replace the old
 * `unlockByPasskey(credentialId)` + `decryptKey(...)` pair with this.
 *
 * - 'prf-v1'        : derive the key from the WebAuthn PRF output (one ceremony,
 *                     also refreshes the backend session). No on-disk key.
 * - legacy/sha256   : authenticate, then decrypt the stored key with
 *                     sha256(credentialId) entropy (insecure scheme, kept working
 *                     for existing wallets until the user upgrades).
 *
 * Import (password) wallets are NOT handled here — they need an interactive
 * password and keep their own per-page handler.
 */

import type { LocalKeystore } from '@/types/wallet';
import { unlockByPasskey } from './createByPasskey';
import { unlockPrfWallet } from './prf';
import { decryptKey } from '../keystore/encryptKey';
import { unlockLocalMnemonicWallet } from './unlockLocalMnemonicWallet';
import { deriveSecp256k1 } from './deriveSecp256k1';

export class PasswordRequiredError extends Error {
  constructor() {
    super('Enter this wallet\'s local password to continue.');
    this.name = 'PasswordRequiredError';
  }
}

function assertExpectedAddress(privateKey: Uint8Array, expectedAddress: string): Uint8Array {
  const { address } = deriveSecp256k1(privateKey);
  if (address.trim().toLowerCase() !== expectedAddress.trim().toLowerCase()) {
    throw new Error('Unlocked key does not match the wallet address. Recovery is required.');
  }
  return privateKey;
}

export async function unlockWalletKey(
  keystore: LocalKeystore,
  options?: { password?: string },
): Promise<Uint8Array> {
  if (keystore.keyScheme === 'local-mnemonic-v1') {
    if (!options?.password) throw new PasswordRequiredError();
    return assertExpectedAddress(
      await unlockLocalMnemonicWallet(keystore, options.password),
      keystore.address,
    );
  }

  if (!keystore.credentialId) {
    throw new Error('This wallet has no passkey credential to unlock with.');
  }

  if (keystore.keyScheme === 'prf-v1') {
    return assertExpectedAddress(await unlockPrfWallet(keystore.credentialId), keystore.address);
  }

  // Legacy passkey wallet: authenticate, then decrypt with sha256(credentialId).
  await unlockByPasskey(keystore.credentialId);
  const legacyKeyCredentialId = keystore.legacyKeyCredentialId ?? keystore.credentialId;
  const { sha256 } = await import('@noble/hashes/sha2.js');
  const entropy = sha256(new TextEncoder().encode(legacyKeyCredentialId));
  return assertExpectedAddress(
    await decryptKey(keystore.encryptedPrivateKey, entropy),
    keystore.address,
  );
}
