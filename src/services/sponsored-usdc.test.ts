import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const viemMock = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  http: vi.fn(),
  readContract: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  getAuthToken: vi.fn<() => string | null>(),
}));

vi.mock('./api-base', () => ({ API_BASE_URL: 'https://api.example.test' }));
vi.mock('./passkey', () => ({ getAuthToken: authMock.getAuthToken }));
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: viemMock.createPublicClient,
    http: viemMock.http,
  };
});

import {
  SponsoredUsdcApiError,
  formatUsdcUnits,
  getSponsoredUsdcTransfer,
  getUsdcBalance,
  isSponsoredUsdcPending,
  isSponsoredUsdcTerminal,
  parseUsdcUnits,
  pollSponsoredUsdcTransfer,
  prepareSponsoredUsdcTransfer,
  sponsoredUsdcErrorMessage,
  submitSponsoredUsdcTransfer,
  type SponsoredUsdcPrepareResponse,
  type SponsoredUsdcTransfer,
  type SponsoredUsdcTransferStatus,
} from './sponsored-usdc';

const owner = '0x0000000000000000000000000000000000000001' as const;
const recipient = '0x0000000000000000000000000000000000000002' as const;
const transferId = 'e55ed81d-5e29-4c36-bc9c-43910dc69f5a';
const signature = `0x${'11'.repeat(65)}` as const;

const prepareResponse: SponsoredUsdcPrepareResponse = {
  transferId,
  typedData: {
    domain: {
      name: 'USDC',
      version: '2',
      chainId: 1439,
      verifyingContract: '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d',
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: owner,
      to: recipient,
      value: '10000000',
      validAfter: '0',
      validBefore: '1780000000',
      nonce: `0x${'33'.repeat(32)}`,
    },
  },
  expiresAt: '2026-06-01T00:00:00.000Z',
  networkFee: '0',
  networkFeeSymbol: 'MON',
  sponsored: true,
};

