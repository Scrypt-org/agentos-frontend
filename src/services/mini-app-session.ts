export function getMiniAppSessionAddress(
  isAuthenticated: boolean,
  address?: string | null,
): string | null {
  return isAuthenticated && address ? address : null;
}

export function getMiniAppFrameKey(appId: string, frameNonce: number): string {
  return `${appId}-${frameNonce}`;
}
