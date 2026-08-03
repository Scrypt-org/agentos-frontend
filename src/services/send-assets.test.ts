import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SEND_ASSET,
  SEND_ASSETS,
  buildSendHref,
  getSendAssetToken,
  getSendTransferMode,
  isSendableSymbol,
  parseSendAsset,
} from './send-assets';

describe('parseSendAsset', () => {
  it('accepts every supported symbol regardless of case or padding', () => {
    expect(parseSendAsset('usdt')).toBe('USDT');
    expect(parseSendAsset(' USDC ')).toBe('USDC');
    expect(parseSendAsset('INJ')).toBe('INJ');
  });

  it('rejects balances Send has no transfer path for', () => {
    // These render in the dashboard asset list but cannot be moved, so a deep
    // link must not silently fall back to INJ and send the wrong coin.
    expect(parseSendAsset('LAM')).toBeNull();
    expect(parseSendAsset('XAUT')).toBeNull();
  });

  it('rejects empty and unknown input', () => {
    expect(parseSendAsset(null)).toBeNull();
    expect(parseSendAsset(undefined)).toBeNull();
    expect(parseSendAsset('')).toBeNull();
    expect(parseSendAsset('NOTATOKEN')).toBeNull();
  });
});

describe('isSendableSymbol', () => {
  it('agrees with parseSendAsset', () => {
    expect(isSendableSymbol('USDT')).toBe(true);
    expect(isSendableSymbol('LAM')).toBe(false);
  });
});

describe('getSendTransferMode', () => {
  it('routes USDC through the gas sponsor and everything else to self-paid gas', () => {
    expect(getSendTransferMode('USDC')).toBe('sponsored');
    expect(getSendTransferMode('INJ')).toBe('native');
    expect(getSendTransferMode('USDT')).toBe('erc20');
  });

  it('has a mode for every supported asset', () => {
    for (const asset of SEND_ASSETS) {
      expect(getSendTransferMode(asset)).toBeDefined();
    }
  });
});

describe('getSendAssetToken', () => {
  it('resolves each supported asset to a token with an address and decimals', () => {
    for (const asset of SEND_ASSETS) {
      const token = getSendAssetToken(asset);
      expect(token.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(token.decimals).toBeGreaterThan(0);
    }
  });
});

describe('buildSendHref', () => {
  it('carries the asset into the Send page', () => {
    expect(buildSendHref('USDT')).toBe('/send?asset=USDT');
  });

  it('carries a recipient alongside the asset', () => {
    expect(buildSendHref('USDC', '0xabc')).toBe('/send?asset=USDC&address=0xabc');
  });
});

describe('DEFAULT_SEND_ASSET', () => {
  it('is a supported asset', () => {
    expect(parseSendAsset(DEFAULT_SEND_ASSET)).toBe(DEFAULT_SEND_ASSET);
  });
});
