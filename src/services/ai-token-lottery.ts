import { API_BASE_URL } from './api-base';
import { getAuthToken } from './passkey';
export {
  lotteryStateCanDraw,
  normalizeLotteryLanguage,
} from './ai-token-lottery-helpers';
export type {
  LotteryLanguage,
  LotteryState,
} from './ai-token-lottery-helpers';
import type { LotteryState } from './ai-token-lottery-helpers';

export interface LotteryStatus {
  state: LotteryState;
  eligibleUntil: string | null;
  claimedAt: string | null;
  expiresAt: string | null;
  rewardLam: number;
  remainingLam: number;
  displayAiTokens: number;
  estimatedInteractions: { min: number; max: number };
  tier: string | null;
  newlyDrawn?: boolean;
}

async function requestLottery(path: 'status' | 'draw', method: 'GET' | 'POST') {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/ai-token-lottery/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as LotteryStatus | null;
  if (!response.ok || !payload?.state) {
    throw new Error(`Lottery request failed (${response.status})`);
  }
  return payload;
}

export const getLotteryStatus = () => requestLottery('status', 'GET');
export const drawLotteryReward = () => requestLottery('draw', 'POST');
