# INJ Pass SDK Wallet Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore missing local mnemonic wallets and make the INJ Pass Auth, Embed, Connector, and INJ Gift connection flow terminate cleanly on success, cancellation, popup closure, timeout, or failure.

**Architecture:** Add a non-destructive local wallet reconciliation boundary that merges the legacy active record, the multi-wallet index, and encrypted IndexedDB mnemonic vaults. Add stable protocol error codes and one-shot cleanup semantics across Auth, Bridge, Embed, and Connector; INJ Gift only consumes the new structured errors through its existing connector and i18n layers.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, browser localStorage/IndexedDB, WebAuthn, `postMessage`, `@injpass/cli`, pnpm.

## Global Constraints

- Do not upload mnemonic phrases, private keys, wallet passwords, decrypted vault contents, or in-memory signing keys.
- Reconciliation is non-destructive: never delete an existing wallet index entry or IndexedDB vault.
- Existing complete wallet metadata wins over reconstructed metadata; addresses are compared case-insensitively.
- Preserve backward compatibility for SDK consumers that only read the existing string `error` field.
- INJ Gift integration and i18n already exist; only add structured terminal-state handling and new error translations.
- Each connection request settles exactly once and cleans every listener, interval, timeout, and pending Promise.
- Closing the Auth popup must stop Embed and INJ Gift loading within one second and permit immediate retry.
- Work first on `inj-pass-frontend/dev`; make the INJ Gift compatibility change separately in `inj-gift/main`.

---

## File Map

- `src/wallet/key-management/vault/indexedDb.ts`: enumerate encrypted mnemonic vault records.
- `src/wallet/keystore/reconcile.ts`: pure merge and vault-to-keystore reconstruction rules.
- `src/wallet/keystore/storage.ts`: preserve the previous active wallet before writing a new one.
- `src/wallet/__tests__/wallet-reconciliation.test.ts`: legacy migration and vault reconstruction regression tests.
- `src/lib/injpass-connection-error.ts`: stable protocol error codes, typed error, serialization, and existing-locale messages.
- `src/lib/injpass-connection-error.test.ts`: error normalization and localization tests.
- `src/lib/auth-bridge.ts`: one-shot Auth popup attempt with continuous close detection.
- `src/lib/auth-bridge.test.ts`: fake popup/timer cancellation and cleanup tests.
- `app/auth/page.tsx`: reconcile before listing wallets, show supported/unsupported wallets, and send cancellation on close.
- `app/embed/page.tsx`: render retryable terminal states and forward structured errors.
- `packages/injpass-connector/src/index.ts`: deduplicate concurrent connects and expose typed terminal errors.
- `packages/injpass-connector/src/index.test.ts`: connector request lifecycle tests.
- `../inj-gift/src/wallet/injpass/provider.ts`: preserve SDK error codes while resetting the existing shared `connectPromise`.
- `../inj-gift/src/domain/normalizeError.ts`: map new SDK codes into existing application errors.
- `../inj-gift/src/i18n/messages.ts`: add only the new cancellation/popup/timeout messages to existing languages.
- `../inj-gift/src/wallet/injpass/provider.test.ts`: verify cancellation resets connection state and retry succeeds.

---

### Task 1: Preserve Legacy Wallet Metadata When Saving

**Files:**
- Modify: `src/wallet/keystore/storage.ts`
- Test: `src/wallet/__tests__/wallet-reconciliation.test.ts`

**Interfaces:**
- Consumes: browser `localStorage` keys `injective-pass-wallet` and `injective-pass-wallets`.
- Produces: unchanged `saveWallet(keystore: LocalKeystore): void`, but it migrates the previous active record before replacing it.

- [ ] **Step 1: Write the failing legacy migration test**

