import { API_BASE_URL } from './api-base';
import { getAuthToken, refreshToken } from './passkey';

export interface AgentSkillDto {
  id: string;
  name: string;
  body: string;
  prompt: string;
  app: string;
  popularity: number;
  official?: boolean;
  custom?: boolean;
}

async function fetchWithSkillAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const makeRequest = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  const token = getAuthToken();
  const firstResponse = await makeRequest(token);
  if (firstResponse.status !== 401 || !token) return firstResponse;
  const nextToken = await refreshToken(token);
  return nextToken ? makeRequest(nextToken) : firstResponse;
}

export async function getPublicSkills(): Promise<AgentSkillDto[]> {
  const response = await fetch(`${API_BASE_URL}/skills`);
  if (!response.ok) return [];
  return response.json();
}

export async function getMySkills(): Promise<AgentSkillDto[]> {
  if (!getAuthToken()) return [];
  const response = await fetchWithSkillAuth(`${API_BASE_URL}/skills/mine`);
  if (!response.ok) return [];
  return response.json();
}

export async function createMySkill(input: {
  name: string;
  app: string;
  body: string;
  prompt: string;
}): Promise<AgentSkillDto> {
  const response = await fetchWithSkillAuth(`${API_BASE_URL}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as AgentSkillDto & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'Unable to save this skill.');
  return payload;
}
