import { describe, expect, it } from 'vitest';

import { isCurrentAuthRequestMessage } from './auth-bridge';

describe('isCurrentAuthRequestMessage', () => {
  const requestId = 'request-123';

  it.each(['WALLET_CONNECT', 'PASSKEY_SIGN', 'SIGN_REQUEST', 'TX_REQUEST'])(
    'accepts the %s protocol message for the current request',
    (type) => {
      const payloadByType = {
        WALLET_CONNECT: { type, requestId, origin: 'https://www.injpass.com' },
        PASSKEY_SIGN: { type, requestId, origin: 'https://www.injpass.com', message: 'Sign in' },
        SIGN_REQUEST: { type, requestId, message: 'Sign in' },
        TX_REQUEST: { type, requestId, tx: { to: '0x1234' } },
      };
      expect(isCurrentAuthRequestMessage(
        payloadByType[type as keyof typeof payloadByType],
        requestId,
      )).toBe(true);
    },
  );

  it('ignores unrelated window messages', () => {
    expect(isCurrentAuthRequestMessage({ type: 'extension-message' }, requestId)).toBe(false);
    expect(isCurrentAuthRequestMessage('not-an-object', requestId)).toBe(false);
  });

  it('ignores protocol messages for another request', () => {
    expect(isCurrentAuthRequestMessage({
      type: 'WALLET_CONNECT',
      requestId: 'another-request',
    }, requestId)).toBe(false);
  });
});
