/**
 * Which assets the Send page can actually move, and how each one is paid for.
 *
 * This lives outside the page so the dashboard can link into Send with a
 * preselected asset without knowing anything about how that asset transfers.
 */

import { TOKENS, type TokenInfo } from './tokens';

// USDC (sponsored/gasless) and USDT (plain ERC-20) both pointed at Injective
// testnet contract addresses with no Monad equivalent, and the sponsor relay
// backend has been removed — so Send only moves the native asset for now.
export const SEND_ASSETS = ['MON'] as const;

export type SendAsset = (typeof SEND_ASSETS)[number];

export const DEFAULT_SEND_ASSET: SendAsset = 'MON';

/**
 * native    - MON itself, sent as the transaction value
 * sponsored - relayed gaslessly by the sponsor worker (EIP-712 authorization)
 * erc20     - a plain ERC-20 `transfer`, gas paid in MON by the sender
 */
export type SendTransferMode = 'native' | 'sponsored' | 'erc20';

const TRANSFER_MODES: Record<SendAsset, SendTransferMode> = {
  MON: 'native',
};

/**
 * Normalize an untrusted symbol (URL param, drag payload, dashboard card) into
 * an asset Send supports. Returns null for anything Send cannot move, so
 * callers never link into a screen that would silently fall back to MON.
 */
export function parseSendAsset(value: string | null | undefined): SendAsset | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return SEND_ASSETS.find((asset) => asset === normalized) ?? null;
}

export function isSendableSymbol(symbol: string): boolean {
  return parseSendAsset(symbol) !== null;
}

export function getSendTransferMode(asset: SendAsset): SendTransferMode {
  return TRANSFER_MODES[asset];
}

export function getSendAssetToken(asset: SendAsset): TokenInfo {
  const token = TOKENS[asset];
  if (!token) {
    throw new Error(`Send asset ${asset} is missing from the token registry`);
  }
  return token;
}

/**
 * Deep link into the Send page with the asset already selected.
 */
export function buildSendHref(asset: SendAsset, recipient?: string): string {
  const params = new URLSearchParams({ asset });
  if (recipient) params.set('address', recipient);
  return `/send?${params.toString()}`;
}
