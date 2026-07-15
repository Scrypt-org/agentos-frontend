import { describe, expect, it } from 'vitest';
import type { CatNFT } from './catnft';
import { resolveSelectedTokenId } from './eric-mfer-gallery';

const owner = `0x${'1'.repeat(40)}` as const;
const contractAddress = `0x${'2'.repeat(40)}` as const;

function nft(tokenId: string): CatNFT {
  return {
    contractAddress,
    tokenId,
    name: `eric mfer #${tokenId}`,
    collection: 'eric mfer',
    owner,
    tokenURI: '',
  };
}

describe('resolveSelectedTokenId', () => {
  it('preserves a selected token that remains in the refreshed collection', () => {
    expect(resolveSelectedTokenId([nft('8'), nft('2'), nft('1')], '2')).toBe('2');
  });

  it('selects the first token when the previous selection disappears', () => {
    expect(resolveSelectedTokenId([nft('8'), nft('2')], '4')).toBe('8');
  });

  it('returns null for an empty collection', () => {
    expect(resolveSelectedTokenId([], '8')).toBeNull();
  });
});
