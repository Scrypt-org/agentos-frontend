# Campaign AI Token Lottery Entry

## Goal

Replace the Campaign “Coming soon” experience with the existing AI Token Lucky Draw mini-app. A newly registered and unlocked INJ Pass wallet can open Campaign and immediately load its backend-authoritative lottery eligibility.

## Interaction

- Clicking the top-level Campaign navigation opens the existing `ai-token-lottery` mini-app in the main shell.
- The Campaign navigation remains visually active while that mini-app is open.
- The expanded Campaign submenu names the available activity instead of showing “Coming soon”.
- Mobile navigation closes after Campaign is selected.
- Guests may still open the activity and see the existing wallet-unavailable state.

## Architecture

- Reuse the existing `openDApp` and `activateMiniApp` path so the mini-app receives the standard INJ Pass session through the existing connector.
- Resolve the lottery app from `dappMarketItems` by the stable ID `ai-token-lottery`.
- Do not duplicate the lottery page, iframe setup, authentication, or API calls inside `CampaignPanel`.
- Keep the existing `/mini-apps/ai-token-lottery` page and backend eligibility rules unchanged.

## Error Handling

- If the lottery app cannot be resolved, retain the current Campaign surface as a safe fallback rather than throwing.
- Existing mini-app and lottery request error states continue to handle unavailable sessions and backend failures.

## Testing

- Update the Campaign availability contract from `coming-soon` to the AI Token lottery app ID.
- Add a source-level shell contract test proving Campaign resolves and opens `ai-token-lottery`.
- Run the focused Vitest files, then lint and build.

## Out of Scope

- Rebuilding the lottery UI to exactly match the standalone `ai-token-treasury` project.
- Changing registration eligibility, reward amounts, expiry behavior, or backend APIs.
- Restoring the lottery to the expanded Apps sidebar list.
