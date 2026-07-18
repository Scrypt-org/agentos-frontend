import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  InjPassConnector,
  InjPassConnectorError,
} from '../../packages/injpass-connector/src/index';

function installFakeBrowser() {
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  let appendedIframes = 0;
  const iframe = {
    contentWindow: { postMessage: vi.fn() },
    onerror: null as null | (() => void),
    remove: vi.fn(),
    setAttribute: vi.fn(),
    style: {} as Record<string, string>,
    src: '',
  } as unknown as HTMLIFrameElement;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://www.inj-gift.fun' },
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        const current = listeners.get(type) ?? new Set();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        listeners.get(type)?.delete(listener);
      },
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { appendChild: () => { appendedIframes += 1; } },
      createElement: (tag: string) => tag === 'iframe' ? iframe : { style: {}, remove: vi.fn() },
      getElementById: () => null,
    },
  });

  return {
    iframe,
    appendedIframes: () => appendedIframes,
    emitMessage(data: unknown) {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          data,
          origin: 'https://www.injpass.com',
          source: iframe.contentWindow,
        } as unknown as MessageEvent);
      }
    },
  };
}

describe('INJ Pass connector connection lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('shares one in-flight attempt and allows retry after cancellation', async () => {
    vi.useFakeTimers();
    const browser = installFakeBrowser();
    const connector = new InjPassConnector({ embedUrl: 'https://www.injpass.com/embed' });

    const first = connector.connect();
    const duplicate = connector.connect();
    expect(browser.appendedIframes()).toBe(1);

    browser.emitMessage({
      type: 'INJPASS_ERROR',
      code: 'USER_CANCELLED',
      error: 'Authentication window was closed',
    });

    await expect(first).rejects.toBeInstanceOf(InjPassConnectorError);
    await expect(duplicate).rejects.toMatchObject({ code: 'USER_CANCELLED' });

    void connector.connect();
    expect(browser.appendedIframes()).toBe(2);
  });
});
