import type { GasEstimate } from '@/types/chain';
import {
  parseUsdcUnits,
  sponsoredUsdcErrorMessage,
  type SponsoredUsdcPrepareResponse,
  type SponsoredUsdcTransfer,
} from './sponsored-usdc';

export interface UsdcAmountValidation {
  valid: boolean;
  insufficient: boolean;
}

export interface SponsoredUsdcStatusPresentation {
  label: string;
  message: string;
  pending: boolean;
  canRefresh: boolean;
  tone: 'pending' | 'success' | 'error';
}

export interface ClearedSendIntent {
  amount: '';
  gasEstimate: GasEstimate | null;
  preparedUsdc: SponsoredUsdcPrepareResponse | null;
  sponsoredTransfer: SponsoredUsdcTransfer | null;
  txHash: '';
  error: '';
}

export function getUsdcAmountValidation(
  amount: string,
  balance: bigint,
): UsdcAmountValidation {
  try {
    const amountUnits = parseUsdcUnits(amount);
    return {
      valid: true,
      insufficient: amountUnits > balance,
    };
  } catch {
    return {
      valid: false,
      insufficient: false,
    };
  }
}

export function getSponsoredUsdcStatusPresentation(
  transfer: SponsoredUsdcTransfer,
): SponsoredUsdcStatusPresentation {
  const failureMessage = transfer.failureCode
    ? sponsoredUsdcErrorMessage(transfer.failureCode)
    : null;

  switch (transfer.status) {
    case 'CREATED':
      return {
        label: 'Authorization ready',
        message: 'Review and authorize this sponsored USDC transfer.',
        pending: true,
        canRefresh: true,
        tone: 'pending',
      };
    case 'SIGNED':
      return {
        label: 'Authorization signed',
        message: 'Your transfer authorization is being queued.',
        pending: true,
        canRefresh: true,
        tone: 'pending',
      };
    case 'QUEUED':
      return {
        label: 'Transfer queued',
        message: 'INJ Pass is preparing the sponsored transaction.',
        pending: true,
        canRefresh: true,
        tone: 'pending',
      };
    case 'BROADCASTING':
      return {
        label: 'Broadcasting',
        message: 'The sponsored transaction is awaiting confirmation.',
        pending: true,
        canRefresh: true,
        tone: 'pending',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        message: 'The sponsored USDC transfer is confirmed.',
        pending: false,
        canRefresh: false,
        tone: 'success',
      };
    case 'EXPIRED':
      return {
        label: 'Authorization expired',
        message: failureMessage ?? 'This transfer authorization has expired.',
        pending: false,
        canRefresh: false,
        tone: 'error',
      };
    case 'REJECTED':
      return {
        label: 'Transfer rejected',
        message: failureMessage ?? 'The sponsored USDC transfer was rejected.',
        pending: false,
        canRefresh: false,
        tone: 'error',
      };
    case 'FAILED':
      return {
        label: 'Transfer failed',
        message: failureMessage ?? 'The sponsored USDC transfer could not be completed.',
        pending: false,
        canRefresh: false,
        tone: 'error',
      };
  }
}

export function createClearedSendIntent(): ClearedSendIntent {
  return {
    amount: '',
    gasEstimate: null,
    preparedUsdc: null,
    sponsoredTransfer: null,
    txHash: '',
    error: '',
  };
}
