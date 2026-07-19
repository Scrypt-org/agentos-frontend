# SDK Existing Passkey Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an INJ Pass `/auth` session to recover a locally missing PRF or legacy Passkey wallet on explicit user request and then complete the current dApp connection.

**Architecture:** Keep `recoverWallet()` as the only WebAuthn/backend/key-derivation implementation. Add a small authorization recovery service that resolves the keystore written by `recoverWallet()` and zeroes the transient private key, then connect that service to a new `recovering_wallet` branch in the existing `/auth` state machine. The public Connector protocol and the existing `finishWalletConnect()` path remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, WebAuthn, Vitest 4, pnpm.

## Global Constraints

- Recovery starts only after the user clicks “Use an existing Passkey wallet”; page load must not trigger WebAuthn.
- Reuse `recoverWallet()`; do not duplicate Passkey verification, PRF derivation, legacy derivation, address validation, or keystore persistence.
- Support both `prf-v1` and `legacy-sha256` recovery.
- Preserve the active `requestId`, opener, target origin, and pending `WALLET_CONNECT` request.
- Do not change the Connector public message protocol.
- Do not automatically migrate legacy wallets to PRF.
- Never write a plaintext private key to React state, localStorage, logs, or `postMessage`.
- A transient recovery private key must be zeroed before the standard connection unlock begins.
- Recovery cancellation or failure returns to wallet selection and remains retryable.

---

### Task 1: Identify Legacy Passkey Wallets Clearly

**Files:**
- Modify: `src/lib/wallet-authorization.ts`
- Test: `src/services/wallet-authorization.test.ts`

**Interfaces:**
- Consumes: `LocalKeystore.keyScheme` and `LocalKeystore.credentialId`.
- Produces: `walletAuthorizationCapability(wallet)` with label `Legacy Passkey` for usable non-PRF Passkey wallets.

- [ ] **Step 1: Change the existing test expectation first**

Update the legacy test and add the missing-key-scheme compatibility case:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- src/services/wallet-authorization.test.ts
```

Expected: FAIL because the current label is `Passkey`.

- [ ] **Step 3: Update the capability label type and implementation**

Change the passkey capability union and legacy return value:

```ts
export type WalletAuthorizationCapability =
  | { kind: 'traditional'; enabled: true; label: 'Traditional' }
  | { kind: 'passkey'; enabled: true; label: 'Legacy Passkey' | 'Passkey PRF' }
  | { kind: 'migration-required'; enabled: false; label: 'Migration required' };

