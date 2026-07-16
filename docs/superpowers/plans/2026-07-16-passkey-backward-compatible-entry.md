# Passkey Backward-Compatible Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the unified Passkey recovery entry while keeping wallet creation PRF-only and preserving legacy unlock compatibility.

**Architecture:** Extract the two Passkey menu actions into a focused presentational component and route recovery through a small service adapter. The existing `recoverWallet()` remains responsible for PRF/legacy detection; the adapter validates and hands its result to the shell without dropping scheme metadata.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, WebAuthn PRF

## Global Constraints

- New Passkey wallets use only `prf-v1`.
- Existing `prf-v1` and `legacy-sha256` wallets remain unlockable.
- Keep **Use another Passkey** visible in the Passkey tab.
- Commit locally on `dev`; do not push.

---

### Task 1: Add regression coverage

**Files:**
- Create: `src/services/passkey-entry.test.ts`
- Create: `src/services/passkey-wallet-actions.test.tsx`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `RecoverWalletResult`, `LocalKeystore`
- Produces: coverage for the menu contract and unified recovery handoff

- [x] Write tests that require both menu actions and both recovery schemes.
- [x] Run the focused tests and confirm they fail because the extracted component and adapter do not exist.

### Task 2: Restore unified recovery

**Files:**
- Create: `app/components/PasskeyWalletActions.tsx`
- Create: `src/services/passkey-entry.ts`
- Modify: `app/components/InjPassChatShell.tsx`
- Modify: `src/wallet/key-management/index.ts`

**Interfaces:**
- Consumes: `recoverWallet()`, `loadWallet()`, `unlockWithWalletKey()`
- Produces: `enterExistingPasskey()` and `PasskeyWalletActions`

- [x] Implement the minimum adapter and menu component required by the failing tests.
- [x] Connect the shell handler to `recoverWallet()` through the adapter.
- [x] Stop exporting the historical Passkey creator while keeping its unlock API.
- [x] Run the focused tests and confirm they pass.

### Task 3: Verify and commit

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-passkey-backward-compatible-entry-design.md`

**Interfaces:**
- Consumes: completed implementation
- Produces: durable compatibility contract and verified local commit

- [x] Run the full test suite, lint for changed files, TypeScript/build verification, and creation-path search.
- [x] Review the diff for unrelated changes and secrets.
- [x] Commit the implementation locally on `dev` without pushing.