```ts
it('preserves the legacy active wallet when a new wallet is saved', () => {
  localStorage.setItem('injective-pass-wallet', JSON.stringify(legacyMnemonic));
  saveWallet(prfWallet);
  expect(loadWallets().map((wallet) => wallet.address)).toEqual([
    prfWallet.address,
    legacyMnemonic.address,
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify the old wallet is lost**

Run: `pnpm test -- src/wallet/__tests__/wallet-reconciliation.test.ts`

Expected: FAIL because the result contains only the newly saved PRF wallet.

- [ ] **Step 3: Change `saveWallet()` to merge before overwriting active storage**

```ts
const previousActive = loadWallet();
const wallets = readWalletVault();
for (const candidate of [previousActive, keystore]) {
  if (!candidate) continue;
  const index = wallets.findIndex((wallet) => sameAddress(wallet.address, candidate.address));
  if (index >= 0) wallets[index] = preferCompleteWallet(wallets[index], candidate);
  else wallets.push(candidate);
}
localStorage.setItem(STORAGE_KEY, JSON.stringify(keystore));
writeWalletVault(moveAddressFirst(wallets, keystore.address));
```

Keep `sameAddress`, `preferCompleteWallet`, and `moveAddressFirst` module-private and deterministic.

- [ ] **Step 4: Run storage tests**

Run: `pnpm test -- src/wallet/__tests__/wallet-reconciliation.test.ts src/wallet/__tests__/keystore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the storage-order fix**

```bash
git add src/wallet/keystore/storage.ts src/wallet/__tests__/wallet-reconciliation.test.ts
git commit -m "fix: preserve legacy wallet metadata"
```

### Task 2: Rebuild Missing Mnemonic Wallet Indexes from IndexedDB

**Files:**
- Modify: `src/wallet/key-management/vault/indexedDb.ts`
- Modify: `src/wallet/key-management/vault/index.ts`
- Create: `src/wallet/keystore/reconcile.ts`
- Modify: `src/wallet/keystore/storage.ts`
- Test: `src/wallet/__tests__/wallet-reconciliation.test.ts`

**Interfaces:**
- Produces: `listVaults(): Promise<LocalMnemonicVaultV1[]>`.
- Produces from `storage.ts`: `reconcileWalletStorage(): Promise<LocalKeystore[]>`.
- Produces: `mergeWalletSources(indexed, active, vaults): LocalKeystore[]` as a pure testable helper.

- [ ] **Step 1: Add failing pure reconciliation tests**

```ts
it('reconstructs a missing mnemonic keystore without decrypting its vault', () => {
  const result = mergeWalletSources([prfWallet], prfWallet, [encryptedVault]);
  expect(result).toContainEqual(expect.objectContaining({
    address: encryptedVault.address,
    keyScheme: 'local-mnemonic-v1',
    encryptedMnemonicVault: JSON.stringify(encryptedVault),
  }));
});

it('keeps the complete indexed record when its vault is also present', () => {
  const result = mergeWalletSources([namedMnemonic], namedMnemonic, [encryptedVault]);
  expect(result.filter((wallet) => wallet.address === namedMnemonic.address)).toHaveLength(1);
  expect(result[0].walletName).toBe(namedMnemonic.walletName);
});
```

- [ ] **Step 2: Run tests and verify missing exports fail**

Run: `pnpm test -- src/wallet/__tests__/wallet-reconciliation.test.ts`

Expected: FAIL because `mergeWalletSources` and `reconcileWalletStorage` do not exist.

- [ ] **Step 3: Implement IndexedDB enumeration**

```ts
export async function listVaults(): Promise<LocalMnemonicVaultV1[]> {
  return transact<LocalMnemonicVaultV1[]>('readonly', (store) => store.getAll());
}
```

- [ ] **Step 4: Implement non-destructive reconciliation**

```ts
// Implemented in storage.ts so private index readers/writers stay encapsulated.
export async function reconcileWalletStorage(): Promise<LocalKeystore[]> {
  const active = loadWallet();
  const indexed = readWalletIndex();
  const vaults = await listVaults().catch(() => []);
  const merged = mergeWalletSources(indexed, active, vaults);
  writeWalletIndex(merged);
  return merged;
}
```

