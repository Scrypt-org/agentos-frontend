export interface LocalMnemonicVaultV1 {
  version: 1;
  keyScheme: 'local-mnemonic-v1';
  address: string;
  ciphertext: string;
  iv: string;
  salt: string;
  kdf: {
    name: 'pbkdf2-sha256';
    iterations: number;
    outputLength: number;
  };
  cipher: {
    name: 'AES-GCM';
    keyLength: 256;
    tagLength: 128;
  };
  createdAt: number;
  updatedAt: number;
}

export type EncryptedVaultPayload = Pick<
  LocalMnemonicVaultV1,
  'ciphertext' | 'iv' | 'salt' | 'kdf' | 'cipher'
>;
