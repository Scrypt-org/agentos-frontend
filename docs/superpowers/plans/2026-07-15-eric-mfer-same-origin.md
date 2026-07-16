# Eric mfer Same-Origin Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the built-in eric mfer mini app load from the active INJ Pass origin in local, test, and production environments without changing external mini-app routing.

**Architecture:** Add a declarative `sameOrigin` capability to `MiniAppManifest`. Central URL and origin resolvers will use the browser's current origin for such manifests, while preserving the existing development and directory-override precedence for external apps.

**Tech Stack:** Next.js 16, TypeScript, Vitest, URL API

## Global Constraints

- Eric mfer remains mounted at `/mini-apps/eric-mfer`.
- Same-origin routing must ignore stale dApp-directory URL overrides in the browser.
- External mini apps must continue honoring valid directory URL overrides.
- No NFT contract, mint eligibility, metadata, voucher, or deployment-alias behavior changes are included.

---

### Task 1: Same-origin URL and origin resolution

**Files:**
- Create: `src/config/mini-apps.test.ts`
- Modify: `src/config/mini-apps.ts:5-138`

**Interfaces:**
- Consumes: `resolveMiniAppBase(manifest, baseOverride)`, `resolveMiniAppUrl(manifest, path, baseOverride)`, and `isAllowedMiniAppOrigin(manifest, origin, baseOverride)`.
- Produces: optional `MiniAppManifest.sameOrigin?: boolean` and same-origin-aware behavior in the existing resolver APIs.

- [ ] **Step 1: Write failing resolver tests**

Create `src/config/mini-apps.test.ts` with tests that stub a production browser origin, assert eric mfer resolves to that origin despite a conflicting `https://injpass.com` override, assert that origin is allowed for connector messaging, and assert an external manifest still resolves to its override.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMiniAppManifest,
  isAllowedMiniAppOrigin,
  resolveMiniAppUrl,
  type MiniAppManifest,
} from './mini-apps';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('mini app URL resolution', () => {
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

    expect(isAllowedMiniAppOrigin(manifest!, 'https://inj-pass-frontend-test.vercel.app', 'https://injpass.com')).toBe(true);
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

    expect(new URL(resolveMiniAppUrl(external, '/', 'https://directory.example')).origin).toBe('https://directory.example');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- src/config/mini-apps.test.ts`

Expected: the first two tests fail because eric mfer currently resolves and validates against `https://injpass.com` instead of the active browser origin.

- [ ] **Step 3: Implement the minimal manifest and resolver change**

Add `sameOrigin?: boolean` to `MiniAppManifest`, set it to `true` on eric mfer, and introduce a browser-origin helper used by both URL and allowed-origin resolution.

```ts
export interface MiniAppManifest {
  appId: string;
  slug: string;
  name: string;
  developmentUrl?: string;
  productionUrl: string;
  entryPath?: string;
  networkName: string;
  chainId: number;
  rpcUrl: string;
  permissions: readonly MiniAppPermission[];
  allowedContracts?: readonly Address[];
  sameOrigin?: boolean;
}

function getBrowserOrigin(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

export function resolveMiniAppBase(manifest: MiniAppManifest, baseOverride?: string): string {
  const browserOrigin = getBrowserOrigin();
  if (manifest.sameOrigin && browserOrigin) return browserOrigin;
  if (process.env.NODE_ENV === 'development' && manifest.developmentUrl) return manifest.developmentUrl;
  if (isValidHttpUrl(baseOverride)) return baseOverride;
  return manifest.productionUrl;
}
```

Include the browser origin in `isAllowedMiniAppOrigin` only when `manifest.sameOrigin` is true.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test -- src/config/mini-apps.test.ts`

Expected: 3 tests pass with no failures.

- [ ] **Step 5: Commit the focused change**

```bash
git add src/config/mini-apps.ts src/config/mini-apps.test.ts
git commit -m "fix: keep first-party mini apps on host origin"
```

### Task 2: Regression and build verification

**Files:**
- Verify: `src/config/mini-apps.ts`
- Verify: `src/config/mini-apps.test.ts`

**Interfaces:**
- Consumes: same-origin resolver behavior from Task 1.
- Produces: verified local, test-deployment, and production-safe routing behavior.

- [ ] **Step 1: Run the complete automated test suite**

Run: `pnpm test`

Expected: all Vitest files and tests pass.

- [ ] **Step 2: Run TypeScript checking**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0 with no diagnostics.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: Next.js exits with code 0 and includes `/mini-apps/eric-mfer` in the build output.

- [ ] **Step 4: Verify local host resolution through a real browser**

Start the backend on port 3000 and frontend on an available port such as 3001. Open the frontend, launch eric mfer, and verify the iframe URL uses the frontend origin and displays the mint page instead of the backend 404 response.

- [ ] **Step 5: Review the final diff and status**

Run: `git diff HEAD^ -- src/config/mini-apps.ts src/config/mini-apps.test.ts && git status --short`

Expected: only the intended resolver and test changes are in the feature commit; unrelated pre-existing working-tree changes remain untouched.
