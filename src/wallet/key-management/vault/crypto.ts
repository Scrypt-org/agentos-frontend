import { base64ToBytes, bytesToBase64 } from './base64';
import { deriveVaultKey, VAULT_KDF } from './kdf';
import type { EncryptedVaultPayload, LocalMnemonicVaultV1 } from './types';

const CIPHER = { name: 'AES-GCM' as const, keyLength: 256 as const, tagLength: 128 as const };

function vaultAad(address: string): Uint8Array {
  return new TextEncoder().encode(`inj-pass|local-mnemonic-v1|${address.toLowerCase()}`);
}

export async function encryptMnemonic(params: {
  mnemonic: string;
  password: string;
  address: string;
}): Promise<EncryptedVaultPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = await deriveVaultKey(params.password, salt);
  const plaintext = new TextEncoder().encode(params.mnemonic.normalize('NFKD'));
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: vaultAad(params.address) as BufferSource,
        tagLength: CIPHER.tagLength,
      },
      key,
      plaintext as BufferSource,
    );
    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt),
      kdf: VAULT_KDF,
      cipher: CIPHER,
    };
  } finally {
    keyBytes.fill(0);
    plaintext.fill(0);
  }
}

export async function decryptMnemonic(
  vault: LocalMnemonicVaultV1,
  password: string,
): Promise<string> {
  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const ciphertext = base64ToBytes(vault.ciphertext);
  const keyBytes = await deriveVaultKey(password, salt, vault.kdf);
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: vaultAad(vault.address) as BufferSource,
        tagLength: vault.cipher.tagLength,
      },
      key,
      ciphertext as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Unable to unlock this wallet. Check your password.');
  } finally {
    keyBytes.fill(0);
  }
}
