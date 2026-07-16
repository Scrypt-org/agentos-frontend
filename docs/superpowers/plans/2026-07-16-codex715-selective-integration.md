# Codex 715 Selective Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Omisper hosted-wallet implementation into Omisper `main` and selectively apply safe, still-relevant `codex715` improvements to the INJ Pass frontend and backend `dev` branches.

**Architecture:** INJ Pass remains the wallet-owning host and exposes an origin-checked `injpass-miniapp-v1` RPC bridge to application iframes. Omisper and INJ Gift consume that bridge as EIP-1193/signing providers. Frontend/backend `codex715` changes are reviewed individually so newer `dev` security, CatNFT, passkey, and test work is retained.

**Tech Stack:** React, TypeScript, Next.js, NestJS, TypeORM, XMTP browser SDK, Yarn 4, pnpm, Wrangler/Cloudflare deployment.

## Global Constraints

- Keep changes local; do not push.
- Do not change the user's configured origin list.
- Do not wholesale-merge frontend or backend `codex715`.
- Preserve frontend mini-app sender/signing-account checks and current tests.
- Preserve backend CatNFT sponsorship, ownership indexing, migrations, and current tests.

---

### Task 1: Merge the Omisper hosted-wallet branch

**Files:**
- Modify: `Omisper/apps/xmtp.chat/src/components/App/App.tsx`
- Modify: `Omisper/apps/xmtp.chat/src/components/App/Connect.tsx`
- Modify: `Omisper/apps/xmtp.chat/src/components/App/ConnectXMTP.tsx`
- Modify: `Omisper/apps/xmtp.chat/src/components/App/WalletConnect.tsx`
- Create: `Omisper/apps/xmtp.chat/src/components/InjPassAgentBridge.tsx`
- Modify: `Omisper/apps/xmtp.chat/src/hooks/useConnectXmtp.ts`
- Modify: `Omisper/apps/xmtp.chat/src/services/injpass-wallet.ts`

**Interfaces:**
- Consumes: query parameters `injpass_miniapp=1` and `injpass_host_origin=<origin>` plus host channel `injpass-miniapp-v1`.
- Produces: hosted wallet RPC requests, XMTP signatures, and `agent-command-result` messages for Omisper commands.

- [ ] **Step 1: Confirm target branch and clean state**

Run: `git -C Omisper status --short --branch`
Expected: `main...origin/main` with no file changes.

- [ ] **Step 2: Merge the reviewed repair branch**

Run: `git -C Omisper merge --no-ff origin/codex/fix-omisper-injpass-connection -m "feat: integrate INJ Pass hosted wallet"`
Expected: clean merge or explicit conflicts limited to the seven reviewed files.

- [ ] **Step 3: Typecheck the XMTP app**

Run: `node Omisper/.yarn/releases/yarn-4.10.3.cjs --cwd Omisper/apps/xmtp.chat typecheck`
Expected: exit code 0.

- [ ] **Step 4: Run the XMTP app tests**

Run: `node Omisper/.yarn/releases/yarn-4.10.3.cjs --cwd Omisper/apps/xmtp.chat test`
Expected: all existing tests pass.

- [ ] **Step 5: Build the deployment artifact**

Run: `node Omisper/.yarn/releases/yarn-4.10.3.cjs --cwd Omisper/apps/xmtp.chat build`
Expected: Vite production build completes successfully.

### Task 2: Select frontend runtime documentation improvements

**Files:**
- Modify: `inj-pass-frontend/.env.example`
- Modify: `inj-pass-frontend/.env.local.example`

**Interfaces:**
- Consumes: existing deployment environment variables.
- Produces: documented production/local variables without changing `.env` or `.env.local`.

- [ ] **Step 1: Preserve current safety-sensitive values**

Keep placeholder contract addresses where the current file intentionally avoids hard-coding a deployment, retain `NEXT_PUBLIC_NETWORK=testnet` in the local example when it matches the local contracts, and retain all CatNFT sponsorship-related documentation.

- [ ] **Step 2: Add missing application URL documentation**

Document `NEXT_PUBLIC_INJ_PASS_APP_URL`, `NEXT_PUBLIC_BANKRUPT_ELON_APP_URL`, and `NEXT_PUBLIC_OMISPER_APP_URL`; add localhost port `3003` to the local allowed-origin example. Do not edit the active origin configuration.

