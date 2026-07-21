import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMiniAppManifest,
  isAllowedMiniAppOrigin,
  resolveMiniAppAgentUrl,
  resolveMiniAppUrl,
  type MiniAppManifest,
} from '@/config/mini-apps';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('mini app URL resolution', () => {
  it('registers the AI Token lottery as a same-origin read-only app', () => {
    expect(getMiniAppManifest('ai-token-lottery')).toMatchObject({
      sameOrigin: true,
      entryPath: '/mini-apps/ai-token-lottery',
      permissions: ['accounts', 'read'],
    });
  });

  it('registers INJ Gift on Injective EVM Mainnet', () => {
    const manifest = getMiniAppManifest('inj-gift');
    expect(manifest).not.toBeNull();
    expect(manifest).toMatchObject({
      chainId: 1776,
      permissions: ['accounts', 'read', 'sign', 'transactions'],
    });
    expect(manifest!.rpcUrl).toContain('evm-rpc.injective.network');
    expect(manifest!.allowedContracts).toEqual([
      '0x5373A185ee8017eeDD8bF51C009f5A1F058A8D02',
    ]);
  });

  it('keeps eric mfer on the active INJ Pass origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3001' } });
    const manifest = getMiniAppManifest('eric-mfer');
    expect(manifest).not.toBeNull();

    const url = new URL(resolveMiniAppUrl(manifest!, undefined, 'https://injpass.com'));

    expect(url.origin).toBe('http://localhost:3001');
    expect(url.pathname).toBe('/mini-apps/eric-mfer');
    expect(url.searchParams.get('injpass_host_origin')).toBe('http://localhost:3001');
  });

  it('allows the active origin for same-origin connector messages', () => {
    vi.stubGlobal('window', { location: { origin: 'https://inj-pass-frontend-test.vercel.app' } });
    const manifest = getMiniAppManifest('eric-mfer');

    expect(isAllowedMiniAppOrigin(
      manifest!,
      'https://inj-pass-frontend-test.vercel.app',
      'https://injpass.com',
    )).toBe(true);
  });

  it('preserves directory overrides for external mini apps', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('window', { location: { origin: 'https://inj-pass-frontend-test.vercel.app' } });
    const external: MiniAppManifest = {
      appId: 'external',
      slug: 'external',
      name: 'External',
      productionUrl: 'https://fallback.example',
      networkName: 'Test',
      chainId: 1,
      rpcUrl: 'https://rpc.example',
      permissions: ['read'],
    };

    expect(new URL(resolveMiniAppUrl(external, '/', 'https://directory.example')).origin)
      .toBe('https://directory.example');
  });

  it('falls back to the manifest URL for invalid external overrides', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const external: MiniAppManifest = {
      appId: 'external',
      slug: 'external',
      name: 'External',
      productionUrl: 'https://fallback.example',
      networkName: 'Test',
      chainId: 1,
      rpcUrl: 'https://rpc.example',
      permissions: ['read'],
    };

    expect(new URL(resolveMiniAppUrl(external, '/', 'not-a-url')).origin)
      .toBe('https://fallback.example');
  });

  it('uses the registered Omisper URL for AI Chat commands', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('window', { location: { origin: 'https://injpass.com' } });
    const manifest = getMiniAppManifest('omisper');
    expect(manifest).not.toBeNull();

    const resolved = resolveMiniAppAgentUrl(manifest!, [
      { id: 'omisper', url: 'https://omisper-front.pages.dev' },
    ]);

    expect(new URL(resolved.src).origin).toBe('https://omisper-front.pages.dev');
    expect(resolved.baseOverride).toBe('https://omisper-front.pages.dev');
  });

  it('falls back to the deployed Omisper Pages origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('window', { location: { origin: 'https://www.injpass.com' } });
    const manifest = getMiniAppManifest('omisper');

    const resolved = resolveMiniAppAgentUrl(manifest!, []);

    expect(new URL(resolved.src).origin).toBe('https://omisper-front.pages.dev');
  });
});
