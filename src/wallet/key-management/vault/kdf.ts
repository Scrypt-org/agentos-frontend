export const VAULT_KDF = {
  name: 'pbkdf2-sha256' as const,
  iterations: 600_000,
  outputLength: 32,
};

export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  kdf = VAULT_KDF,
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password.normalize('NFKD'));
  try {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBytes as BufferSource,
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: kdf.iterations,
        hash: 'SHA-256',
      },
      baseKey,
      kdf.outputLength * 8,
    );
    return new Uint8Array(bits);
  } finally {
    passwordBytes.fill(0);
  }
}
