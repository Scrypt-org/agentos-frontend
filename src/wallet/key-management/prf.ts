/**
 * WebAuthn PRF–based wallet key derivation (secure scheme, replaces the
 * legacy `privateKey = sha256(credentialId)` brain wallet).
 *
 * The private key is derived from the authenticator's PRF output:
 *   prfOutput = HMAC(authenticator-internal-secret, PRF_SALT)   // never leaves the device
 *   privateKey = HKDF-SHA256(prfOutput, info)                   // secp256k1 key
 *
 * The internal secret is produced only after user verification (biometric) and
 * is NOT derivable from any public value, so the backend / anyone with the
 * (public) credentialId can no longer reconstruct the key.
 *
 * PRF wallets store NO private key in localStorage — the key is re-derived from
 * the authenticator on every unlock.
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { deriveSecp256k1 } from './deriveSecp256k1';
import {
  requestChallenge,
  verifyPasskey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  setAuthToken,
} from '@/services/passkey';
import { saveWallet } from '../keystore/storage';
import { encryptKey } from '../keystore/encryptKey';

/**
 * Fixed application salt fed to the authenticator's PRF. A stable salt yields a
 * stable key, so the same wallet is derived on every device that holds this
 * passkey.
 *
 * ⚠️ Changing PRF_SALT changes EVERY derived wallet address. Never rotate it
 * without a full migration.
 */
const PRF_SALT = sha256(new TextEncoder().encode('inj-pass-wallet-prf-v1'));
const HKDF_INFO_PREFIX = 'inj-pass-evm-secp256k1-v1';

/** Thrown when the device/browser/authenticator does not return a PRF output. */
export class PrfUnsupportedError extends Error {
  constructor(message = 'This device or browser does not support WebAuthn PRF.') {
    super(message);
    this.name = 'PrfUnsupportedError';
  }
}

const prfEvalExtension = () =>
  // `prf` is not in the DOM lib's extension typings yet.
  ({ prf: { eval: { first: PRF_SALT } } }) as unknown as AuthenticationExtensionsClientInputs;

function readPrfFirst(cred: PublicKeyCredential | null): Uint8Array | null {
  if (!cred) return null;
  const ext = cred.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } };
  };
  const first = ext?.prf?.results?.first;
  if (!first) return null;
  return first instanceof ArrayBuffer
    ? new Uint8Array(first)
    : new Uint8Array(
        (first as ArrayBufferView).buffer,
        (first as ArrayBufferView).byteOffset,
        (first as ArrayBufferView).byteLength,
      );
}

function addressesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Older clients hashed the credential-id string exactly as serialized at the
 * time. Try every historical base64/base64url representation and let the
 * immutable backend wallet address select the valid legacy key.
 */
function legacyCredentialIdCandidates(rawId: ArrayBuffer, assertedId: string): string[] {
  const bytes = new Uint8Array(rawId);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  const standardPadded = btoa(binary);
  const standardUnpadded = standardPadded.replace(/=+$/g, '');
  const urlPadded = standardPadded.replace(/\+/g, '-').replace(/\//g, '_');
  const urlUnpadded = urlPadded.replace(/=+$/g, '');

  return [...new Set([assertedId, urlUnpadded, urlPadded, standardUnpadded, standardPadded])];
}

/**
 * Derive a valid secp256k1 private key + address from a raw PRF output via HKDF.
 * Retries with an incrementing counter in the HKDF `info` if a candidate falls
 * outside the secp256k1 valid range (astronomically rare).
 */
export function hkdfToSecp256k1(prfOutput: Uint8Array): {
  privateKey: Uint8Array;
  address: string;
} {
  for (let counter = 0; counter < 256; counter++) {
    const info = new TextEncoder().encode(`${HKDF_INFO_PREFIX}:${counter}`);
    const okm = hkdf(sha256, prfOutput, undefined, info, 32);
    try {
      return deriveSecp256k1(okm); // validates curve range; throws if invalid
    } catch {
      // try the next counter
    }
  }
  throw new Error('Failed to derive a valid secp256k1 key from PRF output');
}

/**
 * Fetch the PRF output for an existing credential via a `get()` ceremony.
 * Uses a client-side random challenge — this assertion is NOT sent to the
 * backend; it only extracts the PRF secret.
 */
async function fetchPrfOutput(credentialIdBuf: ArrayBuffer): Promise<Uint8Array> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credentialIdBuf, type: 'public-key' }],
      timeout: 60000,
      userVerification: 'required',
      extensions: prfEvalExtension(),
    },
  })) as PublicKeyCredential | null;

  const out = readPrfFirst(assertion);
  if (!out) throw new PrfUnsupportedError();
  return out;
}

