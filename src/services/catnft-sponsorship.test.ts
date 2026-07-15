import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-base', () => ({ API_BASE_URL: 'https://api.example.test' }));
vi.mock('./passkey', () => ({ getAuthToken: () => null }));

import { waitForCatNftSponsorship } from './catnft';

const hash = `0x${'1'.repeat(64)}` as const;

describe('waitForCatNftSponsorship', () => {
  it('waits for a successful funding receipt', async () => {
    const waitForReceipt = vi.fn().mockResolvedValue({ status: 'success' });

    await expect(
      waitForCatNftSponsorship(hash, waitForReceipt),
    ).resolves.toBeUndefined();
    expect(waitForReceipt).toHaveBeenCalledWith({ hash });
  });

  it('stops minting when the funding transaction reverts', async () => {
    const waitForReceipt = vi.fn().mockResolvedValue({ status: 'reverted' });

    await expect(
      waitForCatNftSponsorship(hash, waitForReceipt),
    ).rejects.toThrow('sponsorship transaction reverted');
  });
});
