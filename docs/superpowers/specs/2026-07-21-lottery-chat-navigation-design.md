# Lottery Chat Navigation

## Goal

Remove the hard-coded reward range from the AI Token lottery header and make “Start AI Chat” return to the existing INJ Pass chat surface without opening a new browser tab.

## Interaction

- The lottery header shows only the localized live badge.
- In an embedded mini-app, “Start AI Chat” asks the current INJ Pass host to open its default chat surface.
- The host keeps the existing browser tab and application session.
- When the lottery page is visited outside the mini-app host, the button navigates the current tab to `/`.

## Architecture

- Add a public `openHostChat()` method to `InjPassMiniAppConnector`.
- The method posts an `open-host-chat` message over the existing origin-scoped `injpass-miniapp-v1` channel.
- The shell handles the message only after its existing source-window and origin checks pass, then switches to chat mode, selects the default chat surface, and clears the active wallet panel.
- The lottery page retains the connector instance for button actions and uses current-tab navigation only when it is not embedded.

## Testing

- Add a connector test for the `open-host-chat` message.
- Add a shell contract test for handling the message and selecting the default chat surface.
- Update the lottery page contract test to reject the hard-coded range and `window.open`, and require connector-driven navigation with a current-tab fallback.

## Out of Scope

- Lottery reward calculations, backend APIs, eligibility, expiry, and claim behavior.
- Visual redesign beyond removing the header number.
- Closing or deleting the existing mini-app browser tab.
