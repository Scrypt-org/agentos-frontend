import type { Address } from 'viem';

import type { CatNFT } from './catnft';

interface WaitForMintedCatNFTOptions {
  tokenId: string;
  owner: Address;
  attempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
  loadDetails: (tokenId: bigint) => Promise<CatNFT | null>;
  loadOwned: (owner: Address) => Promise<CatNFT[]>;
}

export interface MintedCatNFTDiscovery {
  nft: CatNFT | null;
  ownedNFTs: CatNFT[];
  timedOut: boolean;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

export function getInitialEricMferLanguage(): 'en' {
  return 'en';
}

export async function waitForMintedCatNFT({
  tokenId,
  owner,
  attempts = 10,
  delay = wait,
  loadDetails,
  loadOwned,
}: WaitForMintedCatNFTOptions): Promise<MintedCatNFTDiscovery> {
  const totalAttempts = Math.max(1, attempts);
  let lastNFT: CatNFT | null = null;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const candidate = await loadDetails(BigInt(tokenId)).catch(() => null);
    if (candidate?.owner.toLowerCase() === owner.toLowerCase()) {
      lastNFT = candidate;
      if (candidate.image) {
        const ownedNFTs = await loadOwned(owner).catch(() => [candidate]);
        return { nft: candidate, ownedNFTs, timedOut: false };
      }
    }

    if (attempt < totalAttempts - 1) {
      await delay(Math.min(1_000 + attempt * 750, 4_000));
    }
  }

  const ownedNFTs = await loadOwned(owner).catch(() => lastNFT ? [lastNFT] : []);
  const ownedMatch = ownedNFTs.find((item) => item.tokenId === tokenId) ?? null;
  return {
    nft: ownedMatch ?? lastNFT,
    ownedNFTs,
    timedOut: true,
  };
}
