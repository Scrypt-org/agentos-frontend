# Guest Chat Limit Design

## Goal

Limit unauthenticated AI chat to three successful replies per browser while preserving wallet-intent login prompts and LAM billing for authenticated users.

## Behavior

- Store a lifetime successful-reply count in `localStorage`; reopening the browser does not reset it.
- A guest may receive at most three successful public AI replies.
- Failed, aborted, and wallet-command requests that do not call public AI do not consume quota.
- After replies one and two, show the remaining free-reply count.
- After reply three, show that the free allowance is exhausted and offer Login.
- Before a fourth public request, block locally, do not call `/ai/public-chat`, and offer Login.
- Existing wallet-intent detection continues to offer Login immediately.
- Authenticated chat bypasses guest quota and remains billed in LAM.

## Architecture

Put storage and quota transitions in a small browser-safe service so they are independently testable. `InjPassChatShell` reads quota before the public request and records usage only after a successful response. Guest quota UI is represented through normal assistant messages and the existing `action: 'login'` button path.

## Testing

Vitest covers missing/corrupt storage, successful increments capped at three, remaining-count calculation, and exhaustion. The shell integration is verified by lint/build and code-path inspection.
