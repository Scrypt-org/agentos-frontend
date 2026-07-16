import { describe, expect, it } from 'vitest';

import {
  isCampaignVisible,
  visibleComposerDApps,
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

  it('hides the Elon Musk campaign entry', () => {
    expect(isCampaignVisible('bankrupt-elon-musk')).toBe(false);
  });
});
