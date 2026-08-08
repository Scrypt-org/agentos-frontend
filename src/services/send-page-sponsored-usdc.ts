import type { GasEstimate } from '@/types/chain';
import type { SendAsset } from './send-assets';
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

export interface SponsoredUsdcPrimaryAction {
  label: string;
  isError: boolean;
  disabled: true;
  canRetry: boolean;
}

export type OperationToken = number;

export interface OperationGuard {
  begin: () => OperationToken;
  tryBegin: () => OperationToken | null;
  finish: (token: OperationToken) => void;
  invalidate: () => void;
  isCurrent: (token: OperationToken) => boolean;
}

export interface SponsoredUsdcIntent {
  token: OperationToken;
  transferId: string;
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
        message: 'AgentOS is preparing the sponsored transaction.',
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

export function getSponsoredUsdcPrimaryAction(
  transfer: SponsoredUsdcTransfer,
): SponsoredUsdcPrimaryAction {
  const presentation = getSponsoredUsdcStatusPresentation(transfer);
  const canRetry = presentation.tone === 'error';

  return {
    label: presentation.label,
    isError: canRetry,
    disabled: true,
    canRetry,
  };
}

export function createOperationGuard(): OperationGuard {
  let generation = 0;
  let activeToken: OperationToken | null = null;

  const begin = (): OperationToken => {
    generation += 1;
    activeToken = generation;
    return activeToken;
  };

  return {
    begin,
    tryBegin: () => activeToken === null ? begin() : null,
    finish: (token) => {
      if (activeToken === token) activeToken = null;
    },
    invalidate: () => {
      generation += 1;
      activeToken = null;
    },
    isCurrent: (token) => token === generation,
  };
}

export function isCurrentSponsoredUsdcIntent(
  guard: OperationGuard,
  intent: SponsoredUsdcIntent,
  asset: SendAsset,
  preparedTransferId: string | null,
): boolean {
  return asset === 'USDC'
    && preparedTransferId === intent.transferId
    && guard.isCurrent(intent.token);
}

export function cancelSponsoredUsdcIntent(
  guard: OperationGuard,
  clearPrepared: () => void,
): void {
  guard.invalidate();
  clearPrepared();
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
