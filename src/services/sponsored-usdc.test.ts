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
  networkFeeSymbol: 'INJ',
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
      message: 'Sign in to use sponsored USDC transfers.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps known backend error codes and normalizes unknown error codes', async () => {
    const knownFetch = vi.fn().mockResolvedValue(jsonResponse({
      code: 'INSUFFICIENT_USDC',
      message: 'The wallet does not have enough USDC.',
    }, 400));
    const unknownFetch = vi.fn().mockResolvedValue(jsonResponse({
      code: 'UNSTABLE_INTERNAL_CODE',
      message: 'Unexpected server implementation detail.',
    }, 500));

    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', knownFetch),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_USDC',
      message: 'The wallet does not have enough USDC.',
    });
    await expect(
      prepareSponsoredUsdcTransfer(recipient, '10', unknownFetch),
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

  it('exports an error class with the stable sponsored-USDC code', () => {
    const error = new SponsoredUsdcApiError(
      'AUTHORIZATION_EXPIRED',
      sponsoredUsdcErrorMessage('AUTHORIZATION_EXPIRED'),
    );

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
