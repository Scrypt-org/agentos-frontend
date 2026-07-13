# INJ Pass mini apps

Mini apps remain independently deployed applications. INJ Pass loads a trusted
origin in an iframe and exposes the selected wallet through a narrow EIP-1193
bridge. Application code, cookies, storage, and runtime dependencies stay on the
mini app origin; wallet private keys and recovery phrases stay in INJ Pass.

## Production registration

1. Assign one app slug, for example `gift`.
2. Point `gift.injpass.com` to the app deployment with DNS.
3. Add an exact-origin entry to `src/config/mini-apps.ts` with its chain, RPC,
   permissions, and contract allowlist.
4. The app must allow `https://injpass.com`, `https://www.injpass.com`, and the
   required INJ Pass subdomains in its `Content-Security-Policy: frame-ancestors`.
5. Wildcard application origins are not accepted by the host registry.

## Application integration

Install `@injpass/cli` 2.7 or newer and initialize the mini app connector only
when the app is embedded:

```ts
import { InjPassMiniAppConnector } from '@injpass/cli';

if (InjPassMiniAppConnector.isEmbedded()) {
  const connector = new InjPassMiniAppConnector();
  const wallet = await connector.connect();

  if (wallet) {
    window.ethereum = wallet.provider;
  }
}
```

`connect()` returns `null` while the INJ Pass host is in guest mode. Call
`requestLogin()` when the user starts an authenticated action. The host opens its
wallet chooser and sends a new session to the iframe after the user unlocks a
wallet.

The connector also synchronizes the app title, path, and history state with the
INJ Pass DApp browser. Host back, forward, home, and reload controls work without
the app exposing its router or relaxing cross-origin isolation.

## Local development

Run each app on its own origin. INJ Gift currently uses:

- INJ Pass: `http://localhost:3000`
- INJ Pass API: `http://localhost:3001`
- INJ Gift: `http://localhost:3002`

The localhost origin is registered separately from the production subdomain and
uses the same message protocol and permission checks.
