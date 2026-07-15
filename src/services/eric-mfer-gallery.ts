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

export function isEricMferMintCreditUsedNotice(notice: string): boolean {
  return /already minted its eric mfer|complimentary mint already used|no mint credits remaining/i.test(
    notice,
  );
}
