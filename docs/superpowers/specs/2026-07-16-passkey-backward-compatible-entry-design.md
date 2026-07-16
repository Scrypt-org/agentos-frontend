# Passkey Backward-Compatible Entry Design

## Problem

Commit `e2863aa` removed the visible **Use another Passkey** action while restructuring the wallet menu. The underlying recovery implementation remained available, but users on a fresh device could no longer start the discoverable Passkey ceremony from the interface.

## Required behavior

- Every newly created Passkey wallet must use the PRF-based `prf-v1` scheme.
- Existing `prf-v1` and historical `legacy-sha256` Passkey wallets must remain unlockable.
- The Passkey menu must always expose one unified **Use another Passkey** action.
- The unified action must call `recoverWallet()`, which performs one discoverable WebAuthn ceremony and detects the wallet scheme by matching the derived address with the backend record.
- Recovery must preserve the detected `keyScheme` and credential ID when handing the wallet to the application session.
- Legacy support is migration-only. It must not be reused to create new wallets.
- Future wallet-menu redesigns must preserve this entry and the old-wallet unlock path unless a separately reviewed migration has moved every legacy wallet.

## UI

The Passkey tab contains two actions:

1. **Create New Wallet** — opens the PRF-only creation wizard.
2. **Use another Passkey** — subtitle: “Open an existing new or legacy Passkey wallet”; starts unified recovery.

Both actions share the existing pending state so users cannot start overlapping WebAuthn ceremonies. Errors leave the wallet menu open and render through the existing authentication error area.

## Compatibility boundary

`createPrfWallet()` is the only Passkey creation API exported through the wallet key-management barrel. `unlockByPasskey()` remains available for local historical wallets, and `recoverWallet()` remains available for discoverable fresh-device recovery. The legacy creator implementation may stay internally for compatibility code, but it must not be exported as a supported creation path or called by application pages.

## Verification

- A rendering regression test verifies both Passkey actions and the compatibility copy.
- Recovery-flow tests verify successful handoff for both `prf-v1` and `legacy-sha256`, including preservation of the detected scheme.
- A recovery-flow test verifies the explicit error when recovery succeeds but no keystore can be loaded.
- Repository search verifies all application creation paths call `createPrfWallet()` and none call `createByPasskey()`.
