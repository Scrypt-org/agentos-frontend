# Eric Mfer Mint Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the embedded wallet session consistent and retain mint progress, transaction proof, and NFT discovery until a reliable terminal state is reached.

**Architecture:** Extract deterministic session and mint-discovery helpers that can be tested without rendering the large shell component. The host sends one authenticated address without remounting the iframe; the CatNFT service separates confirmed on-chain success from retryable backend recording; the eric mfer page drives an explicit mint phase and bounded NFT polling.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, viem, Vitest.

## Global Constraints

- Do not change Injective network selection or CatNFT contract addresses.
- Preserve all user-owned uncommitted workspace changes.
- A confirmed transaction hash and token id must never be discarded because record synchronization or metadata discovery failed.
- Implement behavior with failing tests before production changes.

---

### Task 1: Deterministic mini-app session helpers

**Files:**
- Create: `src/services/mini-app-session.ts`
- Test: `src/services/mini-app-session.test.ts`
- Modify: `app/components/InjPassChatShell.tsx`

**Interfaces:**
- Produces: `getMiniAppSessionAddress(isAuthenticated: boolean, address: string | null): string | null`
- Produces: `getMiniAppFrameKey(appId: string, frameNonce: number): string`

- [ ] **Step 1: Write failing tests for authenticated address filtering and address-independent frame keys**

```ts
expect(getMiniAppSessionAddress(false, '0xabc')).toBeNull();
expect(getMiniAppSessionAddress(true, '0xabc')).toBe('0xabc');
expect(getMiniAppFrameKey('eric-mfer', 2)).toBe('eric-mfer-2');
```

- [ ] **Step 2: Run `pnpm vitest run src/services/mini-app-session.test.ts` and verify missing exports fail**

- [ ] **Step 3: Implement the helpers and use the derived address for the toolbar, posted session, RPC context, and iframe key**

```ts
export function getMiniAppSessionAddress(authenticated: boolean, address?: string | null) {
  return authenticated && address ? address : null;
}

export function getMiniAppFrameKey(appId: string, frameNonce: number) {
  return `${appId}-${frameNonce}`;
}
```

- [ ] **Step 4: Run the focused tests and `pnpm exec tsc --noEmit`; expect PASS**

- [ ] **Step 5: Commit only Task 1 files with `fix: synchronize mini app wallet session`**

### Task 2: Preserve confirmed mint results across record failures

**Files:**
- Modify: `src/services/catnft.ts`
- Create: `src/services/catnft-mint-record.test.ts`

**Interfaces:**
- Produces: `CatMintResult.recordSynced: boolean`
- Produces: `CatMintResult.recordSyncWarning?: string`
- Produces: an exported/testable record synchronization helper accepting a fetch implementation and retry timing.

- [ ] **Step 1: Write failing tests showing transient record failure retries and permanent failure returns a warning with the same hash/token id**

```ts
expect(result.recordSynced).toBe(false);
expect(result.hash).toBe(hash);
expect(result.tokenId).toBe('8');
expect(result.recordSyncWarning).toContain('record');
```

- [ ] **Step 2: Run `pnpm vitest run src/services/catnft-mint-record.test.ts` and verify the new result contract fails**

- [ ] **Step 3: Add bounded retry for `/catnft/mint-record` and return a warning instead of throwing after a successful receipt**

```ts
return {
  hash,
  tokenId: tokenId.toString(),
  recordSynced,
  ...(recordSyncWarning ? { recordSyncWarning } : {}),
};
```

- [ ] **Step 4: Run focused tests and type checking; expect PASS**

- [ ] **Step 5: Commit only Task 2 files with `fix: preserve confirmed cat nft mints`**

### Task 3: Wait for the minted NFT and metadata

**Files:**
- Create: `src/services/eric-mfer-mint.ts`
- Create: `src/services/eric-mfer-mint.test.ts`
- Modify: `app/mini-apps/eric-mfer/page.tsx`

**Interfaces:**
- Produces: `waitForMintedCatNFT({ tokenId, owner, loadDetails, loadOwned, delay, attempts }): Promise<{ nft: CatNFT | null; ownedNFTs: CatNFT[]; timedOut: boolean }>`
- Produces: page phases `'idle' | 'submitting' | 'discovering' | 'complete' | 'partial' | 'failed'`.

- [ ] **Step 1: Write failing tests for immediate discovery, delayed discovery, and bounded timeout**

```ts
expect(await waitForMintedCatNFT(options)).toMatchObject({ timedOut: false });
expect(loadDetails).toHaveBeenCalledTimes(3);
```

- [ ] **Step 2: Run `pnpm vitest run src/services/eric-mfer-mint.test.ts` and verify the missing helper fails**

- [ ] **Step 3: Implement bounded backoff that first checks token details and confirms owner, then refreshes the owned collection**

```ts
for (let attempt = 0; attempt < attempts; attempt += 1) {
  const nft = await loadDetails(BigInt(tokenId)).catch(() => null);
  if (nft?.owner.toLowerCase() === owner.toLowerCase()) {
    return { nft, ownedNFTs: await loadOwned(owner), timedOut: false };
  }
  await delay(Math.min(1_000 + attempt * 750, 4_000));
}
return { nft: null, ownedNFTs: await loadOwned(owner), timedOut: true };
```

- [ ] **Step 4: Update `handleMint` to show the hash immediately, remain busy during discovery, open success/partial result dialogs, and retain record warnings**

- [ ] **Step 5: Run focused tests and type checking; expect PASS**

- [ ] **Step 6: Commit Task 3 files with `fix: wait for minted nft discovery`**

### Task 4: Eliminate language hydration mismatch

**Files:**
- Modify: `app/mini-apps/eric-mfer/page.tsx`
- Test: `src/services/eric-mfer-mint.test.ts`

**Interfaces:**
- Consumes: `normalizeLanguage(value)` semantics.
- Produces: a deterministic `'en'` initial render followed by a client effect that reads local preference.

- [ ] **Step 1: Add a failing test for a deterministic server/client initial language helper**

```ts
expect(getInitialEricMferLanguage()).toBe('en');
```

- [ ] **Step 2: Run the focused test and verify it fails before the helper exists**

- [ ] **Step 3: Initialize language to `'en'` and read local storage/browser language only inside `useEffect`**

```ts
const [localLanguage, setLocalLanguage] = useState<EricMferLanguage>('en');
useEffect(() => setLocalLanguage(readBrowserLanguage()), []);
```

- [ ] **Step 4: Run focused tests and type checking; expect PASS**

- [ ] **Step 5: Commit Task 4 files with `fix: hydrate eric mfer language consistently`**

### Task 5: Full verification

**Files:**
- Verify only; update implementation files only when a failure reveals an in-scope defect.

**Interfaces:**
- Consumes all previous tasks.
- Produces a deployable Next.js build and browser evidence.

- [ ] **Step 1: Run `pnpm test`; expect all Vitest tests PASS**

- [ ] **Step 2: Run `pnpm exec tsc --noEmit`; expect exit code 0**

- [ ] **Step 3: Run `pnpm build`; expect `/mini-apps/eric-mfer` in generated routes**

- [ ] **Step 4: Restart the local server and verify with a real browser that login updates both account displays without reloading the iframe**

- [ ] **Step 5: Verify a mocked/deterministic mint flow keeps the transaction link visible throughout delayed NFT discovery and ends in complete or partial success**

- [ ] **Step 6: Review `git diff` to confirm network configuration and user-owned dirty files were not modified by this work**

