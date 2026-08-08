import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type {
  SponsoredUsdcTransfer,
  SponsoredUsdcTransferStatus,
} from './sponsored-usdc';

vi.mock('./api-base', () => ({ API_BASE_URL: 'https://api.example.test' }));

import {
  cancelSponsoredUsdcIntent,
  createOperationGuard,
  createClearedSendIntent,
  getSponsoredUsdcPrimaryAction,
  getSponsoredUsdcStatusPresentation,
  getUsdcAmountValidation,
  isCurrentSponsoredUsdcIntent,
} from './send-page-sponsored-usdc';

const transfer: SponsoredUsdcTransfer = {
  id: 'e55ed81d-5e29-4c36-bc9c-43910dc69f5a',
  status: 'QUEUED',
  fromAddress: '0x0000000000000000000000000000000000000001',
  toAddress: '0x0000000000000000000000000000000000000002',
  amount: '10',
  expiresAt: '2026-08-01T00:00:00.000Z',
  txHash: null,
  explorerUrl: null,
  failureCode: null,
  createdAt: '2026-07-25T00:00:00.000Z',
  confirmedAt: null,
};

describe('Send page sponsored USDC behavior', () => {
  it('compares canonical USDC amounts to the balance with bigint units', async () => {
    expect(getUsdcAmountValidation('9007199254.740991', 9_007_199_254_740_991n))
      .toEqual({ valid: true, insufficient: false });
    expect(getUsdcAmountValidation('9007199254.740992', 9_007_199_254_740_991n))
      .toEqual({ valid: true, insufficient: true });
    expect(getUsdcAmountValidation('1.0000001', 10_000_000n))
      .toEqual({ valid: false, insufficient: false });
  });

  it.each([
    ['CREATED', true, true],
    ['SIGNED', true, true],
    ['QUEUED', true, true],
    ['BROADCASTING', true, true],
    ['CONFIRMED', false, false],
    ['EXPIRED', false, false],
    ['REJECTED', false, false],
    ['FAILED', false, false],
  ] as const)(
    'presents %s with pending=%s and refresh=%s',
    async (status, pending, canRefresh) => {
      const presentation = getSponsoredUsdcStatusPresentation({
        ...transfer,
        status: status as SponsoredUsdcTransferStatus,
      });

      expect(presentation.pending).toBe(pending);
      expect(presentation.canRefresh).toBe(canRefresh);
      expect(presentation.label).toBeTruthy();
      expect(presentation.message).toBeTruthy();
    },
  );

  it('uses stable local failure-code text for rejected and failed transfers', async () => {
    expect(getSponsoredUsdcStatusPresentation({
      ...transfer,
      status: 'REJECTED',
      failureCode: 'SPONSOR_LIMIT_EXCEEDED',
    }).message).toBe('The sponsorship limit has been reached. Try again later.');
    expect(getSponsoredUsdcStatusPresentation({
      ...transfer,
      status: 'FAILED',
      failureCode: 'CONTRACT_REVERTED',
    }).message).toBe('The sponsored USDC transfer reverted.');
  });

  it('creates a fully cleared intent when the selected asset changes', async () => {
    expect(createClearedSendIntent()).toEqual({
      amount: '',
      gasEstimate: null,
      preparedUsdc: null,
      sponsoredTransfer: null,
      txHash: '',
      error: '',
    });
  });

  it.each(['CREATED', 'SIGNED', 'QUEUED', 'BROADCASTING'] as const)(
    'disables the primary action while %s is pending',
    (status) => {
      const prepare = vi.fn();
      const action = getSponsoredUsdcPrimaryAction({
        ...transfer,
        status,
      });

      if (!action.disabled) prepare();

      expect(action).toMatchObject({
        disabled: true,
        isError: false,
        canRetry: false,
      });
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it.each(['EXPIRED', 'REJECTED', 'FAILED'] as const)(
    'requires an explicit retry reset after %s',
    (status) => {
      expect(getSponsoredUsdcPrimaryAction({
        ...transfer,
        status,
      })).toMatchObject({
        disabled: true,
        isError: true,
        canRetry: true,
      });
    },
  );

  it('rejects a duplicate operation while the first is active', () => {
    const guard = createOperationGuard();
    const first = guard.tryBegin();

    expect(first).not.toBeNull();
    expect(guard.tryBegin()).toBeNull();

    guard.finish(first!);

    expect(guard.isCurrent(first!)).toBe(true);
    expect(guard.tryBegin()).not.toBeNull();
  });

  it('invalidates a cancelled intent before a late auth callback can submit', () => {
    const guard = createOperationGuard();
    const token = guard.tryBegin();
    const clearPrepared = vi.fn();
    const submit = vi.fn();
    const intent = {
      token: token!,
      transferId: transfer.id,
    };

    expect(isCurrentSponsoredUsdcIntent(
      guard,
      intent,
      'USDC',
      transfer.id,
    )).toBe(true);

    cancelSponsoredUsdcIntent(guard, clearPrepared);

    if (isCurrentSponsoredUsdcIntent(
      guard,
      intent,
      'USDC',
      transfer.id,
    )) {
      submit();
    }

    expect(clearPrepared).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale INJ estimate that %ss after switching to USDC',
    async (outcome) => {
      const guard = createOperationGuard();
      const token = guard.begin();
      let selectedAsset: 'INJ' | 'USDC' = 'INJ';
      const state = {
        gasEstimate: 'old estimate',
        error: 'old error',
        estimating: true,
        costFlashing: true,
      };
      let settleEstimate!: (value: string) => void;
      const estimate = new Promise<string>((resolve, reject) => {
        settleEstimate = outcome === 'resolve'
          ? resolve
          : (reason) => reject(reason);
      });
      const isCurrentEstimate = () => (
        selectedAsset === 'INJ' && guard.isCurrent(token)
      );

      const pendingEstimate = estimate
        .then((value) => {
          if (isCurrentEstimate()) state.gasEstimate = value;
        })
        .catch(() => {
          if (isCurrentEstimate()) state.error = 'estimate failed';
        })
        .finally(() => {
          if (isCurrentEstimate()) {
            state.estimating = false;
            state.costFlashing = false;
          }
        });

      selectedAsset = 'USDC';
      guard.invalidate();
      state.gasEstimate = 'USDC gas state';
      state.error = '';
      state.estimating = false;
      state.costFlashing = false;

      settleEstimate('late estimate');
      await pendingEstimate;

      expect(state).toEqual({
        gasEstimate: 'USDC gas state',
        error: '',
        estimating: false,
        costFlashing: false,
      });
    },
  );
});

describe('Send page sponsored USDC contract', () => {
  it('keeps INJ send and adds the backend-authorized USDC path', async () => {
    const source = await readFile(
      new URL('../../app/send/page.tsx', import.meta.url),
      'utf8',
    );

    // The asset list lives in send-assets.ts now; the page must derive how each
    // one is paid for from there rather than special-casing symbols inline.
    expect(source).toContain("from '@/services/send-assets'");
    expect(source).toContain('const transferMode = getSendTransferMode(asset)');
    expect(source).toContain('sendTransaction(');
    expect(source).toContain('prepareSponsoredUsdcTransfer(');
    expect(source).toContain('signTypedDataJson(authorizedKey');
    expect(source).toContain('submitSponsoredUsdcTransfer(');
    expect(source).toContain('pollSponsoredUsdcTransfer(');
    expect(source).toContain('getUsdcAmountValidation(amount, usdcBalance.value)');
    expect(source).toContain('setShowAuthModal(true)');
    expect(source).toContain('onClose={handleAuthModalClose}');
    expect(source).toContain('sponsoredTransfer?.explorerUrl');
    expect(source).toContain(
      "const transferControlsLocked = transferMode === 'sponsored' && sponsoredTransfer !== null",
    );
    expect(source).toContain('if (loading || preparedUsdc || sponsoredTransfer) return;');
    expect(source).toContain('disabled={transferControlsLocked}');
    expect(source).toContain('const gasEstimateGuardRef = useRef(createOperationGuard())');
    expect(source).toContain('gasEstimateGuardRef.current.invalidate()');
    expect(source).toContain('selectedAssetRef.current === estimateAsset');
    expect(source).toContain('Network fee');
    expect(source).toContain('0 INJ');
    expect(source).toContain('Sponsored by AgentOS');
    expect(source).toMatch(
      /prepareSponsoredUsdcTransfer\([\s\S]*setPreparedUsdc\(prepared\);[\s\S]*setShowAuthModal\(true\);/,
    );
    expect(source).toMatch(
      /signTypedDataJson\(authorizedKey, prepared\.typedData\)[\s\S]*submitSponsoredUsdcTransfer\([\s\S]*pollSponsoredUsdcTransfer\(/,
    );
    expect(source).toMatch(
      /const cleared = createClearedSendIntent\(\);[\s\S]*setAmount\(cleared\.amount\);[\s\S]*setGasEstimate\(cleared\.gasEstimate\);[\s\S]*setPreparedUsdc\(cleared\.preparedUsdc\);[\s\S]*setSponsoredTransfer\(cleared\.sponsoredTransfer\);[\s\S]*setTxHash\(cleared\.txHash\);[\s\S]*setError\(cleared\.error\);/,
    );
  });

  it('does not fall back to a browser-paid USDC transaction', async () => {
    const source = await readFile(
      new URL('../../app/send/page.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('sendUsdcTransaction(');
    expect(source).not.toContain('writeContract(');
    expect(source).not.toMatch(
      /onClose=\{\(\) => .*submitSponsoredUsdcTransfer/,
    );
  });
});
