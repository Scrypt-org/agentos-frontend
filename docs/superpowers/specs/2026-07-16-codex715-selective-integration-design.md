# Codex 715 Selective Integration Design

## Goal

Integrate the Omisper INJ Pass mini-app wallet work into Omisper `main`, then selectively carry the useful runtime and mini-app integration improvements from the INJ Pass `codex715` branches into frontend and backend `dev` without reverting newer fixes already present on `dev`.

## Scope and branch policy

- Omisper source: `origin/codex/fix-omisper-injpass-connection`; target: local `main`.
- INJ Pass frontend source: `origin/codex715`; target: local `dev`.
- INJ Pass backend source: `origin/codex715`; target: local `dev`.
- Keep all results local. Do not push.
- Do not change the user's configured allowed origins.
- Do not wholesale-merge either INJ Pass `codex715` branch because those branches delete tests and features that are newer on `dev`.

## Omisper integration

Merge the dedicated Omisper repair branch into `main`. Preserve its host-wallet protocol support, XMTP signer initialization, and agent-command bridge for direct messages, broadcasts, groups, inbox synchronization, and conversation history. Resolve conflicts in favor of the host-wallet behavior while retaining unrelated `main` changes.

Verification must include TypeScript checking, the existing test suite, and the production build used by the Wrangler deployment workflow. Wrangler configuration itself should only change if the merged branch requires it.

## Frontend selective integration

Review the exact `origin/dev..origin/codex715` diff. Carry only changes that improve:

- documented runtime configuration;
- registered mini-app production URLs;
- sidebar mini-app activation and host-session propagation;
- origin validation and wallet RPC permissions;
- compatibility with the Omisper and INJ Gift hosted providers.

Retain the newer `dev` behavior for first-party eric mfer routing, CatNFT mint reliability, gallery/index ownership handling, guest-chat handling, passkey compatibility, wallet security checks, and all current tests. Existing user-configured origins must remain unchanged.

## Backend selective integration

Review the exact `origin/dev..origin/codex715` diff. Carry only runtime documentation, DApp/Skills metadata, or service behavior that remains useful with the current frontend mini-app integration. Preserve the newer `dev` CatNFT gas sponsorship, ownership index, migrations, tests, and security behavior.

The backend does not perform browser wallet RPC. It should remain responsible for the DApp directory, Skills metadata, and runtime services only.

## Error handling and security

- Mini-app messages must be accepted only from the active iframe/window and exact registered origin.
- Wallet account and transaction sender must match the authenticated INJ Pass address.
- Contract allowlists and per-app permissions remain enforced.
- Failed application URLs must not silently receive wallet authority.
- Existing login, unlock, rejection, timeout, and logout behavior must remain intact.

## Verification and completion

For each repository, inspect the final diff before committing. Run the repository's typecheck, targeted wallet/mini-app tests, and production build where available. Report commits, remaining uncommitted files, and any deployment-time environment assumptions. Do not claim end-to-end production success without a deployed browser test.
