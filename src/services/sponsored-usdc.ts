import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  isHash,
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
  fetchStatus?: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<SponsoredUsdcTransfer>;
  delay?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
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
  constructor(public readonly code: SponsoredUsdcErrorCode) {
    super(sponsoredUsdcErrorMessage(code));
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
    throw new SponsoredUsdcApiError('RELAYER_UNAVAILABLE');
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

function isSponsoredUsdcTransferStatus(
  value: unknown,
): value is SponsoredUsdcTransferStatus {
  return typeof value === 'string'
    && SPONSORED_USDC_STATUSES.includes(value as SponsoredUsdcTransferStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isTransferId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUnsignedInteger(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isEvmAddress(value: unknown): value is Address {
  return isNonEmptyString(value) && isAddress(value);
}

function isHashValue(value: unknown): value is Hex {
  return isNonEmptyString(value) && isHash(value);
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isTypedDataField(value: unknown): value is { name: string; type: string } {
  return isRecord(value)
    && isNonEmptyString(value.name)
    && isNonEmptyString(value.type);
}

function isSponsoredUsdcTypedData(value: unknown): value is SponsoredUsdcTypedData {
  if (!isRecord(value)
    || !isRecord(value.domain)
    || !isRecord(value.types)
    || !isRecord(value.message)) {
    return false;
  }

  const authorizationType = value.types.TransferWithAuthorization;
  return value.domain.name === 'USDC'
    && value.domain.version === '2'
    && Number.isSafeInteger(value.domain.chainId)
    && (value.domain.chainId as number) > 0
    && isEvmAddress(value.domain.verifyingContract)
    && Array.isArray(authorizationType)
    && authorizationType.every(isTypedDataField)
    && value.primaryType === 'TransferWithAuthorization'
    && isEvmAddress(value.message.from)
    && isEvmAddress(value.message.to)
    && isUnsignedInteger(value.message.value)
    && isUnsignedInteger(value.message.validAfter)
    && isUnsignedInteger(value.message.validBefore)
    && isHashValue(value.message.nonce);
}

function isSponsoredUsdcPrepareResponse(
  value: unknown,
): value is SponsoredUsdcPrepareResponse {
  return isRecord(value)
    && isTransferId(value.transferId)
    && isSponsoredUsdcTypedData(value.typedData)
    && isTimestamp(value.expiresAt)
    && value.networkFee === '0'
    && value.networkFeeSymbol === 'INJ'
    && value.sponsored === true;
}

function isSponsoredUsdcTransfer(value: unknown): value is SponsoredUsdcTransfer {
  if (!isRecord(value)) return false;

  return isTransferId(value.id)
    && isSponsoredUsdcTransferStatus(value.status)
    && isEvmAddress(value.fromAddress)
    && isEvmAddress(value.toAddress)
    && isUnsignedInteger(value.amount)
    && isTimestamp(value.expiresAt)
    && (value.txHash === null || isHashValue(value.txHash))
    && (value.explorerUrl === null || isHttpUrl(value.explorerUrl))
    && (value.failureCode === null || isSponsoredUsdcErrorCode(value.failureCode))
    && isTimestamp(value.createdAt)
    && (value.confirmedAt === null || isTimestamp(value.confirmedAt));
}

function normalizedSponsoredUsdcError(cause: unknown): SponsoredUsdcApiError {
  if (cause instanceof SponsoredUsdcApiError) return cause;
  return new SponsoredUsdcApiError('RELAYER_UNAVAILABLE');
}

async function readSponsoredUsdcResponse<T>(
  response: Response,
  isValidResponse: (value: unknown) => value is T,
): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      code?: unknown;
    } | null;
    const code = isSponsoredUsdcErrorCode(payload?.code)
      ? payload.code
      : 'RELAYER_UNAVAILABLE';

    throw new SponsoredUsdcApiError(code);
  }

  const payload = await response.json().catch(() => null);
  if (!isValidResponse(payload)) {
    throw new SponsoredUsdcApiError('RELAYER_UNAVAILABLE');
  }

  return payload;
}

async function requestSponsoredUsdc<T>(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit,
  isValidResponse: (value: unknown) => value is T,
): Promise<T> {
  try {
    const response = await fetchImpl(url, init);
    return await readSponsoredUsdcResponse(response, isValidResponse);
  } catch (cause) {
    throw normalizedSponsoredUsdcError(cause);
  }
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
  return requestSponsoredUsdc(
    fetchImpl,
    `${API_BASE_URL}/sponsored-usdc-transfers/prepare`,
    {
    method: 'POST',
    headers: sponsoredHeaders(),
    body: JSON.stringify({ recipient, amount }),
    },
    isSponsoredUsdcPrepareResponse,
  );
}

export async function submitSponsoredUsdcTransfer(
  id: string,
  signature: Hex,
  fetchImpl: FetchImpl = fetch,
): Promise<SponsoredUsdcTransfer> {
  return requestSponsoredUsdc(
    fetchImpl,
    `${API_BASE_URL}/sponsored-usdc-transfers/${id}/submit`,
    {
    method: 'POST',
    headers: sponsoredHeaders(),
    body: JSON.stringify({ signature }),
    },
    isSponsoredUsdcTransfer,
  );
}

export async function getSponsoredUsdcTransfer(
  id: string,
  fetchImpl: FetchImpl = fetch,
  signal?: AbortSignal,
): Promise<SponsoredUsdcTransfer> {
  return requestSponsoredUsdc(
    fetchImpl,
    `${API_BASE_URL}/sponsored-usdc-transfers/${id}`,
    {
    method: 'GET',
    headers: sponsoredHeaders(),
    signal,
    },
    isSponsoredUsdcTransfer,
  );
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

type DeadlineResult<T> =
  | { timedOut: false; value: T }
  | { timedOut: true };

async function runWithinDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<DeadlineResult<T>> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DeadlineResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, Math.max(0, timeoutMs));
  });
  const completed = Promise.resolve()
    .then(() => work(controller.signal))
    .then<DeadlineResult<T>>((value) => ({ timedOut: false, value }));

  try {
    return await Promise.race([completed, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    controller.abort();
  }
}

export async function pollSponsoredUsdcTransfer(
  id: string,
  options: SponsoredUsdcPollOptions = {},
): Promise<SponsoredUsdcTransfer> {
  const fetchStatus = options.fetchStatus
    ?? ((transferId: string, signal?: AbortSignal) =>
      getSponsoredUsdcTransfer(transferId, fetch, signal));
  const delay = options.delay ?? wait;
  const intervalMs = Math.max(0, options.intervalMs ?? POLL_INTERVAL_MS);
  const timeoutMs = Math.max(0, options.timeoutMs ?? POLL_TIMEOUT_MS);
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let latest: SponsoredUsdcTransfer | undefined;

  while (true) {
    const remaining = deadline - now();
    if (remaining <= 0 && latest !== undefined) return latest;

    let statusResult: DeadlineResult<SponsoredUsdcTransfer>;
    try {
      statusResult = await runWithinDeadline(
        (signal) => fetchStatus(id, signal),
        Math.max(0, remaining),
      );
    } catch (cause) {
      throw normalizedSponsoredUsdcError(cause);
    }
    if (statusResult.timedOut) {
      if (latest !== undefined) return latest;
      throw new SponsoredUsdcApiError('RELAYER_UNAVAILABLE');
    }

    latest = statusResult.value;
    if (isSponsoredUsdcTerminal(latest.status) || now() >= deadline) {
      return latest;
    }

    const delayResult = await runWithinDeadline(
      (signal) => delay(Math.min(intervalMs, Math.max(0, deadline - now())), signal),
      Math.max(0, deadline - now()),
    );
    if (delayResult.timedOut) return latest;
  }
}
