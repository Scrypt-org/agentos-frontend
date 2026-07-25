import { describe, expect, it, vi } from 'vitest';
import { resolveTransactionKey } from './transaction-key';

function continueWithResolvedKey(
  authorizedKey: Uint8Array | null | undefined,
  contextKey: Uint8Array | null,
  signer: (key: Uint8Array) => void,
): boolean {
  const key = resolveTransactionKey(authorizedKey, contextKey);
  if (!key) return false;
  signer(key);
  return true;
}

describe('transaction key resolution', () => {
  it('passes the exact authorized key to the signer when context is null', () => {
    const authorizedKey = Uint8Array.from([1, 2, 3]);
    const signer = vi.fn();

    expect(continueWithResolvedKey(authorizedKey, null, signer)).toBe(true);
    expect(signer).toHaveBeenCalledOnce();
    expect(signer.mock.calls[0]?.[0]).toBe(authorizedKey);
  });

  it('prefers the authorized key over an available context key', () => {
    const authorizedKey = Uint8Array.from([1, 2, 3]);
    const contextKey = Uint8Array.from([4, 5, 6]);
    const signer = vi.fn();

    continueWithResolvedKey(authorizedKey, contextKey, signer);

    expect(signer.mock.calls[0]?.[0]).toBe(authorizedKey);
  });

  it('uses the context key for direct flows and returns null when unavailable', () => {
    const contextKey = Uint8Array.from([4, 5, 6]);

    expect(resolveTransactionKey(undefined, contextKey)).toBe(contextKey);
    expect(resolveTransactionKey(undefined, null)).toBeNull();
  });
});