- [ ] **Step 3: Verify examples and frontend types**

Run: `pnpm --dir inj-pass-frontend exec tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Commit the frontend documentation changes**

Run: `git -C inj-pass-frontend add .env.example .env.local.example && git -C inj-pass-frontend commit -m "docs: complete mini app runtime configuration"`
Expected: one documentation commit; current tests and package dependencies remain present.

### Task 3: Verify frontend hosted-wallet implementation remains stronger than codex715

**Files:**
- Verify: `inj-pass-frontend/src/config/mini-apps.ts`
- Verify: `inj-pass-frontend/src/services/mini-app-host.ts`
- Verify: `inj-pass-frontend/app/components/InjPassChatShell.tsx`
- Test: `inj-pass-frontend/src/services/mini-app-host.test.ts`

**Interfaces:**
- Consumes: `injpass-miniapp-v1` RPC requests from registered application origins.
- Produces: account, read, sign, and allowlisted transaction responses.

- [ ] **Step 1: Confirm newer dev protections are retained**

Verify `sameOrigin` handling for eric mfer, transaction sender validation, signing-account validation, exact-origin validation, and application-specific permissions remain in `dev`.

- [ ] **Step 2: Run focused wallet bridge tests**

Run: `pnpm --dir inj-pass-frontend test -- src/services/mini-app-host.test.ts`
Expected: all mini-app host tests pass.

- [ ] **Step 3: Run the complete frontend test and build checks**

Run: `pnpm --dir inj-pass-frontend test && pnpm --dir inj-pass-frontend build`
Expected: all tests pass and Next.js production build completes.

### Task 4: Select backend Skills and runtime documentation improvements

**Files:**
- Modify: `inj-pass-backend/.env.example`
- Modify: `inj-pass-backend/.env.worker.example`
- Modify: `inj-pass-backend/src/skills/skills.service.ts`

**Interfaces:**
- Consumes: backend runtime variables and built-in skill catalog initialization.
- Produces: accurate deployment documentation and Omisper capability text matching implemented operations.

- [ ] **Step 1: Update only accurate environment documentation**

Correct the documented backend port to `3001`, add localhost application origins and `AUTH_REQUIRE_REDIS_SESSION`, clarify DeepSeek and sandbox-wallet secrets, and retain all current CatNFT gas sponsor variables. Do not copy fixed production secrets, URLs, contract addresses, or the codex715 removal of sponsor configuration.

- [ ] **Step 2: Replace the unsupported Omisper scheduling description**

Keep the stable skill ID for database compatibility, but change its name/body/prompt to describe encrypted direct/group messaging, inbox, and history—the operations implemented by the Omisper repair branch.

- [ ] **Step 3: Add typed query safety without unrelated catalog replacement**

Use `dataSource.query<SkillRow[]>` for skill reads and reject a create operation if the inserted row cannot be reloaded. Do not replace Hash Mahjong or other unrelated catalog items in this integration.

- [ ] **Step 4: Run backend typecheck and tests**

Run: `pnpm --dir inj-pass-backend build && pnpm --dir inj-pass-backend test -- --runInBand`
Expected: NestJS build and all tests pass.

- [ ] **Step 5: Commit backend changes**

Run: `git -C inj-pass-backend add .env.example .env.worker.example src/skills/skills.service.ts && git -C inj-pass-backend commit -m "chore: align app runtime and Omisper skill metadata"`
Expected: one focused backend commit with no CatNFT regression.

### Task 5: Final cross-repository verification

**Files:**
- Verify: all files changed by Tasks 1–4.

**Interfaces:**
- Consumes: final local branches.
- Produces: deployment-ready local branches and a precise handoff report.

- [ ] **Step 1: Inspect final diffs and status**

Run: `git -C Omisper status --short --branch`, `git -C inj-pass-frontend status --short --branch`, and `git -C inj-pass-backend status --short --branch`.
Expected: clean working trees; local branches may be ahead of their upstreams.

- [ ] **Step 2: Verify branch histories**

Run: `git -C <repo> log --oneline --decorate -5` for all three repositories.
Expected: Omisper contains the repair commits/merge; frontend and backend contain only selective integration commits.

- [ ] **Step 3: Record deployment assumptions**

Report the Omisper build command/output location, confirm no origins were modified, list local commits, and state that production browser E2E remains required after Wrangler deployment.
