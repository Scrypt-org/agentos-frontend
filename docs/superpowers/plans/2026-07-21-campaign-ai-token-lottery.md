# Campaign AI Token Lottery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the existing AI Token Lucky Draw mini-app from Campaign so newly registered wallets can load their real lottery eligibility there.

**Architecture:** Campaign resolves the lottery from the existing `dappMarketItems` collection using a shared stable app ID. It delegates opening to the existing `openDApp`/`activateMiniApp` flow, preserving session transport, iframe handling, backend requests, tabs, and error states.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest

## Global Constraints

- Keep `/mini-apps/ai-token-lottery` and all backend eligibility logic unchanged.
- Do not add another iframe or duplicate mini-app session handling.
- Keep the lottery excluded from the expanded Apps sidebar list.
- Do not redesign the lottery UI in this change.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Route Campaign To The Lottery

**Files:**
- Modify: `src/services/dapp-visibility.ts:16`
- Modify: `src/services/dapp-visibility.test.ts:38`
- Modify: `src/services/ai-token-lottery.test.ts:48`
- Modify: `app/components/InjPassChatShell.tsx:82-87,6328-6341,8398-8403,9763-9795`

**Interfaces:**
- Consumes: `dappMarketItems: DAppMarketItem[]`, `openDApp(app: DAppMarketItem, path?: string): void`
- Produces: `campaignAvailability: 'ai-token-lottery'`, `campaignApp: DAppMarketItem | null`

- [ ] **Step 1: Write failing Campaign contract tests**

Change the Campaign expectation in `src/services/dapp-visibility.test.ts`:

```ts
it('routes Campaign to the AI Token lottery', () => {
  expect(campaignAvailability).toBe('ai-token-lottery');
});
```

Add this shell contract to `src/services/ai-token-lottery.test.ts`:

```ts
it('opens the lottery from Campaign and keeps Campaign active', async () => {
  const source = await readFile(
    new URL('../../app/components/InjPassChatShell.tsx', import.meta.url),
    'utf8',
  );
  expect(source).toContain('app.id === campaignAvailability');
  expect(source).toContain('openDApp(campaignApp)');
  expect(source).toContain("activeMiniApp?.id === campaignAvailability");
  expect(source).toContain('{campaignApp?.name || copy.comingSoon}');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/services/dapp-visibility.test.ts src/services/ai-token-lottery.test.ts
```

Expected: FAIL because Campaign still equals `coming-soon` and the shell does not resolve or open `campaignApp`.

- [ ] **Step 3: Implement the shared Campaign app contract**

Change `src/services/dapp-visibility.ts`:

```ts
export const campaignAvailability = 'ai-token-lottery' as const;
```

- [ ] **Step 4: Resolve and open the lottery through existing mini-app state**

Import `campaignAvailability` in `app/components/InjPassChatShell.tsx`, then add:

```ts
const campaignApp = useMemo(
  () => dappMarketItems.find((app) => app.id === campaignAvailability) || null,
  [dappMarketItems],
);
```

Replace `openCampaign` with:

```ts
const openCampaign = () => {
  setCampaignOpen((current) => !current);
  if (campaignApp) {
    openDApp(campaignApp);
    return;
  }
  switchProductMode('chat');
  setActiveChatSurface('campaign');
  setActiveWalletTab(null);
};
```

Treat the lottery mini-app as the active Campaign surface:

```ts
activeMode === 'chat' && (
  activeChatSurface === 'campaign'
  || (activeChatSurface === 'mini-app' && activeMiniApp?.id === campaignAvailability)
)
```

Replace the submenu click body with:

```ts
if (campaignApp) openDApp(campaignApp);
```

Replace the submenu label with:

```tsx
{campaignApp?.name || copy.comingSoon}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/services/dapp-visibility.test.ts src/services/ai-token-lottery.test.ts
```

Expected: both files PASS.

- [ ] **Step 6: Run repository validation**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit successfully without new warnings or errors.
