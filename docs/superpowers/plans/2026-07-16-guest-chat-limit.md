# Guest Chat Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow three successful public AI replies per browser, then require login before another AI request.

**Architecture:** Add a focused `guest-chat-quota` service over `localStorage`, then integrate it at the unauthenticated public-chat boundary in `InjPassChatShell`. Reuse the existing assistant-message login action.

**Tech Stack:** TypeScript, React 19, Next.js 16, Vitest, browser `localStorage`.

## Global Constraints

- The limit is three successful public AI replies per browser with no automatic reset.
- Failed or aborted requests do not consume quota.
- Authenticated LAM billing behavior remains unchanged.
- Fourth and later guest requests must not call the AI backend.

---

### Task 1: Guest quota state

**Files:**
- Create: `src/services/guest-chat-quota.ts`
- Test: `src/services/guest-chat-quota.test.ts`

**Interfaces:**
- Produces: `getGuestChatQuota(storage?: Storage): GuestChatQuota`
- Produces: `consumeGuestChatReply(storage?: Storage): GuestChatQuota`
- Produces: `GUEST_CHAT_LIMIT = 3`

- [ ] Write failing Vitest cases for empty, malformed, incremented, and exhausted storage.
- [ ] Run `pnpm test src/services/guest-chat-quota.test.ts` and confirm failure because the service does not exist.
- [ ] Implement a storage-safe quota service that clamps count to `0..3` and returns `{ used, remaining, exhausted }`.
- [ ] Run `pnpm test src/services/guest-chat-quota.test.ts` and confirm all cases pass.

### Task 2: Public chat enforcement

**Files:**
- Modify: `app/components/InjPassChatShell.tsx`

**Interfaces:**
- Consumes: `getGuestChatQuota()` before `sendPublicAgentMessage()`.
- Consumes: `consumeGuestChatReply()` only after a successful public reply.

- [ ] Before calling public AI, append a localized quota-exhausted assistant message with `action: 'login'` and return when quota is exhausted.
- [ ] After a successful reply, consume one reply and append localized remaining/exhausted copy; set `action: 'login'` on the third reply.
- [ ] Keep abort and error paths before quota consumption.
- [ ] Run the focused test, lint the changed files, and run the production build.

### Task 3: Verification

**Files:**
- Verify: `src/services/guest-chat-quota.test.ts`
- Verify: `app/components/InjPassChatShell.tsx`

- [ ] Run `pnpm test src/services/guest-chat-quota.test.ts`.
- [ ] Run `pnpm exec eslint src/services/guest-chat-quota.ts src/services/guest-chat-quota.test.ts app/components/InjPassChatShell.tsx`.
- [ ] Run `pnpm build` and report any unrelated environmental failure separately.
