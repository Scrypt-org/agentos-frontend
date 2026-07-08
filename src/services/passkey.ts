import { API_BASE_URL } from './api-base';

/**
 * fetch with a hard timeout. On flaky networks or when the backend is
 * unreachable, a plain fetch can hang indefinitely — and because these calls run
 * inside the auth popup during connect/sign, a hang leaves the dApp spinning
 * forever with no feedback. A manual AbortController is used (not
 * AbortSignal.timeout) for compatibility with older browsers that lack it.
 */
async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Could not reach the INJ Pass server (request timed out). Please check your network and try again.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface PasskeyChallenge {
  challenge: string;
  expiresAt: number;
  rpId: string;
  rpName: string;
}

export interface PasskeyVerifyResponse {
  success: boolean;
  credentialId?: string;
  publicKey?: string;
  verified?: boolean;
  token?: string;
  walletAddress?: string;
  walletName?: string;
}

export interface TokenVerifyResponse {
  valid: boolean;
  credentialId?: string;
  userId?: string;
  expiresAt?: number;
}

export interface TokenRefreshResponse {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Request a Passkey challenge from backend
 */
export async function requestChallenge(
  action: 'register' | 'authenticate',
  userId?: string
): Promise<PasskeyChallenge> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/passkey/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, userId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || 'Failed to request challenge');
  }

  return response.json();
}

/**
 * Verify Passkey attestation/assertion with backend
 * CRITICAL: Only send walletAddress and walletName during registration, never during authentication
 */
export async function verifyPasskey(
  challenge: string,
  credential: any,
  walletAddress?: string,
  walletName?: string,
  inviteCode?: string
): Promise<PasskeyVerifyResponse> {
  // Build request body - only include walletAddress and walletName if they have values
  // This ensures we never accidentally send undefined/null during authentication
  const requestBody: any = {
    challenge,
    attestation: credential,
  };

  // Only include wallet fields if they are explicitly provided (registration only)
  if (walletAddress) {
    requestBody.walletAddress = walletAddress;
  }
  if (walletName) {
    requestBody.walletName = walletName;
  }
  // Include invite code during registration for referral rewards
  if (inviteCode) {
    requestBody.inviteCode = inviteCode;
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}/passkey/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || 'Verification failed');
  }

  return response.json();
}

// Utility functions for ArrayBuffer <-> Base64 conversion
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Handle URL-safe base64
  let b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Token management functions
const AUTH_TOKEN_KEY = 'auth_token';

/**
 * Get stored auth token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Store auth token
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * Remove auth token
 */
export function removeAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Decode a JWT payload locally (base64url) WITHOUT verifying the signature.
 * Used only for cheap, offline expiry checks to avoid blocking routing on a
 * network round-trip. The authoritative check is still the backend verify-token.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * Cheap, offline check: do we have a token whose `exp` is still in the future?
 * Returns false when there is no token or it cannot be decoded. Does NOT hit the
 * network — pair it with a background verifyToken() for the authoritative check.
 */
export function isTokenLocallyValid(token?: string): boolean {
  const authToken = token || getAuthToken();
  if (!authToken) return false;
  const payload = decodeJwtPayload(authToken);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}

/**
 * Verify token with backend
 */
export async function verifyToken(token?: string): Promise<TokenVerifyResponse> {
  const authToken = token || getAuthToken();
  console.log('[verifyToken] Token to verify:', authToken ? 'Present' : 'Missing');
  if (!authToken) {
    console.log('[verifyToken] No auth token available');
    return { valid: false };
  }

  try {
    console.log('[verifyToken] Calling API:', `${API_BASE_URL}/passkey/verify-token`);
    const response = await fetchWithTimeout(`${API_BASE_URL}/passkey/verify-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[verifyToken] Response status:', response.status);
    if (!response.ok) {
      console.log('[verifyToken] Response not OK');
      return { valid: false };
    }

    const result = await response.json();
    console.log('[verifyToken] API response:', result);
    return result;
  } catch (error) {
    console.error('[verifyToken] Token verification failed:', error);
    return { valid: false };
  }
}

/**
 * Refresh token with backend
 */
export async function refreshToken(token?: string): Promise<string | null> {
  const authToken = token || getAuthToken();
  if (!authToken) {
    return null;
  }

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/passkey/refresh-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const result: TokenRefreshResponse = await response.json();
    if (result.success && result.token) {
      setAuthToken(result.token);
      return result.token;
    }

    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

/**
 * Logout and revoke token
 */
export async function logout(): Promise<boolean> {
  const authToken = getAuthToken();
  if (!authToken) {
    return true;
  }

  try {
    await fetch(`${API_BASE_URL}/passkey/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Logout failed:', error);
  } finally {
    removeAuthToken();
  }

  return true;
}

/**
 * Check if user has a valid session
 */
export async function hasValidSession(): Promise<boolean> {
  const token = getAuthToken();
  console.log('[hasValidSession] Auth token:', token ? 'Found' : 'Not found');
  if (!token) {
    console.log('[hasValidSession] No token in localStorage');
    return false;
  }

  const result = await verifyToken(token);
  console.log('[hasValidSession] Verify result:', result);
  return result.valid;
}

/**
 * Auto-refresh token if it's close to expiring (within 5 minutes)
 */
export async function autoRefreshToken(): Promise<void> {
  const token = getAuthToken();
  if (!token) {
    return;
  }

  const result = await verifyToken(token);
  if (!result.valid || !result.expiresAt) {
    return;
  }

  const now = Date.now();
  const timeLeft = result.expiresAt - now;
  const fiveMinutes = 5 * 60 * 1000;

  if (timeLeft < fiveMinutes && timeLeft > 0) {
    await refreshToken(token);
  }
}

/**
 * Authoritative session check + opportunistic refresh in a SINGLE verify-token
 * round-trip (replaces the old hasValidSession()+autoRefreshToken() pair, which
 * verified twice). Returns whether the backend considers the token valid, so the
 * caller can lock / redirect on `false`. Intended to run in the background after
 * an optimistic local routing decision (see isTokenLocallyValid).
 */
export async function validateAndRefreshSession(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  const result = await verifyToken(token);
  if (!result.valid) return false;

  if (result.expiresAt) {
    const timeLeft = result.expiresAt - Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (timeLeft > 0 && timeLeft < fiveMinutes) {
      await refreshToken(token);
    }
  }
  return true;
}
