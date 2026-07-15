import { describe, expect, it } from 'vitest';

import {
  getMiniAppFrameKey,
  getMiniAppSessionAddress,
} from './mini-app-session';

describe('getMiniAppSessionAddress', () => {
  it('hides a cached address until the wallet is authenticated', () => {
    expect(getMiniAppSessionAddress(false, '0xabc')).toBeNull();
  });

  it('returns the authenticated wallet address', () => {
    expect(getMiniAppSessionAddress(true, '0xabc')).toBe('0xabc');
  });

  it('returns null when no wallet address exists', () => {
    expect(getMiniAppSessionAddress(true, null)).toBeNull();
  });
});

describe('getMiniAppFrameKey', () => {
  it('does not depend on the current wallet address', () => {
    expect(getMiniAppFrameKey('eric-mfer', 2)).toBe('eric-mfer-2');
  });
});
