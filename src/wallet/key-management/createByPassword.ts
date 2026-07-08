/**
 * Password-encrypted wallet creation — the fallback used ONLY when the device /
 * browser does not support WebAuthn PRF. Generates a fresh random private key
 * and encrypts it under the user's password (same keystore format the existing
 * import / password-unlock flow uses, so `handleUnlockPassword` can open it).
 *
 * NOTE: security here rests entirely on password strength + the keystore KDF
 * (currently PBKDF2; hardening tracked as a follow-up). Not registered with the
 * backend (source: 'import'), so no server session / points integration.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { deriveSecp256k1 } from './deriveSecp256k1';
import { encryptKey } from '../keystore/encryptKey';
import { saveWallet } from '../keystore/storage';

export interface CreateByPasswordResult {
  privateKey: Uint8Array;
  address: string;
}

/** Mirror the existing import/unlock password→entropy mapping (pad to >=32 bytes). */
function passwordEntropy(password: string): Uint8Array {
  const raw = new TextEncoder().encode(password);
  const entropy = new Uint8Array(Math.max(raw.length, 32));
  entropy.set(raw);
  return entropy;
}

export async function createByPassword(
  walletName: string,
  password: string,
): Promise<CreateByPasswordResult> {
  const privateKey = secp256k1.utils.randomSecretKey();
  const { address } = deriveSecp256k1(privateKey);
  const encryptedPrivateKey = await encryptKey(privateKey, passwordEntropy(password));

  saveWallet({
    address,
    encryptedPrivateKey,
    source: 'import',
    createdAt: Date.now(),
    walletName,
  });

  return { privateKey, address };
}
