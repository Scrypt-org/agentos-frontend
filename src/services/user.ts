import { getAuthToken } from './passkey';
import { API_BASE_URL } from './api-base';

export interface UserProfileResponse {
  id: number;
  inviteCode: string;
  invitedBy: string | null;
  ninjaBalance: number;
  rewardBalance: number;
  rewardExpiresAt: string | null;
  spendableBalance: number;
  chanceRemaining: number;
  chanceCooldownEndsAt: number;
  createdAt: string;
}

function getAuthHeader(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export async function getUserProfile(): Promise<UserProfileResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/user/profile`, {
      method: 'GET',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data) {
      return null;
    }

    return {
      id: Number(data.id) || 0,
      inviteCode: data.inviteCode || '',
      invitedBy: data.invitedBy ?? null,
      ninjaBalance: Number(data.ninjaBalance) || 0,
      rewardBalance: Number(data.rewardBalance) || 0,
      rewardExpiresAt: data.rewardExpiresAt ?? null,
      spendableBalance:
        Number(data.spendableBalance) || Number(data.ninjaBalance) || 0,
      chanceRemaining: Number(data.chanceRemaining) || 0,
      chanceCooldownEndsAt: Number(data.chanceCooldownEndsAt) || 0,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[User] Get profile failed:', error);
    return null;
  }
}