Reconstructed records use `source: 'import'`, `walletName: 'Recovered INJ Pass'`, `mnemonicBackupConfirmed: false`, and never call `decryptMnemonic`.

- [ ] **Step 5: Run wallet reconciliation and existing wallet tests**

Run: `pnpm test -- src/wallet/__tests__/wallet-reconciliation.test.ts src/wallet/__tests__/keystore.test.ts`

Expected: PASS, including a test where `listVaults()` rejects and the existing wallet index remains unchanged.

- [ ] **Step 6: Commit vault recovery**

```bash
git add src/wallet/key-management/vault/indexedDb.ts src/wallet/key-management/vault/index.ts src/wallet/keystore/reconcile.ts src/wallet/keystore/storage.ts src/wallet/__tests__/wallet-reconciliation.test.ts
git commit -m "feat: recover missing mnemonic wallet indexes"
```

### Task 3: Define Stable Connection Errors and Popup Attempt Cleanup

**Files:**
- Create: `src/lib/injpass-connection-error.ts`
- Create: `src/lib/injpass-connection-error.test.ts`
- Modify: `src/lib/auth-bridge.ts`
- Modify: `src/lib/auth-bridge.test.ts`

**Interfaces:**
- Produces: `InjPassConnectionErrorCode` union.
- Produces: `InjPassConnectionError extends Error` with readonly `code`.
- Produces: `connectionErrorPayload(error): { code; error }`.
- `triggerWalletConnect(appOrigin)` continues returning the existing success shape and rejects with `InjPassConnectionError`.

- [ ] **Step 1: Add failing error-contract tests**

```ts
it.each([
  ['USER_CANCELLED', 'Authentication window was closed'],
  ['POPUP_BLOCKED', 'Popup blocked'],
  ['CONNECTION_TIMEOUT', 'Connection timeout'],
])('serializes %s without losing the legacy error string', (code, message) => {
  expect(connectionErrorPayload(new InjPassConnectionError(code, message))).toEqual({ code, error: message });
});
```

- [ ] **Step 2: Add a failing fake-timer popup-close test**

```ts
it('rejects when the popup closes after request sending has stopped', async () => {
  vi.useFakeTimers();
  const popup = fakePopup();
  vi.spyOn(window, 'open').mockReturnValue(popup);
  const pending = triggerWalletConnect('https://www.inj-gift.fun');
  await vi.advanceTimersByTimeAsync(6_000);
  popup.closed = true;
  await vi.advanceTimersByTimeAsync(500);
  await expect(pending).rejects.toMatchObject({ code: 'USER_CANCELLED' });
});
```

- [ ] **Step 3: Implement the typed error contract**

Define the exact codes `USER_CANCELLED`, `POPUP_BLOCKED`, `CONNECTION_TIMEOUT`, `WALLET_NOT_FOUND`, `WALLET_MIGRATION_REQUIRED`, `WALLET_UNLOCK_FAILED`, and `PROTOCOL_ERROR`. Unknown errors normalize to `PROTOCOL_ERROR` while retaining a safe legacy message.

- [ ] **Step 4: Refactor `triggerWalletConnect()` around one idempotent `settle()`**

```ts
const settle = (result: { value?: WalletConnectResult; error?: InjPassConnectionError }) => {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  clearInterval(sendInterval);
  clearInterval(closeInterval);
  window.removeEventListener('message', handleMessage);
  result.error ? reject(result.error) : resolve(result.value!);
};
const closeInterval = window.setInterval(() => {
  if (popup.closed) settle({ error: new InjPassConnectionError('USER_CANCELLED', 'Authentication window was closed') });
}, 250);
```

The send interval may stop after readiness/retry limits; the close interval must continue until settlement.

- [ ] **Step 5: Run the protocol tests**

Run: `pnpm test -- src/lib/injpass-connection-error.test.ts src/lib/auth-bridge.test.ts`

Expected: PASS with fake timers reporting no remaining timer after every terminal path.

- [ ] **Step 6: Commit the protocol boundary**

