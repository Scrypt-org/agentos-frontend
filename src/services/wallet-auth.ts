import { privateKeyToAccount } from 'viem/accounts';
import { toHex } from 'viem';
import { API_BASE_URL } from './api-base';
import { setAuthToken } from './passkey';

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(' ');
  return payload?.message || fallback;
}

export async function authenticateWalletSession(params: {
  privateKey: Uint8Array;
  walletAddress: string;
  walletName?: string;
  inviteCode?: string;
}): Promise<string> {
  const challengeResponse = await fetch(`${API_BASE_URL}/wallet-auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: params.walletAddress }),
  });
  if (!challengeResponse.ok) {
    throw new Error(await readError(challengeResponse, 'Unable to start wallet login.'));
  }
  const challenge = await challengeResponse.json() as { nonce: string; message: string };
  const account = privateKeyToAccount(toHex(params.privateKey));
  const signature = await account.signMessage({ message: challenge.message });

  const verifyResponse = await fetch(`${API_BASE_URL}/wallet-auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: params.walletAddress,
      walletName: params.walletName,
      inviteCode: params.inviteCode,
      nonce: challenge.nonce,
      signature,
    }),
  });
  if (!verifyResponse.ok) {
    throw new Error(await readError(verifyResponse, 'Wallet login failed.'));
  }
  const result = await verifyResponse.json() as { token?: string };
  if (!result.token) throw new Error('Wallet login did not return a session token.');
  setAuthToken(result.token);
  return result.token;
}