const baseTransfer: SponsoredUsdcTransfer = {
  id: transferId,
  status: 'QUEUED',
  fromAddress: owner,
  toAddress: recipient,
  amount: '10000000',
  expiresAt: '2026-06-01T00:00:00.000Z',
  txHash: null,
  explorerUrl: null,
  failureCode: null,
  createdAt: '2026-05-31T23:59:00.000Z',
  confirmedAt: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sponsored USDC client', () => {
  beforeEach(() => {
    authMock.getAuthToken.mockReturnValue('auth-token');
    viemMock.createPublicClient.mockReturnValue({
      readContract: viemMock.readContract,
    });
    viemMock.http.mockReturnValue({});
    viemMock.readContract.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('formats and parses six-decimal USDC units without Number conversion', () => {
    expect(formatUsdcUnits(12_345_678n)).toBe('12.345678');
    expect(formatUsdcUnits(10_000_000n)).toBe('10');
    expect(parseUsdcUnits('12.345678')).toBe(12_345_678n);
    expect(() => parseUsdcUnits('0')).toThrow();
    expect(() => parseUsdcUnits('0.0000001')).toThrow();
  });

  it('reads the ERC-20 balance and requires six decimals', async () => {
    viemMock.readContract
      .mockResolvedValueOnce(12_345_678n)
      .mockResolvedValueOnce(6);

    await expect(getUsdcBalance(owner)).resolves.toEqual({
      value: 12_345_678n,
      formatted: '12.345678',
      decimals: 6,
      symbol: 'USDC',
    });
    expect(viemMock.readContract).toHaveBeenNthCalledWith(1, {
      address: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
      abi: expect.any(Array),
      functionName: 'balanceOf',
      args: [owner],
    });
    expect(viemMock.readContract).toHaveBeenNthCalledWith(2, {
      address: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
      abi: expect.any(Array),
      functionName: 'decimals',
    });
  });

  it('rejects a token that does not report six decimals', async () => {
    viemMock.readContract.mockResolvedValueOnce(1n).mockResolvedValueOnce(18);

    await expect(getUsdcBalance(owner)).rejects.toThrow(
      'Circle USDC decimals must equal 6',
    );
  });

  it('posts only recipient and decimal amount to prepare with JWT auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(prepareResponse));

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', fetchImpl),
    ).resolves.toEqual(prepareResponse);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/sponsored-usdc-transfers/prepare',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer auth-token',
        },
        body: JSON.stringify({ recipient, amount: '10' }),
      },
    );
  });

  it('submits only the authorization signature and returns the transfer response', async () => {
    const response = { ...baseTransfer, status: 'SIGNED' as const };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(response));

    await expect(
      submitSponsoredUsdcTransfer(transferId, signature, fetchImpl),
    ).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example.test/sponsored-usdc-transfers/${transferId}/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer auth-token',
        },
        body: JSON.stringify({ signature }),
      },
    );
  });

  it.each(['0', '0.01', '10.5', '1000'] as const)(
    'accepts canonical backend-formatted amount %s from submit and status responses',
    async (amount) => {
      const response = { ...baseTransfer, amount };
      const submitFetch = vi.fn().mockResolvedValue(jsonResponse(response));
      const statusFetch = vi.fn().mockResolvedValue(jsonResponse(response));

      await expect(
        submitSponsoredUsdcTransfer(transferId, signature, submitFetch),
      ).resolves.toEqual(response);
      await expect(
        getSponsoredUsdcTransfer(transferId, statusFetch),
      ).resolves.toEqual(response);
    },
  );

  it('gets the transfer status with JWT auth and preserves the backend response shape', async () => {
    const response = {
      ...baseTransfer,
      status: 'BROADCASTING' as const,
      txHash: `0x${'44'.repeat(32)}`,
      explorerUrl: 'https://explorer.example.test/tx/44',
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(response));

    await expect(
      getSponsoredUsdcTransfer(transferId, fetchImpl),
    ).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example.test/sponsored-usdc-transfers/${transferId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer auth-token',
        },
      },
    );
  });

  it('requires a JWT before making a sponsored-USDC API request', async () => {
    authMock.getAuthToken.mockReturnValue(null);
    const fetchImpl = vi.fn();

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', fetchImpl),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses local messages for known and unknown backend error codes', async () => {
    const knownFetch = vi.fn().mockResolvedValue(jsonResponse({
      code: 'INSUFFICIENT_USDC',
      message: 'This untrusted backend message must never reach the UI.',
    }, 400));
    const unknownFetch = vi.fn().mockResolvedValue(jsonResponse({
      code: 'UNSTABLE_INTERNAL_CODE',
      message: 'Unexpected server implementation detail.',
    }, 500));

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', knownFetch),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_USDC',
      message: sponsoredUsdcErrorMessage('INSUFFICIENT_USDC'),
    });
    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', unknownFetch),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
  });

  it('normalizes rejected fetches and preserves already-normalized API errors', async () => {
    const normalized = new SponsoredUsdcApiError('INVALID_AMOUNT');
    const rejectedFetch = vi.fn().mockRejectedValue(
      new TypeError('CORS details must not reach the UI'),
    );
    const normalizedFetch = vi.fn().mockRejectedValue(normalized);

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', rejectedFetch),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', normalizedFetch),
    ).rejects.toBe(normalized);
  });

  it.each([
    ['unknown status', { ...baseTransfer, status: 'NOT_A_TRANSFER_STATE' }],
    ['malformed sender address', { ...baseTransfer, fromAddress: 'not-an-evm-address' }],
    ['malformed transaction hash', { ...baseTransfer, txHash: '0x1234' }],
    ['unsafe explorer URL', { ...baseTransfer, explorerUrl: 'javascript:alert(1)' }],
    ['invalid transfer ID', { ...baseTransfer, id: 'not-a-uuid' }],
    ['invalid timestamp', { ...baseTransfer, createdAt: 'not-a-timestamp' }],
  ])('rejects a transfer response with %s', async (_name, payload) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));

    await expect(
      getSponsoredUsdcTransfer(transferId, fetchImpl),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
  });

  it('rejects malformed typed-data addresses while preserving valid backend shapes', async () => {
    const payload = {
      ...prepareResponse,
      typedData: {
        ...prepareResponse.typedData,
        domain: {
          ...prepareResponse.typedData.domain,
          verifyingContract: 'not-an-evm-address',
        },
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', fetchImpl),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
  });

  it('validates every typed-data entry and preserves a valid typed-data object unchanged', async () => {
    const typedData = {
      ...prepareResponse.typedData,
      types: {
        ...prepareResponse.typedData.types,
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
        ],
      },
    };
    const payload = { ...prepareResponse, typedData };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    } as unknown as Response);

    const result = await prepareSponsoredUsdcTransfer(recipient, '10', fetchImpl);

    expect(result.typedData).toBe(typedData);
    expect(result).toEqual(payload);
  });

  it('rejects a malformed extra typed-data entry', async () => {
    const payload = {
      ...prepareResponse,
      typedData: {
        ...prepareResponse.typedData,
        types: {
          ...prepareResponse.typedData.types,
          EIP712Domain: { name: 'name', type: 'string' },
        },
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', fetchImpl),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
  });

  it('rejects an empty extra typed-data entry', async () => {
    const payload = {
      ...prepareResponse,
      typedData: {
        ...prepareResponse.typedData,
        types: {
          ...prepareResponse.typedData.types,
          EIP712Domain: [],
        },
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', fetchImpl),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
  });

  it.each([
    '1e3',
    '+1',
    '-1',
    ' 1',
    '1 ',
    '1.0000001',
    '01',
    '00',
    '00.1',
    '1.',
    '.1',
    '1.0',
    '10.50',
  ])('rejects non-canonical wire amount %s', async (amount) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      ...baseTransfer,
      amount,
    }));

    await expect(
      getSponsoredUsdcTransfer(transferId, fetchImpl),
    ).rejects.toMatchObject({
      code: 'RELAYER_UNAVAILABLE',
      message: sponsoredUsdcErrorMessage('RELAYER_UNAVAILABLE'),
    });
  });

  it.each([
    ['CREATED', false, true],
    ['SIGNED', false, true],
    ['QUEUED', false, true],
    ['BROADCASTING', false, true],
    ['CONFIRMED', true, false],
    ['EXPIRED', true, false],
    ['REJECTED', true, false],
    ['FAILED', true, false],
  ] as const)(
    'classifies %s as terminal=%s pending=%s',
    (status, terminal, pending) => {
      expect(isSponsoredUsdcTerminal(status)).toBe(terminal);
      expect(isSponsoredUsdcPending(status)).toBe(pending);
    },
  );

  it.each(['CONFIRMED', 'EXPIRED', 'REJECTED', 'FAILED'] as const)(
    'stops polling at terminal status %s',
    async (status: SponsoredUsdcTransferStatus) => {
      const fetchStatus = vi.fn().mockResolvedValue({ ...baseTransfer, status });
      const delay = vi.fn();

      await expect(pollSponsoredUsdcTransfer(transferId, {
        fetchStatus,
        delay,
        timeoutMs: 1_000,
      })).resolves.toMatchObject({ status });
      expect(fetchStatus).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
    },
  );

  it('returns the latest pending state on timeout without inventing a failure', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({
      ...baseTransfer,
      status: 'BROADCASTING' as const,
    });

    await expect(pollSponsoredUsdcTransfer(transferId, {
      fetchStatus,
      delay: vi.fn(),
      timeoutMs: 0,
    })).resolves.toMatchObject({ status: 'BROADCASTING' });
  });

  it('returns the latest pending transfer at the deadline when a status request hangs', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce({ ...baseTransfer, status: 'BROADCASTING' as const })
      .mockImplementationOnce((_id: string, signal?: AbortSignal) => {
        requestSignal = signal;
        return new Promise<SponsoredUsdcTransfer>(() => {});
      });
    const pollPromise = pollSponsoredUsdcTransfer(transferId, {
      fetchStatus,
      delay: vi.fn().mockResolvedValue(undefined),
      intervalMs: 0,
      timeoutMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    const deadlineResult = Promise.race([
      pollPromise,
      new Promise<'test-timeout'>((resolve) => {
        setTimeout(() => resolve('test-timeout'), 101);
      }),
    ]);
    await vi.advanceTimersByTimeAsync(101);

    await expect(deadlineResult).resolves.toMatchObject({ status: 'BROADCASTING' });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('bounds a pending poll delay to the remaining deadline', async () => {
    vi.useFakeTimers();
    let delaySignal: AbortSignal | undefined;
    const delay = vi.fn((_milliseconds: number, signal?: AbortSignal) => {
      delaySignal = signal;
      return new Promise<void>(() => {});
    });
    const pollPromise = pollSponsoredUsdcTransfer(transferId, {
      fetchStatus: vi.fn().mockResolvedValue({
        ...baseTransfer,
        status: 'QUEUED' as const,
      }),
      delay,
      timeoutMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    const deadlineResult = Promise.race([
      pollPromise,
      new Promise<'test-timeout'>((resolve) => {
        setTimeout(() => resolve('test-timeout'), 101);
      }),
    ]);
    await vi.advanceTimersByTimeAsync(101);

    await expect(deadlineResult).resolves.toMatchObject({ status: 'QUEUED' });
    expect(delay).toHaveBeenCalledWith(100, expect.any(AbortSignal));
    expect(delaySignal?.aborted).toBe(true);
  });

  it('exports an error class with the stable sponsored-USDC code', () => {
    const error = new SponsoredUsdcApiError('AUTHORIZATION_EXPIRED');

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('AUTHORIZATION_EXPIRED');
  });
});

describe('sponsored USDC token selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('selects the approved testnet USDC deployment', async () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK', 'testnet');
    vi.resetModules();

    const { TOKENS } = await import('./tokens');

    expect(TOKENS.USDC).toMatchObject({
      address: '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d',
      decimals: 6,
    });
  });

  it('selects the approved mainnet USDC deployment', async () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK', 'mainnet');
    vi.resetModules();

    const { TOKENS } = await import('./tokens');

    expect(TOKENS.USDC).toMatchObject({
      address: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
      decimals: 6,
    });
  });
});