```bash
git add src/lib/injpass-connection-error.ts src/lib/injpass-connection-error.test.ts src/lib/auth-bridge.ts src/lib/auth-bridge.test.ts
git commit -m "fix: terminate closed authorization attempts"
```

### Task 4: Reconcile and Display Every Wallet in Auth

**Files:**
- Modify: `app/auth/page.tsx`
- Test: `src/services/passkey-wallet-actions.test.tsx`

**Interfaces:**
- Consumes: `reconcileWalletStorage()` from Task 2.
- Consumes: `connectionErrorPayload()` and stable codes from Task 3.
- Existing mnemonic unlock continues through `unlockWalletKey(wallet, { password })`.

- [ ] **Step 1: Add failing Auth wallet-model tests**

Extract and test `walletAuthorizationCapability(wallet)` so tests assert:

```ts
expect(walletAuthorizationCapability(mnemonicWallet)).toEqual({ kind: 'traditional', enabled: true });
expect(walletAuthorizationCapability(legacyWithCredential)).toEqual({ kind: 'passkey', enabled: true });
expect(walletAuthorizationCapability(legacyWithoutCredential)).toEqual({
  kind: 'migration-required', enabled: false,
});
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm test -- src/services/passkey-wallet-actions.test.tsx`

Expected: FAIL because the extracted capability API and migration-visible behavior do not exist.

- [ ] **Step 3: Await reconciliation before setting `availableWallets`**

Replace the direct `loadWallets()` call in `handleWalletConnect` with:

```ts
const wallets = await reconcileWalletStorage();
setAvailableWallets(wallets);
```

If reconciliation cannot read IndexedDB, fall back to indexed wallets and show a non-blocking recovery warning.

- [ ] **Step 4: Keep unsupported old wallets visible and add recovery entry points**

Render migration-required entries disabled with their reason and link to `/upgrade`. Keep the existing “Create another wallet” action and add “Import 24-word wallet” linking to `/welcome?wallet=recover`; do not collect mnemonic words inside the third-party authorization request itself.

- [ ] **Step 5: Emit cancellation from Auth while a request is pending**

Register `pagehide` for the current pending request and post `{ type: 'WALLET_CONNECT_RESPONSE', requestId, code: 'USER_CANCELLED', error: 'Authentication window was closed' }`. Mark successful, explicit-cancel, and failed requests settled before navigation so the event cannot send a second result.

- [ ] **Step 6: Run Auth and passkey compatibility tests**

