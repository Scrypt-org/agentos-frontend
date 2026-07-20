import { getAuthToken } from './passkey';
import { API_BASE_URL } from './api-base';

export interface PointsTransaction {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SyncResponse {
  success: boolean;
  balance?: number;
  transactionId?: number;
  chanceRemaining?: number;
  chanceCooldownEndsAt?: number;
  error?: string;
}

export interface ConsumeChanceResponse {
  success: boolean;
  chanceRemaining?: number;
  chanceCooldownEndsAt?: number;
  error?: string;
}

export interface NinjaStatusResponse {
  balance: number;
  ordinaryBalance?: number;
  rewardBalance?: number;
  rewardExpiresAt?: string | null;
  spendableBalance?: number;
  chanceRemaining: number;
  chanceCooldownEndsAt: number;
}

export interface BalanceResponse {
  balance: number;
}

export interface AdjustNinjaResponse {
  success: boolean;
  balance?: number;
  delta?: number;
  transactionId?: number;
  error?: string;
}

export interface DailyCheckInResponse {
  success: boolean;
  claimed?: boolean;
  reward?: number;
  balance?: number;
  nextAvailableAt?: number;
  transactionId?: number;
  error?: string;
}

export interface NinjaMinerState {
  ninjaBalance: number;
  tapCooldownEndsAt: number;
  chanceCooldownEndsAt: number;
  chanceRemaining: number;
  sessionStartedAt: number;
  sessionEndsAt: number;
  sessionEarned: number;
  sessionUsesChance?: boolean;
  cooldownEndsAt?: number;
}

export interface TransactionsResponse {
  transactions: PointsTransaction[];
  total: number;
  page: number;
  limit: number;
}

interface NinjaMinerStateResponse {
  state: NinjaMinerState | null;
}

/**
 * Get auth header with Bearer token
 */
function getAuthHeader(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export async function claimDailyCheckIn(): Promise<DailyCheckInResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/points/daily-check-in`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    const payload = await response.json().catch(() => ({})) as DailyCheckInResponse;
    if (!response.ok || !payload.success) {
      return { success: false, error: payload.error || 'Daily check-in failed' };
    }
    return payload;
  } catch (error) {
    console.error('[Points] Daily check-in failed:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Sync NINJA from tap game to backend
 */
export async function syncPoints(
  earnedNinja: number,
  options?: {
    consumeChance?: boolean;
    chanceCooldownSeconds?: number;
    walletAddress?: string;
  },
): Promise<SyncResponse> {
  const safeEarnedNinja = Number(earnedNinja);
  if (!Number.isFinite(safeEarnedNinja) || safeEarnedNinja <= 0) {
    return { success: false, error: 'Invalid earnedNinja' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/points/sync`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        earnedNinja: safeEarnedNinja,
        consumeChance: Boolean(options?.consumeChance),
        chanceCooldownSeconds: options?.chanceCooldownSeconds,
        walletAddress: options?.walletAddress,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Sync failed' }));
      return { success: false, error: error.message || 'Sync failed' };
    }

    return response.json();
  } catch (error) {
    console.error('[Points] Sync failed:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get NINJA balance from backend
 */
export async function getBalance(): Promise<number> {
  try {
    const response = await fetch(`${API_BASE_URL}/points/balance`, {
      method: 'GET',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      return 0;
    }

    const data: BalanceResponse = await response.json();
    const safeBalance = Number((data as { balance?: unknown })?.balance);
    return Number.isFinite(safeBalance) ? safeBalance : 0;
  } catch (error) {
    console.error('[Points] Get balance failed:', error);
    return 0;
  }
}

export async function getNinjaStatus(): Promise<NinjaStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/points/status`, {
      method: 'GET',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      return {
        balance: 0,
        chanceRemaining: 0,
        chanceCooldownEndsAt: 0,
      };
    }

    const data = await response.json() as Partial<NinjaStatusResponse>;
    return {
      balance: Number.isFinite(Number(data.balance)) ? Number(data.balance) : 0,
      ordinaryBalance: Number.isFinite(Number(data.ordinaryBalance))
        ? Number(data.ordinaryBalance)
        : Number(data.balance) || 0,
      rewardBalance: Number.isFinite(Number(data.rewardBalance))
        ? Number(data.rewardBalance)
        : 0,
      rewardExpiresAt: data.rewardExpiresAt ?? null,
      spendableBalance: Number.isFinite(Number(data.spendableBalance))
        ? Number(data.spendableBalance)
        : Number(data.balance) || 0,
      chanceRemaining: Number.isFinite(Number(data.chanceRemaining))
        ? Math.max(0, Math.floor(Number(data.chanceRemaining)))
        : 0,
      chanceCooldownEndsAt: Number.isFinite(Number(data.chanceCooldownEndsAt))
        ? Math.max(0, Math.floor(Number(data.chanceCooldownEndsAt)))
        : 0,
    };
  } catch (error) {
    console.error('[Points] Get ninja status failed:', error);
    return {
      balance: 0,
      chanceRemaining: 0,
      chanceCooldownEndsAt: 0,
    };
  }
}

async function adjustNinja(
  operation: 'credit' | 'debit',
  amount: number,
  options?: { reason?: string; source?: string },
): Promise<AdjustNinjaResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/points/${operation}`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        amount,
        reason: options?.reason,
        source: options?.source,
      }),
    });

    const payload = await response.json().catch(() => ({ success: false, error: `${operation} failed` }));
    if (!response.ok) {
      return {
        success: false,
        error: payload?.error || `${operation} failed`,
      };
    }

    return payload as AdjustNinjaResponse;
  } catch (error) {
    console.error(`[Points] ${operation} ninja failed:`, error);
    return {
      success: false,
      error: 'Network error',
    };
  }
}

