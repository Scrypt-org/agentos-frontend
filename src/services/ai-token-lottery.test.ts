import { describe, expect, it } from 'vitest';
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
