import { describe, expect, it } from 'vitest';

import {
  connectionErrorMessage,
  connectionErrorPayload,
  InjPassConnectionError,
} from '@/lib/injpass-connection-error';

describe('INJ Pass connection errors', () => {
  it.each([
    ['USER_CANCELLED', 'Authentication window was closed'],
    ['POPUP_BLOCKED', 'Popup blocked'],
    ['CONNECTION_TIMEOUT', 'Connection timeout'],
  ] as const)('serializes %s without losing the legacy error string', (code, message) => {
    expect(connectionErrorPayload(new InjPassConnectionError(code, message))).toEqual({
      code,
      error: message,
    });
  });

  it('localizes cancellation without changing the protocol code', () => {
    expect(connectionErrorMessage('USER_CANCELLED', 'zh-CN')).toBe('你已取消 INJ Pass 连接。');
    expect(connectionErrorMessage('USER_CANCELLED', 'en')).toBe('INJ Pass connection was cancelled.');
  });
});
