import { describe, expect, it } from 'vitest';

import {
  campaignAvailability,
  visibleComposerDApps,
  visibleMarketDApps,
  visibleSidebarDApps,
} from './dapp-visibility';

const dapps = [
  { id: 'inj-gift', name: 'INJ Gift' },
  { id: 'bankrupt-elon-musk', name: 'Bankrupt Elon Musk' },
  { id: 'omisper', name: 'Omisper' },
];

describe('dApp shell visibility', () => {
  it('hides Bankrupt Elon Musk from the sidebar', () => {
    expect(visibleSidebarDApps(dapps).map((app) => app.id)).toEqual([
      'inj-gift',
      'omisper',
    ]);
  });

  it('hides Bankrupt Elon Musk from @ composer suggestions', () => {
    expect(visibleComposerDApps(dapps).map((app) => app.id)).toEqual([
      'inj-gift',
      'omisper',
    ]);
  });

  it('hides Bankrupt Elon Musk from the Apps market', () => {
    expect(visibleMarketDApps(dapps).map((app) => app.id)).toEqual([
      'inj-gift',
      'omisper',
    ]);
  });

  it('keeps Campaign visible as coming soon', () => {
    expect(campaignAvailability).toBe('coming-soon');
  });
});
