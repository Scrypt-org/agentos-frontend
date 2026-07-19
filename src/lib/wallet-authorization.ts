import type { LocalKeystore } from '@/types/wallet';

export type WalletAuthorizationCapability =
  | { kind: 'traditional'; enabled: true; label: 'Traditional' }
  | { kind: 'passkey'; enabled: true; label: 'Passkey' | 'Passkey PRF' }
  | { kind: 'migration-required'; enabled: false; label: 'Migration required' };

export function walletAuthorizationCapability(wallet: LocalKeystore): WalletAuthorizationCapability {
  if (wallet.keyScheme === 'local-mnemonic-v1') {
    return { kind: 'traditional', enabled: true, label: 'Traditional' };
  }
  if (wallet.keyScheme === 'prf-v1') {
    return { kind: 'passkey', enabled: true, label: 'Passkey PRF' };
  }
  if (wallet.credentialId) {
    return { kind: 'passkey', enabled: true, label: 'Passkey' };
  }
  return { kind: 'migration-required', enabled: false, label: 'Migration required' };
}
