/**
 * Which assets the Send page can actually move, and how each one is paid for.
 *
 * This lives outside the page so the dashboard can link into Send with a
 * preselected asset without knowing anything about how that asset transfers.
 */

import { TOKENS, type TokenInfo } from './tokens';

export const SEND_ASSETS = ['INJ', 'USDC', 'USDT'] as const;

export type SendAsset = (typeof SEND_ASSETS)[number];

export const DEFAULT_SEND_ASSET: SendAsset = 'INJ';

/**
 * native    - INJ itself, sent as the transaction value
 * sponsored - relayed gaslessly by the sponsor worker (EIP-712 authorization)
 * erc20     - a plain ERC-20 `transfer`, gas paid in INJ by the sender
 */
export type SendTransferMode = 'native' | 'sponsored' | 'erc20';

const TRANSFER_MODES: Record<SendAsset, SendTransferMode> = {
  INJ: 'native',
  USDC: 'sponsored',
  USDT: 'erc20',
};

/**
 * Normalize an untrusted symbol (URL param, drag payload, dashboard card) into
 * an asset Send supports. Returns null for anything Send cannot move, so
 * callers never link into a screen that would silently fall back to INJ.
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