Run: `pnpm test -- src/services/passkey-wallet-actions.test.tsx src/services/passkey-entry.test.ts src/lib/auth-bridge.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Auth recovery support**

```bash
git add app/auth/page.tsx src/services/passkey-wallet-actions.test.tsx
git commit -m "feat: expose recovered wallets in authorization"
```

### Task 5: Make Embed Retryable and Localize Only New Terminal Errors

**Files:**
- Modify: `app/embed/page.tsx`
- Modify: `src/lib/injpass-connection-error.ts`
- Test: `src/lib/injpass-connection-error.test.ts`

**Interfaces:**
- Consumes stable `{ code, error }` payloads.
- Produces parent message `INJPASS_ERROR` with both `code` and backward-compatible `error`.

- [ ] **Step 1: Add failing locale and payload tests**

```ts
expect(connectionErrorMessage('USER_CANCELLED', 'zh-CN')).toBe('你已取消 INJ Pass 连接。');
expect(connectionErrorMessage('USER_CANCELLED', 'en')).toBe('INJ Pass connection was cancelled.');
```

Also assert unknown language values fall back to the existing Embed locale behavior.

- [ ] **Step 2: Run the error tests**

Run: `pnpm test -- src/lib/injpass-connection-error.test.ts`

Expected: FAIL because localized terminal messages are not yet implemented.

- [ ] **Step 3: Replace boolean-only loading with an attempt-aware view state**

Use `idle | connecting | connected | cancelled | error`; increment an attempt token for every retry, and ignore results whose token is no longer current. In `catch`, set terminal state before posting `INJPASS_ERROR`; in `finally`, clear loading only for the current token.

- [ ] **Step 4: Render retry without changing the existing visual system**

For `cancelled` and `error`, show the localized message and a button that calls the existing `handleConnect`. Preserve current theme mirroring, connected wallet display, signing UI, and resize behavior.

- [ ] **Step 5: Run tests, lint the touched files, and build**

Run: `pnpm test -- src/lib/injpass-connection-error.test.ts src/lib/auth-bridge.test.ts && pnpm eslint app/embed/page.tsx src/lib/injpass-connection-error.ts`

Expected: all tests PASS and ESLint exits 0.

- [ ] **Step 6: Commit Embed terminal UI**

```bash
git add app/embed/page.tsx src/lib/injpass-connection-error.ts src/lib/injpass-connection-error.test.ts
git commit -m "fix: make embed connection failures retryable"
```

### Task 6: Deduplicate Connector Attempts and Forward Structured Errors

**Files:**
- Modify: `packages/injpass-connector/src/index.ts`
- Create: `packages/injpass-connector/src/index.test.ts`
- Modify: `packages/injpass-connector/README.md`

**Interfaces:**
- Adds exported `InjPassConnectorErrorCode` and `InjPassConnectorError`.
- `connect(): Promise<ConnectedWallet>` remains source-compatible.
- Concurrent `connect()` calls return the same pending Promise.

- [ ] **Step 1: Add failing connector lifecycle tests**

Test with fake DOM/message events that two concurrent `connect()` calls create one iframe/attempt, `INJPASS_ERROR { code: 'USER_CANCELLED' }` rejects with the typed code, and a following `connect()` creates a fresh attempt.

- [ ] **Step 2: Run the connector tests**

Run: `pnpm test -- packages/injpass-connector/src/index.test.ts`

Expected: FAIL because `connect()` currently creates independent Promises and errors have no stable code.

- [ ] **Step 3: Add `connectAttempt` and a one-shot attempt cleanup helper**

```ts
private connectAttempt: Promise<ConnectedWallet> | null = null;

connect(): Promise<ConnectedWallet> {
  if (this.connectedWallet) return Promise.resolve(this.connectedWallet);
  if (this.connectAttempt) return this.connectAttempt;
  this.connectAttempt = this.startConnectAttempt().finally(() => {
    this.connectAttempt = null;
  });
  return this.connectAttempt;
}
```

`startConnectAttempt()` owns the iframe load timeout, connection timeout, message listener, and its single cleanup function.

- [ ] **Step 4: Parse structured errors without breaking old Embed responses**

When `code` is present, reject `InjPassConnectorError(code, error)`. When only `error` exists, normalize known legacy strings and otherwise use `PROTOCOL_ERROR`.

- [ ] **Step 5: Document errors and retry semantics**

Add README examples that branch on `error instanceof InjPassConnectorError` and `error.code === 'USER_CANCELLED'`, while noting string-only Embed responses remain supported.

- [ ] **Step 6: Run connector tests and package build**

Run: `pnpm test -- packages/injpass-connector/src/index.test.ts && pnpm --dir packages/injpass-connector build`

Expected: tests PASS and `tsup` produces CJS, ESM, and declarations successfully.

- [ ] **Step 7: Commit Connector lifecycle changes**

```bash
git add packages/injpass-connector/src/index.ts packages/injpass-connector/src/index.test.ts packages/injpass-connector/README.md
git commit -m "feat: add retry-safe connector attempts"
```

### Task 7: Adapt INJ Gift to Structured Terminal Errors

**Files:**
- Modify: `../inj-gift/src/wallet/injpass/provider.ts`
- Modify: `../inj-gift/src/domain/normalizeError.ts`
- Modify: `../inj-gift/src/i18n/messages.ts`
- Create: `../inj-gift/src/wallet/injpass/provider.test.ts`

**Interfaces:**
- Consumes `InjPassConnectorError.code` from Task 6.
- Preserves the existing shared `connectPromise`, provider installation, wallet controller, and language selection.

- [ ] **Step 1: Add a failing provider retry test**

```ts
it('clears a cancelled connect attempt so the next call can retry', async () => {
  connectorConnect.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'USER_CANCELLED' }));
  await expect(connectInjpass()).rejects.toMatchObject({ code: 'USER_CANCELLED' });
  connectorConnect.mockResolvedValueOnce(wallet);
  await expect(connectInjpass()).resolves.toMatchObject({ address: wallet.address });
  expect(connectorConnect).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the provider test**

