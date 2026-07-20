import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  lotteryStateCanDraw,
  normalizeLotteryLanguage,
} from './ai-token-lottery-helpers';

describe('AI Token lottery helpers', () => {
  it.each([
    ['zh-CN', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['de-DE', 'de'],
    ['fr-FR', 'fr'],
    ['unknown', 'en'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeLotteryLanguage(input)).toBe(expected);
  });

  it('only enables drawing for eligible state', () => {
    expect(lotteryStateCanDraw('eligible')).toBe(true);
    expect(lotteryStateCanDraw('claimed')).toBe(false);
    expect(lotteryStateCanDraw('expired')).toBe(false);
  });
});

describe('AI Token lottery mini app contract', () => {
  it('uses backend-authoritative rewards and renders terminal states', async () => {
    const source = await readFile(
      new URL('../../app/mini-apps/ai-token-lottery/page.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('drawLotteryReward');
    expect(source).toContain('getLotteryStatus');
    expect(source).not.toContain('const PRIZES');
    expect(source).toContain("'eligible'");
    expect(source).toContain("'claimed'");
    expect(source).toContain("'expired'");
    expect(source).toContain("'eligibility_expired'");
  });
});
