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

export async function unlockWalletKey(keystore: LocalKeystore): Promise<Uint8Array> {
  if (!keystore.credentialId) {
    throw new Error('This wallet has no passkey credential to unlock with.');
  }

  if (keystore.keyScheme === 'prf-v1') {
    return unlockPrfWallet(keystore.credentialId);
  }

  // Legacy passkey wallet: authenticate, then decrypt with sha256(credentialId).
  const entropy = await unlockByPasskey(keystore.credentialId);
  return decryptKey(keystore.encryptedPrivateKey, entropy);
}
