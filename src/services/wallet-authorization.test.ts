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

  it.each([
    { keyScheme: 'legacy-sha256' as const, credentialId: 'credential' },
    { keyScheme: undefined, credentialId: 'credential' },
  ])('allows and labels legacy Passkeys: $keyScheme', (overrides) => {
    expect(walletAuthorizationCapability(wallet(overrides))).toEqual({
      kind: 'passkey',
      enabled: true,
      label: 'Legacy Passkey',
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
