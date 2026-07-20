import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import MobileSidebarFrame from '../../app/components/MobileSidebarFrame';

describe('MobileSidebarFrame', () => {
  it('keeps the closed mobile drawer off canvas and non-interactive', () => {
    const html = renderToStaticMarkup(
      <MobileSidebarFrame open={false} isLight={false} onClose={vi.fn()}>
        <span>Navigation</span>
      </MobileSidebarFrame>,
    );

    expect(html).toContain('-translate-x-full');
    expect(html).toContain('invisible');
    expect(html).toContain('lg:visible');
    expect(html).toContain('pointer-events-none');
  });

  it('exposes the open mobile drawer as a modal navigation surface', () => {
    const html = renderToStaticMarkup(
      <MobileSidebarFrame open isLight onClose={vi.fn()}>
        <span>Navigation</span>
      </MobileSidebarFrame>,
    );

    expect(html).toContain('id="injpass-primary-sidebar"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('translate-x-0');
    expect(html).toContain('visible');
    expect(html).toContain('w-[min(86vw,320px)]');
    expect(html).toContain('Navigation');
  });
});
