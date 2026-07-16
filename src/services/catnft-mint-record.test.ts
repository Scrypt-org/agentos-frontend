import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-base', () => ({ API_BASE_URL: 'https://api.example.test' }));
vi.mock('./passkey', () => ({ getAuthToken: () => null }));

import { syncCatMintRecord } from './catnft';

const payload = {
  tokenId: '8',
  txHash: `0x${'1'.repeat(64)}` as const,
  ownerAddress: `0x${'2'.repeat(40)}` as const,
  source: 'eric-mfer',
};

describe('syncCatMintRecord', () => {
  it('retries a transient backend failure', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'temporary' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const delay = vi.fn().mockResolvedValue(undefined);

    const result = await syncCatMintRecord(payload, {
      attempts: 3,
      delay,
      fetchImpl,
    });

    expect(result).toEqual({ recordSynced: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it('returns a warning instead of throwing after all attempts fail', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('backend offline'));

    const result = await syncCatMintRecord(payload, {
      attempts: 2,
      delay: vi.fn().mockResolvedValue(undefined),
      fetchImpl,
    });

    expect(result.recordSynced).toBe(false);
    expect(result.recordSyncWarning).toContain('backend offline');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
