import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import PasskeyWalletActions from '../../app/components/PasskeyWalletActions';

describe('PasskeyWalletActions', () => {
  it('keeps PRF creation and backward-compatible recovery visible together', () => {
    const html = renderToStaticMarkup(
      <PasskeyWalletActions
        isLight={false}
        pendingAction={null}
        onCreate={vi.fn()}
        onEnterExisting={vi.fn()}
      />,
    );

    expect(html).toContain('Create New Wallet');
    expect(html).toContain('Use another Passkey');
    expect(html).toContain('Open an existing new or legacy Passkey wallet');
  });
});
