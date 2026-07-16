/**
 * AES-256-GCM encryption for wallet private keys
 * 
 * Key derivation: uses PBKDF2 with user-provided entropy (from Passkey/NFC/password)
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * Derive encryption key from entropy using PBKDF2
 */
async function deriveKey(entropy: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    entropy as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt private key using AES-256-GCM
 * 
 * @param privateKey - Raw private key (32 bytes)
 * @param entropy - Entropy from Passkey/NFC/password (32 bytes minimum)
 * @returns Encrypted string in format "salt:iv:tag:encrypted" (all hex)
 */
async function encryptBytes(
  value: Uint8Array,
  entropy: Uint8Array
): Promise<string> {
  try {
    if (entropy.length < 32) {
      throw new Error('Entropy must be at least 32 bytes');
    }

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive encryption key
    const key = await deriveKey(entropy, salt);

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv: iv as BufferSource },
      key,
      value as BufferSource
    );

    // Extract tag (last 16 bytes of GCM output)
    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = encryptedArray.slice(0, -16);
    const tag = encryptedArray.slice(-16);

    // Convert to hex and format
    return [
      toHex(salt),
      toHex(iv),
      toHex(tag),
      toHex(ciphertext),
    ].join(':');
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function encryptKey(
  privateKey: Uint8Array,
  entropy: Uint8Array
): Promise<string> {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  return encryptBytes(privateKey, entropy);
}

export async function encryptText(value: string, entropy: Uint8Array): Promise<string> {
  return encryptBytes(new TextEncoder().encode(value), entropy);
}

/**
 * Decrypt private key using AES-256-GCM
 * 
 * @param encryptedData - Encrypted string in format "salt:iv:tag:encrypted"
 * @param entropy - Same entropy used for encryption
 * @returns Decrypted private key (32 bytes)
 */
async function decryptBytes(
  encryptedData: string,
  entropy: Uint8Array
): Promise<Uint8Array> {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltHex, ivHex, tagHex, encryptedHex] = parts;

    // Convert from hex
    const salt = fromHex(saltHex);
    const iv = fromHex(ivHex);
    const tag = fromHex(tagHex);
    const ciphertext = fromHex(encryptedHex);

    // Derive decryption key
    const key = await deriveKey(entropy, salt);

    // Combine ciphertext and tag for GCM
    const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
    encryptedWithTag.set(ciphertext, 0);
    encryptedWithTag.set(tag, ciphertext.length);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv as BufferSource },
      key,
      encryptedWithTag as BufferSource
    );

    return new Uint8Array(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Invalid key or corrupted data'}`);
  }
}

export async function decryptKey(
  encryptedData: string,
  entropy: Uint8Array
): Promise<Uint8Array> {
  const value = await decryptBytes(encryptedData, entropy);
  if (value.length !== 32) {
    throw new Error('Decrypted private key must be 32 bytes');
  }
  return value;
}

export async function decryptText(encryptedData: string, entropy: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await decryptBytes(encryptedData, entropy));
}

// Utility functions
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) {
    throw new Error('Invalid hex string');
  }
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}
