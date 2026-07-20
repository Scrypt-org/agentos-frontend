# Mobile Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared INJ Pass sidebar usable as an accessible drawer below the `lg` breakpoint while preserving the existing desktop sidebar.

**Architecture:** Extract a small presentational mobile drawer shell whose open/closed structure can be tested without a browser DOM. Keep sidebar business actions and state in `InjPassChatShell`, adding only local drawer state, lifecycle effects, responsive classes, and close calls at navigation boundaries.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest, React server rendering, Playwright CLI

## Global Constraints

- Target only `/`, `/welcome`, and `/dashboard`, which share `InjPassChatShell`.
- Do not introduce a UI library or global state dependency.
- Reuse one sidebar content tree; do not duplicate desktop and mobile menus.
- Preserve the desktop 286px expanded and 76px collapsed behavior.
- Use a drawer width of `min(86vw, 320px)` below `lg`.
- Close the drawer from its close button, backdrop, Escape, and navigation actions.
- Lock body scrolling only while the mobile drawer is open and restore it during cleanup or desktop breakpoint changes.

---

### Task 1: Testable Mobile Drawer Frame

**Files:**
- Create: `app/components/MobileSidebarFrame.tsx`
- Create: `src/services/mobile-sidebar-frame.test.tsx`

**Interfaces:**
- Consumes: `open: boolean`, `isLight: boolean`, `children: ReactNode`, `onClose: () => void`
- Produces: `MobileSidebarFrame`, rendering a backdrop plus a responsive `<aside id="injpass-primary-sidebar">` with correct accessibility state and responsive drawer classes.

- [ ] **Step 1: Write the failing structural tests**

Create `src/services/mobile-sidebar-frame.test.tsx` with two server-rendering tests. The closed test must expect `invisible lg:visible`, `-translate-x-full`, and a non-interactive backdrop. The open test must expect `visible`, `translate-x-0`, `aria-modal="true"`, `w-[min(86vw,320px)]`, and the supplied child content. Responsive visibility is used instead of `aria-hidden` so the same DOM remains available to assistive technology on desktop.

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm test -- src/services/mobile-sidebar-frame.test.tsx`  
Expected: FAIL because `app/components/MobileSidebarFrame.tsx` does not exist.

- [ ] **Step 3: Implement the minimal frame**

Create a client component that always renders a responsive backdrop and sidebar. The backdrop calls `onClose`; open state controls opacity, pointer events, and sidebar translation. At `lg`, the backdrop is hidden and the sidebar returns to static positioning so existing desktop layout is preserved.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `pnpm test -- src/services/mobile-sidebar-frame.test.tsx`  
Expected: 2 tests pass.

- [ ] **Step 5: Commit the frame**

```bash
git add app/components/MobileSidebarFrame.tsx src/services/mobile-sidebar-frame.test.tsx
git commit -m "feat: add responsive mobile sidebar frame"
```

### Task 2: Integrate Drawer State and Mobile Layout

**Files:**
- Modify: `app/components/InjPassChatShell.tsx:5960-11510`

**Interfaces:**
- Consumes: `MobileSidebarFrame` from Task 1.
- Produces: a mobile menu trigger, drawer lifecycle behavior, automatic close on navigation actions, dynamic viewport height, and viewport-safe login menu width.

- [ ] **Step 1: Extend the structural test with integration source assertions**

Add a test that reads `app/components/InjPassChatShell.tsx` and expects the shell to use `h-dvh`, render a trigger connected to `injpass-primary-sidebar` with `aria-expanded`, and wrap the existing sidebar with `MobileSidebarFrame`.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm test -- src/services/mobile-sidebar-frame.test.tsx`  
Expected: FAIL because `InjPassChatShell` has not integrated the frame or mobile trigger.

- [ ] **Step 3: Implement state and lifecycle behavior**

Add `mobileSidebarOpen`, open/close callbacks, an Escape listener, body overflow locking, and a `matchMedia('(min-width: 1024px)')` listener that closes the drawer when entering desktop layout. Ensure every listener and the prior body overflow value are restored in cleanup.

- [ ] **Step 4: Integrate the responsive frame and trigger**

Wrap the existing `<aside>` in `MobileSidebarFrame`, keep desktop collapse width on the aside content, and add a header menu button below `lg` with `aria-controls="injpass-primary-sidebar"` and `aria-expanded={mobileSidebarOpen}`. On mobile, the existing sidebar header button closes the drawer; on desktop it continues toggling `sidebarCollapsed`.

- [ ] **Step 5: Close after navigation and harden narrow widths**

Call the close callback after actions that switch the main surface or open a full-screen destination, without closing when merely expanding wallet/DApp/Campaign groups. Replace `h-screen` with `h-dvh` and replace the login popup's fixed `w-[360px]` with `w-[min(360px,calc(100vw-2rem))]`.

- [ ] **Step 6: Run focused and full automated verification**

Run: `pnpm test -- src/services/mobile-sidebar-frame.test.tsx`  
Expected: all focused tests pass.

Run: `pnpm test`  
Expected: all test files pass with zero failures.

Run: `pnpm lint`  
Expected: exit 0 with no ESLint errors.

Run: `pnpm build`  
Expected: exit 0 and successful Next.js production build.

- [ ] **Step 7: Verify real responsive behavior**

Start `pnpm dev`, then use Playwright at 390×844, 768×1024, 1024×768, and 1440×900. At narrow widths verify the menu button, open drawer, backdrop close, close button, Escape close, scrollable sidebar, dark/light themes, and no horizontal overflow. At desktop widths verify the original expand/collapse behavior and absence of the mobile backdrop.

- [ ] **Step 8: Commit the integration**

```bash
git add app/components/InjPassChatShell.tsx src/services/mobile-sidebar-frame.test.tsx docs/superpowers/plans/2026-07-20-mobile-sidebar.md
git commit -m "feat: make primary sidebar usable on mobile"
```
