import { describe, expect, it } from 'vitest';

import {
  MINI_APP_FRAME_CLASS,
  MINI_APP_PANEL_CLASS,
  mainContentOverflowClass,
} from '@/lib/mini-app-layout';

describe('mini app host layout', () => {
  it('gives mini apps a single iframe-owned scroll container', () => {
    expect(mainContentOverflowClass('mini-app')).toBe('overflow-hidden');
    expect(MINI_APP_PANEL_CLASS).toContain('h-full');
    expect(MINI_APP_PANEL_CLASS).toContain('min-h-0');
    expect(MINI_APP_PANEL_CLASS).not.toContain('100dvh');
    expect(MINI_APP_PANEL_CLASS).not.toContain('min-h-[560px]');
    expect(MINI_APP_FRAME_CLASS).toContain('h-full');
    expect(MINI_APP_FRAME_CLASS).toContain('w-full');
    expect(MINI_APP_FRAME_CLASS).toContain('min-h-0');
  });

  it('keeps normal INJ Pass surfaces host-scrollable', () => {
    expect(mainContentOverflowClass('default')).toBe('overflow-y-auto');
    expect(mainContentOverflowClass('skills')).toBe('overflow-y-auto');
  });
});
