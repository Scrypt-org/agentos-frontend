# INJ Gift Mainnet MiniApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the production INJ Gift miniApp to create红包 transactions through INJ Pass on Injective EVM Mainnet.

**Architecture:** Treat the mini-app manifest as the host-side authority for chain and contract permissions. Change only the INJ Gift manifest from Testnet to Mainnet and make its fallback allowlisted contract match the deployed Mainnet contract.

**Tech Stack:** TypeScript, Next.js, viem, Vitest

## Global Constraints

- Work only on `inj-pass-frontend/dev`.
- Preserve existing uncommitted changes in `app/auth/page.tsx`, `src/lib/auth-bridge.ts`, `src/lib/auth-bridge.test.ts`, and `src/services/passkey.ts`.
- INJ Gift Mainnet chain ID is `1776`.
- INJ Gift Mainnet fallback contract is `0x294cDD0Ac5B2ef8b23E2dc3A993E133356Ee72D5`.
- Keep `accounts`, `read`, `sign`, and `transactions` permissions.

---

### Task 1: Lock the INJ Gift manifest to Mainnet

**Files:**
- Modify: `src/services/mini-app-config.test.ts`
- Modify: `src/config/mini-apps.ts`

**Interfaces:**
- Consumes: `getMiniAppManifest('inj-gift')` and `NETWORK_CONFIG.mainnet`.
- Produces: an INJ Gift manifest with Mainnet chain/RPC and the Mainnet contract allowlist.

- [ ] **Step 1: Write the failing manifest regression test**

```ts
it('registers INJ Gift on Injective EVM Mainnet', () => {
  const manifest = getMiniAppManifest('inj-gift');
  expect(manifest).not.toBeNull();
  expect(manifest).toMatchObject({
    chainId: 1776,
    permissions: ['accounts', 'read', 'sign', 'transactions'],
  });
  expect(manifest!.networkName.toLowerCase()).toContain('mainnet');
  expect(manifest!.rpcUrl).toContain('evm-rpc.injective.network');
  expect(manifest!.allowedContracts).toEqual([
    '0x294cDD0Ac5B2ef8b23E2dc3A993E133356Ee72D5',
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/services/mini-app-config.test.ts`

Expected: FAIL because the manifest currently reports chain ID `1439` and the Testnet fallback contract.

- [ ] **Step 3: Implement the minimal manifest repair**

Change the INJ Gift fallback contract to `0x294cDD0Ac5B2ef8b23E2dc3A993E133356Ee72D5` and use `NETWORK_CONFIG.mainnet.name`, `.chainId`, and `.rpcUrl` in the `inj-gift` manifest. Do not change other mini apps.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npm test -- src/services/mini-app-config.test.ts src/services/mini-app-host.test.ts
npm test
npx tsc --noEmit
npx eslint src/config/mini-apps.ts src/services/mini-app-config.test.ts
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Review and commit only scoped files**

```bash
git diff --check -- src/config/mini-apps.ts src/services/mini-app-config.test.ts
git diff -- src/config/mini-apps.ts src/services/mini-app-config.test.ts
git add src/config/mini-apps.ts src/services/mini-app-config.test.ts
git commit -m "fix: run INJ Gift mini app on mainnet"
```
