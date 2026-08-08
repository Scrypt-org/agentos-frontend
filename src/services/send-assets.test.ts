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
  it('accepts the native asset regardless of case or padding', () => {
    expect(parseSendAsset('mon')).toBe('MON');
    expect(parseSendAsset(' MON ')).toBe('MON');
  });

  it('rejects assets Send has no transfer path for', () => {
    // USDC/USDT pointed at Injective testnet contracts with no Monad
    // equivalent, and the sponsor relay backend has been removed. A deep
    // link must not silently fall back to MON and send the wrong coin.
    expect(parseSendAsset('USDC')).toBeNull();
    expect(parseSendAsset('USDT')).toBeNull();
    expect(parseSendAsset('LAM')).toBeNull();
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
    expect(isSendableSymbol('MON')).toBe(true);
    expect(isSendableSymbol('USDC')).toBe(false);
  });
});

describe('getSendTransferMode', () => {
  it('has a native mode for every supported asset', () => {
    for (const asset of SEND_ASSETS) {
      expect(getSendTransferMode(asset)).toBe('native');
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
    expect(buildSendHref('MON')).toBe('/send?asset=MON');
  });

  it('carries a recipient alongside the asset', () => {
    expect(buildSendHref('MON', '0xabc')).toBe('/send?asset=MON&address=0xabc');
  });
});

describe('DEFAULT_SEND_ASSET', () => {
  it('is a supported asset', () => {
    expect(parseSendAsset(DEFAULT_SEND_ASSET)).toBe(DEFAULT_SEND_ASSET);
  });
});