export interface CreatePrfWalletResult {
  privateKey: Uint8Array;
  address: string;
  credentialId: string;
  walletName?: string;
}

/**
 * Create a new PRF-secured wallet.
 *
 * Throws {@link PrfUnsupportedError} if the authenticator does not yield a PRF
 * output (caller should fall back to the password flow).
 */
export async function createPrfWallet(
  walletName?: string,
  inviteCode?: string,
  options?: { persist?: boolean },
): Promise<CreatePrfWalletResult> {
  // persist=false is used by the legacy-wallet upgrade flow to derive + register
  // a new secure wallet WITHOUT overwriting the still-active old keystore (so the
  // old key stays available to move funds before the switch).
  const persist = options?.persist ?? true;
  // 1. Registration challenge (backend).
  const { challenge, rpId, rpName } = await requestChallenge('register');

  // 2. Create the passkey, requesting the PRF extension.
  const userId = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: base64ToArrayBuffer(challenge),
      rp: { id: rpId, name: rpName },
      user: {
        id: userId,
        name: walletName || 'AgentOS Wallet',
        displayName: walletName || 'AgentOS Wallet',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: true,
        userVerification: 'required',
      },
      // Request PRF. Many platforms only report `enabled` here and require a
      // follow-up get() to actually return the output.
      extensions: { prf: {} } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential || !credential.response) {
    throw new Error('Passkey creation cancelled or failed');
  }

  // 3. Obtain the PRF output: either returned at create time, or via a get().
  let prfOutput = readPrfFirst(credential);
  if (!prfOutput) {
    prfOutput = await fetchPrfOutput(credential.rawId);
  }

  // 4. Derive the wallet key/address from the PRF output.
  const { privateKey, address } = hkdfToSecp256k1(prfOutput);

  // 5. Register the credential + address with the backend (issues a session token).
  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialIdBase64 = arrayBufferToBase64(credential.rawId);
  const verifyResult = await verifyPasskey(
    challenge,
    {
      id: credentialIdBase64,
      rawId: credentialIdBase64,
      response: {
        clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
        attestationObject: arrayBufferToBase64(response.attestationObject),
      },
      type: credential.type,
    },
    address,
    walletName,
    inviteCode,
  );

  if (!verifyResult.success || !verifyResult.credentialId) {
    throw new Error('Passkey verification failed');
  }
  if (verifyResult.token) {
    setAuthToken(verifyResult.token);
  }

  // 6. Persist non-secret metadata only (no private key on disk).
  if (persist) {
    saveWallet({
      address,
      encryptedPrivateKey: '',
      source: 'passkey',
      keyScheme: 'prf-v1',
      credentialId: verifyResult.credentialId,
      createdAt: Date.now(),
      walletName: verifyResult.walletName,
    });
  }

  return {
    privateKey,
    address,
    credentialId: verifyResult.credentialId,
    walletName: verifyResult.walletName,
  };
}

/**
 * Unlock a PRF wallet: one ceremony both authenticates with the backend
 * (refreshes the session token) and yields the PRF secret used to re-derive the
 * private key. Returns the raw private key (use in-memory, never persist).
 */
export async function unlockPrfWallet(credentialId: string): Promise<Uint8Array> {
  const { challenge } = await requestChallenge('authenticate');

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: base64ToArrayBuffer(challenge),
      allowCredentials: [{ id: base64ToArrayBuffer(credentialId), type: 'public-key' }],
      timeout: 60000,
      userVerification: 'required',
      extensions: prfEvalExtension(),
    },
  })) as PublicKeyCredential | null;

  if (!assertion || !assertion.response) {
    throw new Error('Passkey authentication cancelled or failed');
  }

  const response = assertion.response as AuthenticatorAssertionResponse;

  // Authenticate with the backend (session token) using the same assertion.
  const verifyResult = await verifyPasskey(challenge, {
    id: arrayBufferToBase64(assertion.rawId),
    rawId: arrayBufferToBase64(assertion.rawId),
    response: {
      clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64(response.authenticatorData),
      signature: arrayBufferToBase64(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64(response.userHandle) : undefined,
    },
    type: assertion.type,
  });

  if (!verifyResult.success || !verifyResult.verified) {
    throw new Error('Passkey verification failed');
  }
  if (verifyResult.token) {
    setAuthToken(verifyResult.token);
  }

  // Derive the private key from the PRF output (the secret part of this ceremony).
  const prfOutput = readPrfFirst(assertion);
  if (!prfOutput) {
    throw new PrfUnsupportedError(
      'PRF output missing on unlock — authenticator no longer returns PRF.',
    );
  }
  const { privateKey } = hkdfToSecp256k1(prfOutput);
  return privateKey;
}