Run from `inj-gift`: `pnpm test -- src/wallet/injpass/provider.test.ts`

Expected: FAIL until the typed error and retry cleanup are wired through the mocked Connector.

- [ ] **Step 3: Preserve SDK codes through existing normalization**

Keep `connectInjpass()` cleanup in `catch`, but do not replace the original typed error. Read `code` structurally so this compatibility commit can be tested against the existing dependency before the SDK package is published. Extend `normalizeError` so `USER_CANCELLED` maps to the existing non-fatal user-rejection category, while popup blocked and timeout map to actionable connection errors.

- [ ] **Step 4: Add only the new messages to existing dictionaries**

Add keys for cancellation, popup blocked, and connection timeout to all currently supported dictionaries in `src/i18n/messages.ts`; do not alter existing create/claim or wallet strings.

- [ ] **Step 5: Run INJ Gift tests, typecheck, and lint**

Run from `inj-gift`: `pnpm test -- src/wallet/injpass/provider.test.ts && pnpm typecheck && pnpm lint`

Expected: PASS with no TypeScript or ESLint errors.

- [ ] **Step 6: Commit INJ Gift compatibility separately**

```bash
git add src/wallet/injpass/provider.ts src/wallet/injpass/provider.test.ts src/domain/normalizeError.ts src/i18n/messages.ts
git commit -m "fix: handle cancelled INJ Pass connections"
```

### Task 8: End-to-End Verification and Release Readiness

**Files:**
- Modify if evidence requires it: `docs/2026_06_07_SDK_PUBLISH.md`
- Create: `docs/superpowers/plans/2026-07-19-injpass-sdk-wallet-recovery-verification.md`

**Interfaces:**
- Validates all outputs from Tasks 1–7; introduces no new runtime API.

- [ ] **Step 1: Run the full INJ Pass verification suite**

Run: `pnpm test && pnpm lint && pnpm build && pnpm --dir packages/injpass-connector build`

Expected: all tests PASS, lint exits 0, Next.js production build succeeds, and Connector declarations build.

- [ ] **Step 2: Run the full INJ Gift verification suite**

Run from `inj-gift`: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 3: Verify the real browser cancellation path**

On the dev deployment: open INJ Gift, choose INJ Pass, wait more than 5 seconds, close `/auth`, and record that both Embed and INJ Gift stop loading within one second. Click retry and complete a PRF connection.

- [ ] **Step 4: Verify mnemonic recovery and signing**

Create a fixture state with a mnemonic vault present in IndexedDB but missing from `injective-pass-wallets`. Reload `injpass.com`, confirm `Recovered INJ Pass` appears in the main selector and Auth, unlock it with its password, and sign one harmless message.

- [ ] **Step 5: Verify legacy Passkey presentation and language regression**

Confirm a complete legacy Passkey remains selectable; an incomplete one remains visible with migration guidance. Repeat cancellation in Chinese and English, and confirm existing create/claim text is unchanged.

- [ ] **Step 6: Record evidence and release notes**

Write the exact commit SHAs, commands, outputs, tested browser/version, recovered wallet address prefix, and screenshots to the verification document. If SDK publishing steps changed, update the publish guide with the exact package version and consumer update order.

- [ ] **Step 7: Commit verification documentation**

```bash
git add docs/2026_06_07_SDK_PUBLISH.md docs/superpowers/plans/2026-07-19-injpass-sdk-wallet-recovery-verification.md
git commit -m "docs: record SDK wallet recovery verification"
```
