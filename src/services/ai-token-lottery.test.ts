import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  createUnavailableLotteryStatus,
  expireLotteryStatus,
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

  it('creates a stable wallet-unavailable state for guests', () => {
    expect(createUnavailableLotteryStatus()).toMatchObject({
      state: 'wallet_unavailable',
      rewardLam: 0,
      remainingLam: 0,
    });
  });

  it('turns a claimed reward into an expired display state at its boundary', () => {
    expect(expireLotteryStatus({
      ...createUnavailableLotteryStatus(),
      state: 'claimed',
      expiresAt: '2026-08-01T00:00:00.000Z',
      remainingLam: 1.5,
    }, new Date('2026-08-01T00:00:00.000Z').getTime())).toMatchObject({
      state: 'expired',
      remainingLam: 0,
    });
  });
});

describe('AI Token lottery mini app contract', () => {
  it('is available in the Apps market without being pinned in the sidebar', async () => {
    const source = await readFile(
      new URL('../../app/components/InjPassChatShell.tsx', import.meta.url),
      'utf8',
    );
    const lotteryApp = source.match(
      /\{\n    id: 'ai-token-lottery',[\s\S]*?\n  \},/,
    )?.[0];
    expect(lotteryApp).toContain('aiDriven: true,');
    expect(source).toMatch(
      /\.filter\(\s*\(app\) => app\.aiDriven && app\.id !== 'ai-token-lottery',?\s*\)/,
    );
  });

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
