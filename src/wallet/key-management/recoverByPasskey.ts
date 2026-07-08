/**
 * Recover wallet address using Passkey authentication
 * This allows users to retrieve their wallet address from the backend
 * even if localStorage is cleared
 */

import {
  requestChallenge,
  verifyPasskey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  setAuthToken,
} from '@/services/passkey';

export interface RecoverByPasskeyResult {
  walletAddress: string;
  credentialId: string;
  walletName?: string;
}

/**
 * Recover wallet address by authenticating with Passkey
 * 
 * Flow:
 * 1. Request authentication challenge
 * 2. Get WebAuthn assertion (user authenticates with Passkey)
 * 3. Verify with backend
 * 4. Backend returns the wallet address associated with the credential
 * 
 * Note: This only recovers the wallet ADDRESS, not the private key.
 * The private key remains encrypted in localStorage or needs to be
 * re-created using the same passkey derivation method.
 */
export async function recoverWalletAddress(): Promise<RecoverByPasskeyResult> {
  try {
    // 1. Request authentication challenge
    const { challenge } = await requestChallenge('authenticate');

    // 2. Get WebAuthn assertion (without specifying allowCredentials)
    // This allows the authenticator to show all available passkeys
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64ToArrayBuffer(challenge),
        timeout: 60000,
        userVerification: 'required',
        // Don't specify allowCredentials to let user choose from available passkeys
      },
    }) as PublicKeyCredential | null;

    if (!assertion || !assertion.response) {
      throw new Error('Passkey authentication cancelled or failed');
    }

    const response = assertion.response as AuthenticatorAssertionResponse;

    // 3. Verify with backend
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

    // Save auth token
    if (verifyResult.token) {
      setAuthToken(verifyResult.token);
    }

    // 4. Get wallet address from backend response
    if (!verifyResult.walletAddress) {
      throw new Error('Wallet address not found in backend. This passkey may not have a wallet associated with it.');
    }

    return {
      walletAddress: verifyResult.walletAddress,
      credentialId: arrayBufferToBase64(assertion.rawId),
      walletName: verifyResult.walletName,
    };
  } catch (error) {
    throw new Error(
      `Failed to recover wallet address: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * @deprecated Use `recoverWallet` from `./prf` instead. That unified entry point
 * does a single passkey ceremony and auto-detects the scheme (PRF re-derivation
 * for secure wallets, sha256 fallback only for legacy migration). This function
 * ONLY handles the insecure legacy `sha256(credentialId)` scheme and would
 * silently produce a wrong key/address for a PRF wallet; kept for back-compat.
 *
 * Recover full wallet (address + encrypted private key) using Passkey.
 *
 * This function:
 * 1. Authenticates with passkey
 * 2. Gets wallet address from backend
 * 3. Re-derives the private key using the legacy sha256(credentialId) method
 * 4. Re-creates the encrypted keystore
 * 5. Saves to localStorage
 */
export async function recoverFullWallet(): Promise<
  RecoverByPasskeyResult & { address: string; privateKey: Uint8Array }
> {
  try {
    const { deriveSecp256k1 } = await import('./deriveSecp256k1');
    const { encryptKey } = await import('../keystore/encryptKey');
    const { saveWallet } = await import('../keystore/storage');
    const { sha256 } = await import('@noble/hashes/sha2.js');
    
    // 1. Authenticate and get wallet address from backend
    const { requestChallenge, verifyPasskey, arrayBufferToBase64, base64ToArrayBuffer, setAuthToken } = await import('@/services/passkey');
    
    const { challenge } = await requestChallenge('authenticate');

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64ToArrayBuffer(challenge),
        timeout: 60000,
        userVerification: 'required',
      },
    }) as PublicKeyCredential | null;

    if (!assertion || !assertion.response) {
      throw new Error('Passkey authentication cancelled or failed');
    }

    const response = assertion.response as AuthenticatorAssertionResponse;
    const credentialIdBase64 = arrayBufferToBase64(assertion.rawId);

    const verifyResult = await verifyPasskey(challenge, {
      id: credentialIdBase64,
      rawId: credentialIdBase64,
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

    if (!verifyResult.walletAddress) {
      throw new Error('Wallet address not found in backend');
    }

    // 2. Re-derive private key from credentialId (same as creation)
    const credentialIdBytes = new TextEncoder().encode(credentialIdBase64);
    const walletEntropy = sha256(credentialIdBytes);
    const { privateKey, address } = deriveSecp256k1(walletEntropy);

    // 3. Verify that derived address matches backend address
    if (address !== verifyResult.walletAddress) {
      throw new Error('Derived wallet address does not match backend record. This should not happen.');
    }

    // 4. Re-encrypt private key with same entropy
    const encryptionEntropy = walletEntropy;
    const encryptedPrivateKey = await encryptKey(privateKey, encryptionEntropy);

    // 5. Save to localStorage
    const keystore = {
      address,
      encryptedPrivateKey,
      source: 'passkey' as const,
      credentialId: credentialIdBase64,
      createdAt: Date.now(),
      walletName: verifyResult.walletName,
    };

    saveWallet(keystore);

    return {
      walletAddress: address,
      credentialId: credentialIdBase64,
      address,
      walletName: verifyResult.walletName,
      // Returned so the caller can unlock immediately without a second passkey
      // ceremony. Use in-memory and discard; never persist or log.
      privateKey,
    };
  } catch (error) {
    throw new Error(
      `Failed to recover wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