export interface RecoverWalletResult {
  address: string;
  privateKey: Uint8Array;
  credentialId: string;
  walletName?: string;
  keyScheme: 'prf-v1' | 'legacy-sha256';
}

/**
 * Fresh-device recovery (no local keystore). One passkey ceremony, then the
 * wallet's scheme is auto-detected by matching the derived address against the
 * address the backend has on record for this credential:
 *
 *  1. **PRF (secure)** — re-derive the key directly from the authenticator's PRF
 *     output. Requires the passkey to be present on this device (e.g. synced via
 *     iCloud Keychain / Google Password Manager). This is the trust root; no
 *     server-side key material is involved.
 *  2. **Legacy (insecure, migration only)** — if there is no PRF output or it
 *     doesn't match, fall back to the old `sha256(credentialId)` key. This is
 *     recovered ONLY so the user can open the original wallet and move funds to a
 *     new PRF wallet; the caller should immediately prompt migration.
 *
 * The credential is discoverable (resident key), so no `allowCredentials` is
 * needed — the authenticator lets the user pick the passkey.
 */
export async function recoverWallet(): Promise<RecoverWalletResult> {
  const { challenge } = await requestChallenge('authenticate');

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: base64ToArrayBuffer(challenge),
      timeout: 60000,
      userVerification: 'required',
      // Request PRF; harmless for legacy credentials (they simply return none).
      extensions: prfEvalExtension(),
    },
  })) as PublicKeyCredential | null;

  if (!assertion || !assertion.response) {
    throw new Error('Passkey authentication cancelled or failed');
  }

  const response = assertion.response as AuthenticatorAssertionResponse;
  const credentialId = arrayBufferToBase64(assertion.rawId);

  const verifyResult = await verifyPasskey(challenge, {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64(response.authenticatorData),
      signature: arrayBufferToBase64(response.signature),
      userHandle: response.userHandle
        ? arrayBufferToBase64(response.userHandle)
        : undefined,
    },
    type: assertion.type,
  });

  if (!verifyResult.success || !verifyResult.verified) {
    throw new Error('Passkey verification failed');
  }
  if (verifyResult.token) {
    setAuthToken(verifyResult.token);
  }
  if (!verifyResult.walletAddress) {
    throw new Error('No wallet is associated with this passkey.');
  }
  const walletAddress = verifyResult.walletAddress;

  // 1) Secure path: re-derive from the PRF output and confirm it matches.
  const prfOutput = readPrfFirst(assertion);
  if (prfOutput) {
    const { privateKey, address } = hkdfToSecp256k1(prfOutput);
    if (addressesMatch(address, walletAddress)) {
      saveWallet({
        address,
        encryptedPrivateKey: '',
        source: 'passkey',
        keyScheme: 'prf-v1',
        credentialId,
        createdAt: Date.now(),
        walletName: verifyResult.walletName,
      });
      return {
        address,
        privateKey,
        credentialId,
        walletName: verifyResult.walletName,
        keyScheme: 'prf-v1',
      };
    }
  }

  // 2) Legacy migration fallback: key = sha256(credentialId). Insecure — kept
  //    working only so existing users can open the original wallet and migrate.
  for (const legacyCredentialId of legacyCredentialIdCandidates(assertion.rawId, credentialId)) {
    const legacyEntropy = sha256(new TextEncoder().encode(legacyCredentialId));
    const { privateKey, address } = deriveSecp256k1(legacyEntropy);
    if (!addressesMatch(address, walletAddress)) continue;

    const encryptedPrivateKey = await encryptKey(privateKey, legacyEntropy);
    saveWallet({
      address,
      encryptedPrivateKey,
      source: 'passkey',
      keyScheme: 'legacy-sha256',
      credentialId,
      legacyKeyCredentialId: legacyCredentialId,
      createdAt: Date.now(),
      walletName: verifyResult.walletName,
    });
    return {
      address,
      privateKey,
      credentialId,
      walletName: verifyResult.walletName,
      keyScheme: 'legacy-sha256',
    };
  }

  throw new Error(
    'Could not recover wallet: the derived address does not match the backend record for either scheme.',
  );
}