export async function creditNinja(
  amount: number,
  options?: { reason?: string; source?: string },
): Promise<AdjustNinjaResponse> {
  return adjustNinja('credit', amount, options);
}

export async function debitNinja(
  amount: number,
  options?: { reason?: string; source?: string },
): Promise<AdjustNinjaResponse> {
  return adjustNinja('debit', amount, options);
}

/**
 * Get transaction history from backend
 */
export async function getTransactions(
  page: number = 1,
  limit: number = 20
): Promise<TransactionsResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/points/transactions?page=${page}&limit=${limit}`,
      {
        method: 'GET',
        headers: getAuthHeader(),
      }
    );

    if (!response.ok) {
      return { transactions: [], total: 0, page: 1, limit };
    }

    return response.json();
  } catch (error) {
    console.error('[Points] Get transactions failed:', error);
    return { transactions: [], total: 0, page: 1, limit };
  }
}

/**
 * Read Ninja Miner state from backend Redis storage
 */
export async function getNinjaMinerState(walletAddress?: string): Promise<NinjaMinerState | null> {
  try {
    const query = walletAddress
      ? `?walletAddress=${encodeURIComponent(walletAddress)}`
      : '';

    const response = await fetch(`${API_BASE_URL}/points/ninja-miner-state${query}`, {
      method: 'GET',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as NinjaMinerStateResponse;
    const state = data?.state;

    if (!state) {
      return null;
    }

    return {
      ninjaBalance: Number.isFinite(Number(state.ninjaBalance)) ? Number(state.ninjaBalance) : 0,
      tapCooldownEndsAt: Number.isFinite(Number(state.tapCooldownEndsAt))
        ? Number(state.tapCooldownEndsAt)
        : (Number.isFinite(Number(state.cooldownEndsAt)) ? Number(state.cooldownEndsAt) : 0),
      chanceCooldownEndsAt: Number.isFinite(Number(state.chanceCooldownEndsAt)) ? Number(state.chanceCooldownEndsAt) : 0,
      chanceRemaining: Number.isFinite(Number((state as { chanceRemaining?: unknown }).chanceRemaining))
        ? Number((state as { chanceRemaining?: unknown }).chanceRemaining)
        : 0,
      sessionStartedAt: Number.isFinite(Number(state.sessionStartedAt)) ? Number(state.sessionStartedAt) : 0,
      sessionEndsAt: Number.isFinite(Number(state.sessionEndsAt)) ? Number(state.sessionEndsAt) : 0,
      sessionEarned: Number.isFinite(Number(state.sessionEarned)) ? Number(state.sessionEarned) : 0,
      sessionUsesChance: typeof (state as { sessionUsesChance?: unknown }).sessionUsesChance === 'boolean'
        ? Boolean((state as { sessionUsesChance?: unknown }).sessionUsesChance)
        : false,
    };
  } catch (error) {
    console.error('[Points] Get Ninja Miner state failed:', error);
    return null;
  }
}

/**
 * Persist Ninja Miner state to backend Redis storage
 */
export async function saveNinjaMinerState(
  walletAddress: string,
  state: NinjaMinerState,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/points/ninja-miner-state`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ walletAddress, state }),
    });

    return response.ok;
  } catch (error) {
    console.error('[Points] Save Ninja Miner state failed:', error);
    return false;
  }
}

/**
 * Consume one chance on backend.
 */
export async function consumeChance(cooldownSeconds = 20): Promise<ConsumeChanceResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/points/chance/consume`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ cooldownSeconds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Consume chance failed' }));
      return { success: false, error: error.message || 'Consume chance failed' };
    }

    return response.json();
  } catch (error) {
    console.error('[Points] Consume chance failed:', error);
    return { success: false, error: 'Network error' };
  }
}
