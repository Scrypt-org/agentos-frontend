# INJ Gift Mainnet MiniApp Repair Design

## Goal

Make INJ Gift transactions opened inside INJ Pass use the same Injective EVM Mainnet configuration as the deployed INJ Gift application, and preserve actionable network errors instead of reporting them as wallet connection failures.

## Root Cause

The deployed INJ Gift application uses EVM Mainnet chain ID `1776` and contract `0x294cDD0Ac5B2ef8b23E2dc3A993E133356Ee72D5`. The INJ Pass mini-app manifest currently registers INJ Gift against `NETWORK_CONFIG.testnet`, so the host reports chain ID `1439` and rejects INJ Gift's request to use `1776`. The rejection is subsequently wrapped by `EvmWallet.connect()` as `Failed to connect wallet`.

## Changes

### INJ Pass

- Register the `inj-gift` manifest with `NETWORK_CONFIG.mainnet.name`, `.chainId`, and `.rpcUrl`.
- Keep transaction permission enabled.
- Keep the exact-contract allowlist, with `NEXT_PUBLIC_INJ_GIFT_CONTRACT_ADDRESS` overriding the Mainnet fallback address.
- Change the fallback INJ Gift contract to `0x294cDD0Ac5B2ef8b23E2dc3A993E133356Ee72D5` so a missing deployment variable cannot silently authorize the Testnet contract.
- Add a manifest regression test asserting Mainnet chain ID, RPC, transaction permission, and allowed contract.

### INJ Gift

- Preserve an existing `AppError` thrown during wallet connection instead of wrapping it in a generic `RPC_ERROR`.
- Add a regression test proving `WRONG_NETWORK` survives the connection boundary.
- Keep standalone browser-wallet switching behavior unchanged.

## Runtime Contract

Production must set `NEXT_PUBLIC_INJ_GIFT_CONTRACT_ADDRESS=0x294cDD0Ac5B2ef8b23E2dc3A993E133356Ee72D5` in INJ Pass. INJ Gift remains configured with `NEXT_PUBLIC_NETWORK=mainnet`, `NEXT_PUBLIC_EVM_CHAIN_ID=1776`, the Mainnet EVM RPC URL, and the same contract address.

## Verification

- Observe each new regression test fail before changing production code.
- Run focused tests in both repositories.
- Run full tests, type checking, and production builds in both repositories where scripts are available.
- Do not modify or include the existing uncommitted auth/passkey work in the INJ Pass implementation commit.
