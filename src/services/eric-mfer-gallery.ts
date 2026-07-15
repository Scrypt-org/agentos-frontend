import type { CatNFT } from './catnft';

export function resolveSelectedTokenId(
  items: CatNFT[],
  currentTokenId: string | null,
): string | null {
  if (
    currentTokenId
    && items.some((item) => item.tokenId === currentTokenId)
  ) {
    return currentTokenId;
  }
  return items[0]?.tokenId ?? null;
}
