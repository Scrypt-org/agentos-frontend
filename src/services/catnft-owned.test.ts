import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-base', () => ({ API_BASE_URL: 'https://api.example.test' }));
vi.mock('./passkey', () => ({ getAuthToken: () => 'auth-token' }));

import { getIndexedCatNFTsForOwner, type CatNFT } from './catnft';

const owner = `0x${'1'.repeat(40)}` as const;
const otherOwner = `0x${'2'.repeat(40)}` as const;
const contractAddress = `0x${'3'.repeat(40)}` as const;

function indexedResponse(items: Array<Record<string, unknown>>, responseOwner = owner) {
  return new Response(
    JSON.stringify({ ownerAddress: responseOwner, contractAddress, items }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function detail(tokenId: string, detailOwner = owner): CatNFT {
  return {
    contractAddress,
    tokenId,
    name: `Chain mfer #${tokenId.padStart(3, '0')}`,
    image: `https://images.example/${tokenId}.png`,
    collection: 'eric mfer',
    owner: detailOwner,
    tokenURI: `ipfs://metadata/${tokenId}.json`,
  };
}

describe('getIndexedCatNFTsForOwner', () => {
  it('publishes database cards before chain detail enrichment completes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(indexedResponse([
      { tokenId: '8', ownerAddress: owner, txHash: `0x${'8'.repeat(64)}`, name: 'Indexed #008' },
    ]));
    let releaseDetails!: (value: CatNFT) => void;
    const loadDetails = vi.fn(() => new Promise<CatNFT>((resolve) => {
      releaseDetails = resolve;
    }));
    const onIndexed = vi.fn();

    const resultPromise = getIndexedCatNFTsForOwner(owner, {
      fetchImpl,
      loadDetails,
      onIndexed,
    });
    await vi.waitFor(() => expect(onIndexed).toHaveBeenCalledTimes(1));
    expect(onIndexed.mock.calls[0][0]).toEqual([
      expect.objectContaining({ tokenId: '8', name: 'Indexed #008' }),
    ]);

    releaseDetails(detail('8'));
    await expect(resultPromise).resolves.toEqual([
      expect.objectContaining({ tokenId: '8', name: 'Chain mfer #008' }),
    ]);
  });

  it('enriches indexed token IDs in parallel and preserves backend ordering', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(indexedResponse([
      { tokenId: '8', ownerAddress: owner, txHash: `0x${'8'.repeat(64)}`, name: 'Indexed #008' },
      { tokenId: '2', ownerAddress: owner, txHash: `0x${'2'.repeat(64)}`, name: 'Indexed #002' },
    ]));
    const loadDetails = vi.fn(async (tokenId: bigint) => detail(tokenId.toString()));

    const items = await getIndexedCatNFTsForOwner(owner, { fetchImpl, loadDetails });

    expect(items.map((item) => item.tokenId)).toEqual(['8', '2']);
    expect(items.map((item) => item.name)).toEqual(['Chain mfer #008', 'Chain mfer #002']);
    expect(loadDetails).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/catnft/owned',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer auth-token' }),
      }),
    );
  });

  it('filters a database record when chain ownership belongs to another wallet', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(indexedResponse([
      { tokenId: '8', ownerAddress: owner, txHash: `0x${'8'.repeat(64)}`, name: 'Indexed #008' },
      { tokenId: '2', ownerAddress: owner, txHash: `0x${'2'.repeat(64)}`, name: 'Indexed #002' },
    ]));
    const loadDetails = vi.fn(async (tokenId: bigint) =>
      detail(tokenId.toString(), tokenId === 8n ? otherOwner : owner));

    const items = await getIndexedCatNFTsForOwner(owner, { fetchImpl, loadDetails });

    expect(items.map((item) => item.tokenId)).toEqual(['2']);
  });

  it('keeps indexed fallback cards when detail enrichment is temporarily unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(indexedResponse([
      {
        tokenId: '8',
        ownerAddress: owner,
        txHash: `0x${'8'.repeat(64)}`,
        name: 'Indexed #008',
        image: 'ipfs://image-cid',
      },
    ]));
    const loadDetails = vi.fn().mockRejectedValue(new Error('RPC unavailable'));

    const items = await getIndexedCatNFTsForOwner(owner, { fetchImpl, loadDetails });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tokenId: '8',
      name: 'Indexed #008',
      image: expect.stringContaining('/ipfs/image-cid'),
    });
  });

  it('rejects an indexed response scoped to a different owner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(indexedResponse([], otherOwner));

    await expect(
      getIndexedCatNFTsForOwner(owner, { fetchImpl, loadDetails: vi.fn() }),
    ).resolves.toEqual([]);
  });

  it('returns an empty list when the backend index is unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      getIndexedCatNFTsForOwner(owner, { fetchImpl, loadDetails: vi.fn() }),
    ).resolves.toEqual([]);
  });
});
