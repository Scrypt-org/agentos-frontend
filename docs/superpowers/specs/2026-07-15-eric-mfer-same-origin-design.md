# Eric mfer same-origin routing design

## Problem

Eric mfer is implemented inside the INJ Pass Next.js application at
`/mini-apps/eric-mfer`, but the mini-app launcher treats it like an externally
hosted dApp.

In development, its manifest falls back to `http://localhost:3000`. When the
backend occupies port 3000 and Next.js starts on port 3001, the iframe requests
the route from the backend and receives a 404.

In deployed environments, a dApp-directory URL can override the host. The test
frontend therefore opens `https://injpass.com/mini-apps/eric-mfer` instead of
the route deployed on the test frontend's own origin. If the production domain
does not contain that build, the iframe receives a 404 even though the test
deployment contains the page.

## Goal

Make first-party mini-app pages resolve against the current INJ Pass origin in
every browser environment while preserving URL overrides for independently
deployed mini apps.

## Design

Add an explicit `sameOrigin` boolean to `MiniAppManifest` and enable it for the
`eric-mfer` manifest.

URL resolution follows this precedence:

1. During browser execution, a `sameOrigin` manifest uses
   `window.location.origin`.
2. During non-browser execution, a `sameOrigin` manifest uses its configured
   development or production URL so utilities remain deterministic.
3. Other manifests retain the existing behavior: development URL in local
   development, then a valid directory URL override, then production fallback.

Origin validation must apply the same rule. For a `sameOrigin` manifest, the
current browser origin is allowed for connector messages. Existing configured
origins remain allowed to avoid breaking server-side utilities and transitional
links. External mini apps continue to allow their directory override.

## Data flow

When the user opens eric mfer, `activateMiniApp` passes its manifest and the
directory record to `resolveMiniAppUrl`. The resolver recognizes `sameOrigin`,
builds `/mini-apps/eric-mfer` against the current page origin, and appends the
existing connector query parameters. The iframe and its `postMessage` origin
therefore stay aligned.

Expected examples:

- Host `http://localhost:3001` resolves to
  `http://localhost:3001/mini-apps/eric-mfer?...`.
- Host `https://inj-pass-frontend-test.vercel.app` resolves to
  `https://inj-pass-frontend-test.vercel.app/mini-apps/eric-mfer?...`.
- Host `https://www.injpass.com` resolves to
  `https://www.injpass.com/mini-apps/eric-mfer?...`.
- INJ Gift continues to resolve to its directory-provided external URL.

## Error handling

Invalid external overrides continue to fall back to the manifest production
URL. Same-origin resolution does not depend on a directory URL, so stale or
incorrect eric mfer directory records cannot redirect the embedded page.

## Testing

Add focused unit tests for mini-app URL and origin resolution:

- A same-origin manifest ignores a conflicting directory override.
- A same-origin manifest uses the active browser origin.
- Its active browser origin passes origin validation.
- An external manifest still honors a valid directory override.
- Invalid overrides still fall back safely.

Run the focused tests first through a red-green cycle, then run the complete
test suite, TypeScript checking, and a production build. Finally verify the
local route directly and through the embedded mini-app flow.

## Scope

This change is limited to mini-app host resolution and its tests. It does not
change NFT contracts, mint eligibility, metadata, backend voucher behavior, or
Vercel domain aliases.
