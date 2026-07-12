export type WalletSource = 'passkey' | 'nfc' | 'import';

/**
 * How the wallet's private key is protected/derived:
 * - 'prf-v1'        : derived from the WebAuthn PRF output (secure, keyless on disk).
 * - 'legacy-sha256' : private key encrypted under sha256(credentialId) — the old,
 *                     insecure brain-wallet scheme. Absent field is treated as this.
 * - 'local-mnemonic-v1': a BIP39 mnemonic encrypted in IndexedDB with a user password.
 */
export type KeyScheme = 'legacy-sha256' | 'prf-v1' | 'local-mnemonic-v1';

export interface LocalKeystore {
  address: string; // 0x... or inj...
  encryptedPrivateKey: string; // "iv:tag:encrypted" format; empty for prf-v1 (no key on disk)
  source: WalletSource;
  keyScheme?: KeyScheme; // undefined = legacy-sha256 (back-compat)
  credentialId?: string; // Passkey only
  nfcUID?: string; // NFC only
  createdAt: number; // Unix timestamp
  walletName?: string; // Display name for the wallet
  encryptedMnemonic?: string; // Present only until a new wallet completes backup verification
  mnemonicBackedUpAt?: number;
  mnemonicBackupConfirmed?: boolean;
}

export interface Wallet {
  address: string;
  privateKey: Uint8Array;
  source: WalletSource;
}

export interface EncryptedData {
  iv: string; // hex
  tag: string; // hex
  encrypted: string; // hex
}
