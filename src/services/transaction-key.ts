export function resolveTransactionKey(
  authorizedKey: Uint8Array | null | undefined,
  contextKey: Uint8Array | null,
): Uint8Array | null {
  return authorizedKey ?? contextKey;
}
