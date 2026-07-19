import { describe, expect, it } from 'vitest';

import type { LocalKeystore } from '@/types/wallet';
import { walletAuthorizationCapability } from '@/lib/wallet-authorization';

const wallet = (overrides: Partial<LocalKeystore>): LocalKeystore => ({
  address: '0x0000000000000000000000000000000000000001',
  encryptedPrivateKey: '',
  source: 'import',
  createdAt: 1,
  ...overrides,
});

describe('wallet authorization capability', () => {
  it('allows local mnemonic wallets through password unlock', () => {
    expect(walletAuthorizationCapability(wallet({ keyScheme: 'local-mnemonic-v1' }))).toEqual({
      kind: 'traditional',
      enabled: true,
      label: 'Traditional',
    });
  });

  it('allows legacy passkeys that retain their credential metadata', () => {
    expect(walletAuthorizationCapability(wallet({ keyScheme: 'legacy-sha256', credentialId: 'credential' }))).toEqual({
      kind: 'passkey',
      enabled: true,
      label: 'Passkey',
    });
  });

  it('keeps incomplete legacy passkeys visible as migration required', () => {
    expect(walletAuthorizationCapability(wallet({ keyScheme: 'legacy-sha256' }))).toEqual({
      kind: 'migration-required',
      enabled: false,
      label: 'Migration required',
    });
  });
});
