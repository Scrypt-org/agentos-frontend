# Eric Mfer Mint Reliability Design

## Goal

Make the embedded eric mfer page hydrate deterministically, show one consistent authenticated wallet in both host and mini app, and preserve an on-chain mint result while waiting for the NFT and its metadata to become visible.

## Scope

- Do not change the selected Injective network or CatNFT contract configuration.
- Fix the language hydration mismatch on the eric mfer page.
- Treat a wallet as connected to a mini app only when INJ Pass is authenticated.
- Keep the mini-app iframe mounted while the wallet session changes.
- Keep mint progress visible through transaction confirmation and NFT discovery.
- Always expose a successful transaction hash and token id, even when backend record synchronization or metadata loading is delayed.

## Hydration

The server and the first browser render will both use English. After hydration, an effect reads the stored/browser language. A session-provided language remains authoritative once the host sends it. This prevents localized `<dt>` text from differing during hydration.

## Wallet Session

The host derives one `miniAppAddress`: the current address only when `isAuthenticated` is true, otherwise `null`. The toolbar, posted mini-app session, and RPC context consume this value. The iframe key no longer includes the address, so login/logout updates the existing connector through its session event instead of reloading it.

The connector's `ready` handshake remains the delivery guarantee. Host state changes also push a new session to the mounted child. A mini app therefore transitions atomically between guest and authenticated states without a host-only cached address.

## Mint State

The mint UI has explicit phases:

1. `submitting`: request voucher, sign, submit, and wait for the transaction receipt.
2. `discovering`: the receipt is successful; show the transaction link immediately and poll for the minted NFT.
3. `complete`: the matching owned NFT is available, including its resolved metadata when supplied by the contract.
4. `partial`: the bounded discovery window expired; retain the successful hash/token id and explain that artwork is still synchronizing.
5. `failed`: no successful on-chain result exists.

The button stays busy during `submitting` and `discovering`. Discovery polls by token id with bounded backoff and refreshes collection ownership. A timeout never converts a confirmed transaction into failure.

## Backend Record Synchronization

`POST /catnft/mint-record` is idempotent because the backend inserts with `orIgnore()` and updates matching metadata. The frontend retries transient record failures. If all attempts fail, `mintSponsoredCatNFT` still returns the confirmed hash/token id with a `recordSyncWarning`. The mini app shows the warning alongside the successful transaction proof.

## Testing

- Pure tests cover deterministic initial language and bounded NFT discovery.
- Service tests cover record retry and preservation of confirmed mint results.
- Host/session tests cover hiding unauthenticated cached addresses and a stable iframe key.
- Type checking, the complete Vitest suite, production build, and browser verification cover integration.

