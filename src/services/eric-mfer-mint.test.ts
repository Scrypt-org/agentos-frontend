import { describe, expect, it, vi } from 'vitest';

import type { CatNFT } from './catnft';
import {
  getInitialEricMferLanguage,
  waitForMintedCatNFT,
} from './eric-mfer-mint';

const owner = `0x${'2'.repeat(40)}` as const;
const nft = {
  tokenId: '8',
  owner,
  image: 'https://example.test/8.png',
} as CatNFT;

describe('waitForMintedCatNFT', () => {
  it('returns immediately when the NFT and artwork are available', async () => {
    const loadDetails = vi.fn().mockResolvedValue(nft);
    const loadOwned = vi.fn().mockResolvedValue([nft]);

    const result = await waitForMintedCatNFT({
      tokenId: '8',
      owner,
      attempts: 3,
      delay: vi.fn(),
      loadDetails,
      loadOwned,
    });

    expect(result).toEqual({ nft, ownedNFTs: [nft], timedOut: false });
    expect(loadDetails).toHaveBeenCalledTimes(1);
  });

  it('continues polling until NFT metadata contains artwork', async () => {
    const nftWithoutArtwork = { ...nft, image: undefined };
    const loadDetails = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(nftWithoutArtwork)
      .mockResolvedValueOnce(nft);
    const delay = vi.fn().mockResolvedValue(undefined);

    const result = await waitForMintedCatNFT({
      tokenId: '8',
      owner,
      attempts: 4,
      delay,
      loadDetails,
      loadOwned: vi.fn().mockResolvedValue([nft]),
    });

    expect(result.timedOut).toBe(false);
    expect(result.nft).toEqual(nft);
    expect(loadDetails).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it('returns the last on-chain NFT as partial success after timeout', async () => {
    const partialNFT = { ...nft, image: undefined };

    const result = await waitForMintedCatNFT({
      tokenId: '8',
      owner,
      attempts: 2,
      delay: vi.fn().mockResolvedValue(undefined),
      loadDetails: vi.fn().mockResolvedValue(partialNFT),
      loadOwned: vi.fn().mockResolvedValue([partialNFT]),
    });

    expect(result).toEqual({ nft: partialNFT, ownedNFTs: [partialNFT], timedOut: true });
  });
});

describe('getInitialEricMferLanguage', () => {
  it('is deterministic for server and first client render', () => {
    expect(getInitialEricMferLanguage()).toBe('en');
  });
});
