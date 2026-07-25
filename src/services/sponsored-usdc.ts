import {
  createPublicClient,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { ACTIVE_NETWORK, NETWORK_CONFIG } from '@/config/network';
import {
  INJECTIVE_MAINNET_CHAIN,
  INJECTIVE_TESTNET_CHAIN,
} from '@/types/chain';
import { API_BASE_URL } from './api-base';
import { getAuthToken } from './passkey';
import { TOKENS } from './tokens';

export const USDC_DECIMALS = 6;
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

const SPONSORED_USDC_STATUSES = [
  'CREATED',
  'SIGNED',
  'QUEUED',
  'BROADCASTING',
  'CONFIRMED',
  'EXPIRED',
  'REJECTED',
  'FAILED',
] as const;

const SPONSORED_USDC_ERROR_CODES = [
  'SPONSORSHIP_DISABLED',
  'RELAYER_UNAVAILABLE',
  'INVALID_RECIPIENT',
  'INVALID_TRANSFER_ID',
  'INVALID_AMOUNT',
  'INSUFFICIENT_USDC',
  'INVALID_SIGNATURE',
  'AUTHORIZATION_EXPIRED',
  'AUTHORIZATION_ALREADY_USED',
  'SPONSOR_LIMIT_EXCEEDED',
  'SPONSOR_BALANCE_LOW',
  'GAS_COST_LIMIT_EXCEEDED',
  'RPC_TEMPORARY_FAILURE',
  'CONTRACT_REVERTED',
  'TRANSFER_CONFIGURATION_MISMATCH',
  'PERSISTED_TRANSACTION_CORRUPTED',
] as const;

export type SponsoredUsdcTransferStatus =
  (typeof SPONSORED_USDC_STATUSES)[number];

export type SponsoredUsdcErrorCode =
  (typeof SPONSORED_USDC_ERROR_CODES)[number];

export interface TokenBalance {
  value: bigint;
  formatted: string;
  decimals: typeof USDC_DECIMALS;
  symbol: 'USDC';
}

export interface SponsoredUsdcTypedData {
  domain: {
    name: 'USDC';
    version: '2';
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>;
  primaryType: 'TransferWithAuthorization';
  message: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  };
}

export interface SponsoredUsdcPrepareResponse {
  transferId: string;
  typedData: SponsoredUsdcTypedData;
  expiresAt: string;
  networkFee: '0';
  networkFeeSymbol: 'INJ';
  sponsored: true;
}

export interface SponsoredUsdcTransfer {
  id: string;
  status: SponsoredUsdcTransferStatus;
  fromAddress: Address;
  toAddress: Address;
  amount: string;
  expiresAt: string;
  txHash: Hex | null;
  explorerUrl: string | null;
  failureCode: SponsoredUsdcErrorCode | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface SponsoredUsdcPollOptions {
  fetchStatus?: (id: string) => Promise<SponsoredUsdcTransfer>;
  delay?: (milliseconds: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

const ERROR_MESSAGES: Record<SponsoredUsdcErrorCode, string> = {
  SPONSORSHIP_DISABLED: 'Sponsored USDC transfers are unavailable.',
  RELAYER_UNAVAILABLE: 'Sponsored USDC transfers are temporarily unavailable.',
  INVALID_RECIPIENT: 'Enter a valid recipient address.',
  INVALID_TRANSFER_ID: 'The transfer request is invalid.',
  INVALID_AMOUNT: 'Enter a valid USDC amount.',
  INSUFFICIENT_USDC: 'The wallet does not have enough USDC.',
  INVALID_SIGNATURE: 'The transfer authorization could not be verified.',
  AUTHORIZATION_EXPIRED: 'This transfer authorization has expired.',
  AUTHORIZATION_ALREADY_USED: 'This transfer authorization has already been used.',
  SPONSOR_LIMIT_EXCEEDED: 'The sponsorship limit has been reached. Try again later.',
  SPONSOR_BALANCE_LOW: 'Sponsored USDC transfers are temporarily unavailable.',
  GAS_COST_LIMIT_EXCEEDED: 'The sponsored transfer exceeds the network cost limit.',
  RPC_TEMPORARY_FAILURE: 'The network is temporarily unavailable. Try again shortly.',
  CONTRACT_REVERTED: 'The sponsored USDC transfer reverted.',
  TRANSFER_CONFIGURATION_MISMATCH: 'The sponsored transfer configuration is invalid.',
  PERSISTED_TRANSACTION_CORRUPTED: 'The sponsored transfer could not be completed.',
};

export class SponsoredUsdcApiError extends Error {
  constructor(
    public readonly code: SponsoredUsdcErrorCode,
    message = sponsoredUsdcErrorMessage(code),
  ) {
    super(message);
    this.name = 'SponsoredUsdcApiError';
  }
}

function createUsdcPublicClient() {
  const chain = ACTIVE_NETWORK.chainId === NETWORK_CONFIG.mainnet.chainId
    ? INJECTIVE_MAINNET_CHAIN
    : INJECTIVE_TESTNET_CHAIN;
  return createPublicClient({
    chain,
    transport: http(),
  });
}

function sponsoredHeaders(): HeadersInit {
  const token = getAuthToken();
  if (!token) {
    throw new SponsoredUsdcApiError(
      'RELAYER_UNAVAILABLE',
      'Sign in to use sponsored USDC transfers.',
    );
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSponsoredUsdcErrorCode(value: unknown): value is SponsoredUsdcErrorCode {
  return typeof value === 'string'
    && SPONSORED_USDC_ERROR_CODES.includes(value as SponsoredUsdcErrorCode);
}

async function readSponsoredUsdcResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;

  const payload = await response.json().catch(() => null) as {
    code?: unknown;
    message?: unknown;
  } | null;
  const code = isSponsoredUsdcErrorCode(payload?.code)
    ? payload.code
    : 'RELAYER_UNAVAILABLE';
  const message = isSponsoredUsdcErrorCode(payload?.code)
    && typeof payload?.message === 'string'
    ? payload.message
    : sponsoredUsdcErrorMessage(code);

  throw new SponsoredUsdcApiError(code, message);
}

export function formatUsdcUnits(value: bigint): string {
  return formatUnits(value, USDC_DECIMALS);
}

export function parseUsdcUnits(amount: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount)) {
    throw new Error('USDC amount must use at most six decimal places.');
  }
  const value = parseUnits(amount, USDC_DECIMALS);
  if (value <= 0n) {
    throw new Error('USDC amount must be greater than zero.');
  }
  return value;
}

export async function getUsdcBalance(address: Address): Promise<TokenBalance> {
  const client = createUsdcPublicClient();
  const usdcAddress = TOKENS.USDC.address as Address;
  const [value, decimals] = await Promise.all([
    client.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>,
    client.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'decimals',
    }) as Promise<number>,
  ]);

  if (decimals !== USDC_DECIMALS) {
    throw new Error(`Circle USDC decimals must equal ${USDC_DECIMALS}.`);
  }

  return {
    value,
    formatted: formatUsdcUnits(value),
    decimals: USDC_DECIMALS,
    symbol: 'USDC',
  };
}

export async function prepareSponsoredUsdcTransfer(
  recipient: Address,
  amount: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SponsoredUsdcPrepareResponse> {
  parseUsdcUnits(amount);
  const response = await fetchImpl(`${API_BASE_URL}/sponsored-usdc-transfers/prepare`, {
    method: 'POST',
    headers: sponsoredHeaders(),
    body: JSON.stringify({ recipient, amount }),
  });
  return readSponsoredUsdcResponse<SponsoredUsdcPrepareResponse>(response);
}

export async function submitSponsoredUsdcTransfer(
  id: string,
  signature: Hex,
  fetchImpl: FetchImpl = fetch,
): Promise<SponsoredUsdcTransfer> {
  const response = await fetchImpl(`${API_BASE_URL}/sponsored-usdc-transfers/${id}/submit`, {
    method: 'POST',
    headers: sponsoredHeaders(),
    body: JSON.stringify({ signature }),
  });
  return readSponsoredUsdcResponse<SponsoredUsdcTransfer>(response);
}

export async function getSponsoredUsdcTransfer(
  id: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SponsoredUsdcTransfer> {
  const response = await fetchImpl(`${API_BASE_URL}/sponsored-usdc-transfers/${id}`, {
    method: 'GET',
    headers: sponsoredHeaders(),
  });
  return readSponsoredUsdcResponse<SponsoredUsdcTransfer>(response);
}

export function sponsoredUsdcErrorMessage(code: SponsoredUsdcErrorCode): string {
  return ERROR_MESSAGES[code];
}

export function isSponsoredUsdcTerminal(
  status: SponsoredUsdcTransferStatus,
): boolean {
  return status === 'CONFIRMED'
    || status === 'EXPIRED'
    || status === 'REJECTED'
    || status === 'FAILED';
}

export function isSponsoredUsdcPending(
  status: SponsoredUsdcTransferStatus,
): boolean {
  return SPONSORED_USDC_STATUSES.includes(status)
    && !isSponsoredUsdcTerminal(status);
}

export async function pollSponsoredUsdcTransfer(
  id: string,
  options: SponsoredUsdcPollOptions = {},
): Promise<SponsoredUsdcTransfer> {
  const fetchStatus = options.fetchStatus ?? getSponsoredUsdcTransfer;
  const delay = options.delay ?? wait;
  const intervalMs = Math.max(0, options.intervalMs ?? POLL_INTERVAL_MS);
  const timeoutMs = Math.max(0, options.timeoutMs ?? POLL_TIMEOUT_MS);
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let latest: SponsoredUsdcTransfer;

  do {
    latest = await fetchStatus(id);
    if (isSponsoredUsdcTerminal(latest.status) || now() >= deadline) {
      return latest;
    }
    await delay(intervalMs);
  } while (now() < deadline);

  return latest;
}
