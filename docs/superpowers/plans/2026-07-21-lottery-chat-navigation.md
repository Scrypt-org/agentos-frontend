# Lottery Chat Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the lottery header reward range and make “Start AI Chat” return to the current INJ Pass chat surface without opening a browser tab.

**Architecture:** The mini-app connector exposes an `openHostChat()` action over the existing origin-scoped message channel. The shell accepts that action only from the active mini-app iframe and switches to its default chat surface; standalone lottery visits use current-tab navigation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest

## Global Constraints

- Do not change lottery reward calculations, backend APIs, eligibility, expiry, or claim behavior.
- Do not close or delete the existing mini-app browser tab.
- Do not open a new browser tab or reload the INJ Pass shell.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Return From Lottery To Host Chat

**Files:**
- Modify: `src/services/ai-token-lottery.test.ts`
- Modify: `packages/injpass-connector/src/miniapp.ts`
- Modify: `app/components/InjPassChatShell.tsx`
- Modify: `app/mini-apps/ai-token-lottery/page.tsx`

**Interfaces:**
- Produces: `InjPassMiniAppConnector.openHostChat(): void`
- Message: `{ channel: 'injpass-miniapp-v1', type: 'open-host-chat' }`
- Host result: `activeMode = 'chat'`, `activeChatSurface = 'default'`, `activeWalletTab = null`

- [ ] **Step 1: Write failing behavior contracts**

Add tests to `src/services/ai-token-lottery.test.ts`:

```ts
it('hides the hard-coded reward range and returns to chat without a popup', async () => {
  const source = await readFile(
    new URL('../../app/mini-apps/ai-token-lottery/page.tsx', import.meta.url),
    'utf8',
  );
  expect(source).not.toContain('2,400–12,200 AI TOKENS');
  expect(source).not.toContain("window.open('/', '_blank'");
  expect(source).toContain('connectorRef.current?.openHostChat()');
  expect(source).toContain("window.location.assign('/')");
});

it('routes the lottery chat action through the connector and host shell', async () => {
  const connectorSource = await readFile(
    new URL('../../packages/injpass-connector/src/miniapp.ts', import.meta.url),
    'utf8',
  );
  const shellSource = await readFile(
    new URL('../../app/components/InjPassChatShell.tsx', import.meta.url),
    'utf8',
  );
  expect(connectorSource).toContain('openHostChat(): void');
  expect(connectorSource).toContain("type: 'open-host-chat'");
  expect(shellSource).toContain("message.type === 'open-host-chat'");
  expect(shellSource).toContain("setActiveChatSurface('default')");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/services/ai-token-lottery.test.ts
```

Expected: FAIL because the range and popup remain, and the connector/host action is absent.

- [ ] **Step 3: Add the connector host-chat action**

Add this public method to `InjPassMiniAppConnector` before `destroy()`:

```ts
openHostChat(): void {
  this.post({ type: 'open-host-chat' });
}
```

- [ ] **Step 4: Handle the action in the active shell**

Strengthen the existing mini-app message guard:

```ts
if (
  event.origin !== miniAppOrigin
  || event.source !== miniAppIframeRef.current?.contentWindow
) return;
```

Handle the action before navigation and RPC branches:

```ts
if (message.type === 'open-host-chat') {
  switchProductMode('chat');
  setActiveChatSurface('default');
  setActiveWalletTab(null);
  setConversationSearchOpen(false);
  return;
}
```

- [ ] **Step 5: Update the lottery header and button**

Keep the connector available to button handlers:

```ts
const connectorRef = useRef<InjPassMiniAppConnector | null>(null);
```

Assign and clear it in the existing effect:

```ts
connectorRef.current = connector;
```

```ts
connector?.destroy();
connectorRef.current = null;
```

Add the navigation handler:

```ts
const startAiChat = () => {
  if (connectorRef.current) {
    connectorRef.current.openHostChat();
    return;
  }
  window.location.assign('/');
};
```

Remove the header node containing `2,400–12,200 AI TOKENS` and use:

```tsx
{won && <button className={styles.primary} onClick={startAiChat}>{copy.chat}</button>}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/services/ai-token-lottery.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run repository validation**

Run:

```bash
npm test
npx eslint app/mini-apps/ai-token-lottery/page.tsx app/components/InjPassChatShell.tsx packages/injpass-connector/src/miniapp.ts src/services/ai-token-lottery.test.ts
npm run build
```

Expected: tests and build pass. Report any pre-existing lint error separately without changing unrelated files.