export function walletAuthorizationCapability(wallet: LocalKeystore): WalletAuthorizationCapability {
  if (wallet.keyScheme === 'local-mnemonic-v1') {
    return { kind: 'traditional', enabled: true, label: 'Traditional' };
  }
  if (wallet.keyScheme === 'prf-v1') {
    return { kind: 'passkey', enabled: true, label: 'Passkey PRF' };
  }
  if (wallet.credentialId) {
    return { kind: 'passkey', enabled: true, label: 'Legacy Passkey' };
  }
  return { kind: 'migration-required', enabled: false, label: 'Migration required' };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm test -- src/services/wallet-authorization.test.ts
```

Expected: all wallet authorization capability tests PASS.

- [ ] **Step 5: Commit the independently testable label change**

```bash
git add src/lib/wallet-authorization.ts src/services/wallet-authorization.test.ts
git commit -m "fix: label legacy Passkey wallets in authorization"
```

---

### Task 2: Add a Safe Authorization Recovery Service

**Files:**
- Create: `src/services/auth-passkey-recovery.ts`
- Create: `src/services/auth-passkey-recovery.test.ts`

**Interfaces:**
- Consumes: `recover(): Promise<RecoverWalletResult>` and `loadWallets(): LocalKeystore[]`.
- Produces: `recoverPasskeyForAuthorization(dependencies): Promise<LocalKeystore>`.
- Guarantee: `RecoverWalletResult.privateKey.fill(0)` runs on both success and post-recovery failure.

- [ ] **Step 1: Write failing success, cleanup, and missing-keystore tests**

Create `src/services/auth-passkey-recovery.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { LocalKeystore } from '@/types/wallet';
import type { RecoverWalletResult } from '@/wallet/key-management';
import { recoverPasskeyForAuthorization } from './auth-passkey-recovery';

const address = '0x0000000000000000000000000000000000001234';

function storedWallet(keyScheme: 'prf-v1' | 'legacy-sha256'): LocalKeystore {
  return {
    address,
    encryptedPrivateKey: keyScheme === 'prf-v1' ? '' : 'ciphertext',
    source: 'passkey',
    keyScheme,
    credentialId: 'credential',
    createdAt: 1,
  };
}

function recovered(privateKey: Uint8Array): RecoverWalletResult {
  return {
    address: address.toUpperCase(),
    privateKey,
    credentialId: 'credential',
    walletName: 'Recovered wallet',
    keyScheme: 'legacy-sha256',
  };
}

describe('recoverPasskeyForAuthorization', () => {
  it.each(['prf-v1', 'legacy-sha256'] as const)(
    'returns the stored %s keystore and zeroes the recovery key',
    async (keyScheme) => {
      const privateKey = new Uint8Array([1, 2, 3]);
      const wallet = storedWallet(keyScheme);

      await expect(recoverPasskeyForAuthorization({
        recover: async () => ({ ...recovered(privateKey), keyScheme }),
        loadWallets: () => [wallet],
      })).resolves.toBe(wallet);

      expect(privateKey).toEqual(new Uint8Array([0, 0, 0]));
    },
  );

  it('zeroes the recovery key before failing when no saved keystore is found', async () => {
    const privateKey = new Uint8Array([9, 8, 7]);

    await expect(recoverPasskeyForAuthorization({
      recover: async () => recovered(privateKey),
      loadWallets: () => [],
    })).rejects.toThrow('The Passkey was verified but its wallet metadata was not saved.');

    expect(privateKey).toEqual(new Uint8Array([0, 0, 0]));
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm test -- src/services/auth-passkey-recovery.test.ts
```

Expected: FAIL because `auth-passkey-recovery.ts` does not exist.

- [ ] **Step 3: Implement the minimal recovery adapter**

Create `src/services/auth-passkey-recovery.ts`:

```ts
import type { LocalKeystore } from '@/types/wallet';
import type { RecoverWalletResult } from '@/wallet/key-management';

interface AuthPasskeyRecoveryDependencies {
  recover: () => Promise<RecoverWalletResult>;
  loadWallets: () => LocalKeystore[];
}

export async function recoverPasskeyForAuthorization({
  recover,
  loadWallets,
}: AuthPasskeyRecoveryDependencies): Promise<LocalKeystore> {
  const recovered = await recover();
  try {
    const wallet = loadWallets().find(
      (candidate) => candidate.address.toLowerCase() === recovered.address.toLowerCase(),
    );
    if (!wallet) {
      throw new Error('The Passkey was verified but its wallet metadata was not saved.');
    }
    return wallet;
  } finally {
    recovered.privateKey.fill(0);
  }
}
```

- [ ] **Step 4: Run the service tests and verify GREEN**

Run:

```bash
pnpm test -- src/services/auth-passkey-recovery.test.ts src/services/passkey-entry.test.ts
```

Expected: both recovery service test files PASS.

- [ ] **Step 5: Commit the recovery boundary**

```bash
git add src/services/auth-passkey-recovery.ts src/services/auth-passkey-recovery.test.ts
git commit -m "feat: add authorization Passkey recovery service"
```

---

### Task 3: Connect Recovery to the `/auth` State Machine

**Files:**
- Modify: `app/auth/page.tsx`

**Interfaces:**
- Consumes: `recoverPasskeyForAuthorization`, `recoverWallet`, `loadWallets`, and existing `finishWalletConnect(wallet)`.
- Produces: explicit `recovering_wallet` UI state and “Use an existing Passkey wallet” action.

- [ ] **Step 1: Add imports and the explicit state**

Import the existing recovery implementation, wallet loader, and new adapter:

```ts
import { recoverWallet, unlockWalletKey } from '@/wallet/key-management';
import { loadWallet, loadWallets, reconcileWalletStorage, setActiveWallet } from '@/wallet/keystore/storage';
import { recoverPasskeyForAuthorization } from '@/services/auth-passkey-recovery';
```

Add `recovering_wallet` to the `status` union between `select_wallet` and `unlock_wallet`.

- [ ] **Step 2: Add a single-flight recovery handler**

Place this handler after `chooseWallet` so it can reuse `finishWalletConnect`:

```ts
const recoverExistingPasskey = async () => {
  if (statusRef.current === 'recovering_wallet' || !pendingWalletConnectRef.current) return;

  dismissErrorToast(true);
  setErrorMessage('');
  setStatus('recovering_wallet');
  setMessage('Choose an existing INJ Pass Passkey...');

  try {
    const wallet = await recoverPasskeyForAuthorization({
      recover: recoverWallet,
      loadWallets,
    });
    setAvailableWallets(loadWallets());
    selectedWalletRef.current = wallet;
    setSelectedWallet(wallet);
    await finishWalletConnect(wallet);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unable to recover this Passkey wallet.';
    const friendlyMessage = friendlyErrorMessage(rawMessage);
    showErrorToast(friendlyMessage);
    setErrorMessage(friendlyMessage);
    selectedWalletRef.current = null;
    setSelectedWallet(null);
    setStatus('select_wallet');
  }
};
```

This intentionally calls `finishWalletConnect()` after the recovery key has been zeroed. The current pending request remains alive and the standard unlock path performs the connection authorization.

- [ ] **Step 3: Add recovery-specific title, description, and progress copy**

Extend the existing title and description expressions:

```ts
status === 'recovering_wallet'
  ? 'Recover an existing Passkey wallet'
```

```ts
status === 'recovering_wallet'
  ? 'Choose a Passkey already associated with your INJ Pass account.'
```

Treat `recovering_wallet` like `processing` in the progress card and display `message` or `Waiting for Passkey selection...`.

- [ ] **Step 4: Add the user-triggered button without changing existing wallet selection**

Inside the `select_wallet` branch, immediately below the scrollable wallet list, add:

```tsx
<button
  type="button"
  onClick={() => void recoverExistingPasskey()}
  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-semibold transition ${primaryButtonTone}`}
>
  <FingerprintIcon className="h-4 w-4" />
  Use an existing Passkey wallet
</button>
```

Do not call `recoverExistingPasskey()` from any effect. The WebAuthn ceremony must remain click-triggered.

- [ ] **Step 5: Run static and focused verification**

Run:

```bash
pnpm test -- src/services/auth-passkey-recovery.test.ts src/services/wallet-authorization.test.ts src/services/passkey-entry.test.ts
pnpm exec tsc --noEmit
pnpm lint -- app/auth/page.tsx src/services/auth-passkey-recovery.ts src/services/auth-passkey-recovery.test.ts src/lib/wallet-authorization.ts
```

Expected: all focused tests PASS, TypeScript exits 0, and ESLint exits 0.

- [ ] **Step 6: Commit the Auth integration**

```bash
git add app/auth/page.tsx
git commit -m "feat: recover existing Passkey wallets during authorization"
```

---

### Task 4: Full Regression and Production-Build Verification

**Files:**
- Verify only; modify a file only if a failing check identifies a defect in Tasks 1–3.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: evidence that the SDK recovery change does not regress existing authorization, Embed, mini-app, or build behavior.

- [ ] **Step 1: Run the complete unit test suite**

Run:

```bash
pnpm test
```

Expected: every Vitest file PASS.

- [ ] **Step 2: Run the mini-app integration script**

Run:

```bash
pnpm test-mini-app-commands
```

Expected: script exits 0 with all mini-app command assertions passing.

- [ ] **Step 3: Run lint and production build**

Run:

```bash
pnpm lint
pnpm build
```

Expected: both commands exit 0 and Next.js builds `/auth` successfully.

- [ ] **Step 4: Inspect the final diff for protocol and secret safety**

Run:

```bash
git diff origin/main...HEAD -- app/auth/page.tsx src/services/auth-passkey-recovery.ts src/lib/wallet-authorization.ts
git diff --check origin/main...HEAD
```

Verify explicitly that no Connector message type changed, no private key is logged or posted, no automatic recovery effect was introduced, and no secret or endpoint credential appears in the diff.

- [ ] **Step 5: Record the final implementation state**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: a clean worktree with the design commit and three implementation commits ahead of `origin/main`. Do not push unless the user explicitly requests it.
