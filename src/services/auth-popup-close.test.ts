import { afterEach, describe, expect, it, vi } from 'vitest';

import { watchPopupClosed } from '@/lib/auth-bridge';

describe('authorization popup close monitoring', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps watching after the five-second request retry window', async () => {
    vi.useFakeTimers();
    const popup = { closed: false } as Window;
    const onClose = vi.fn();
    const stop = watchPopupClosed(popup, onClose);

    await vi.advanceTimersByTimeAsync(6_000);
    expect(onClose).not.toHaveBeenCalled();

    Object.defineProperty(popup, 'closed', { configurable: true, value: true });
    await vi.advanceTimersByTimeAsync(250);

    expect(onClose).toHaveBeenCalledTimes(1);
    stop();
  });
});
