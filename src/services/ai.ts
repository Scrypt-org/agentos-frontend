import { getAuthToken, refreshToken } from './passkey';
import { API_BASE_URL } from './api-base';

export interface AgentUiMessage {
  role: 'assistant' | 'tool';
  content: string;
  isError?: boolean;
}

export interface AgentPendingConfirmation {
  toolUseId?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  executionMode?: 'backend_sandbox' | 'client_wallet';
}

export interface StoredConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredConversationSearchResult extends StoredConversationSummary {
  snippets: Array<{ role: string; content: string }>;
}

export interface StoredConversationMessage {
  id: number;
  conversationId: string;
  role: string;
  content: string;
  toolUse?: unknown;
  toolResult?: unknown;
  createdAt: string;
}

export interface StoredConversationDetail {
  conversation: StoredConversationSummary;
  messages: StoredConversationMessage[];
}

export interface AgentChatResponse {
  ok: boolean;
  conversationId?: string;
  sandboxAddress?: string | null;
  messages?: AgentUiMessage[];
  pendingConfirmation?: AgentPendingConfirmation | null;
  error?: string;
}

export interface AgentSweepResponse {
  ok: boolean;
  conversationId?: string;
  sandboxAddress?: string | null;
  result?: {
    sandboxAddress: string;
    recipientAddress: string;
    transfers: Array<{
      symbol: 'INJ' | 'USDT' | 'USDC';
      amount: string;
      txHash: string;
      explorerUrl: string;
    }>;
    empty: boolean;
    balancesBefore: {
      INJ: string;
      USDT: string;
      USDC: string;
    };
  };
  error?: string;
}

export interface AgentSandboxDetailsResponse {
  ok: boolean;
  conversationId?: string;
  sandboxAddress?: string;
  privateKey?: string;
  error?: string;
}

export interface CreativePlanNode {
  title: string;
  body: string;
}

export interface CreativePlan {
  summary: string;
  nodes: CreativePlanNode[];
  edges: Array<[number, number]>;
}

export interface CreativePlanResponse {
  ok: boolean;
  plan?: CreativePlan;
  error?: string;
}

export interface CreativeBuildFile {
  path: string;
  language: string;
  content: string;
}

export interface CreativeBuild {
  summary: string;
  files: CreativeBuildFile[];
}

export interface CreativeBuildResponse {
  ok: boolean;
  build?: CreativeBuild;
  error?: string;
}

export interface CreativeCompileArtifact {
  file: string;
  name: string;
  abi: unknown[];
  bytecode: string;
}

export interface CreativeCompileResponse {
  ok: boolean;
  compilerVersion?: string;
  contracts?: CreativeCompileArtifact[];
  diagnostics?: Array<{
    severity: string;
    message: string;
    file?: string | null;
  }>;
  error?: string;
}

export interface PublicChatResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

function rethrowAbort(error: unknown): void {
  if (error instanceof Error && error.name === 'AbortError') {
    throw error;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get auth header with Bearer token
 */
function getAuthHeader(token?: string | null): HeadersInit {
  const authToken = token ?? getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
  };
}

async function fetchWithAuthRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const token = getAuthToken();
  const firstResponse = await fetch(url, {
    ...init,
    headers: {
      ...getAuthHeader(token),
      ...(init.headers || {}),
    },
  });

  if (firstResponse.status !== 401 || !token) {
    return firstResponse;
  }

  const newToken = await refreshToken(token);
  if (!newToken) {
    return firstResponse;
  }

  return fetch(url, {
    ...init,
    headers: {
      ...getAuthHeader(newToken),
      ...(init.headers || {}),
    },
  });
}

// ─── Agent Bridge APIs ───────────────────────────────────────────────────────

export async function sendAgentMessage(request: {
  conversationId?: string;
  message: string;
  model?: string;
  sandboxMode?: boolean;
}, signal?: AbortSignal): Promise<AgentChatResponse> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/agent/chat`, {
      method: 'POST',
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Agent chat failed' }));
      return {
        ok: false,
        error: error.error || error.message || 'Agent chat failed',
      };
    }

    return response.json();
  } catch (error) {
    rethrowAbort(error);
    console.error('[AI] Agent chat failed:', error);
    return {
      ok: false,
      error: 'Network error',
    };
  }
}

export async function sendPublicAgentMessage(request: {
  message: string;
  language: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}, signal?: AbortSignal): Promise<PublicChatResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/public-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    const payload = await response.json().catch(() => ({})) as PublicChatResponse;
    if (!response.ok) {
      return { ok: false, error: payload.error || 'Public chat failed' };
    }
    return payload;
  } catch (error) {
    rethrowAbort(error);
    console.error('[AI] Public chat failed:', error);
    return { ok: false, error: 'Network error' };
  }
}

export async function createCreativePlan(request: {
  prompt: string;
  language: string;
}, signal?: AbortSignal): Promise<CreativePlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/creative/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    const payload = await response.json().catch(() => ({})) as CreativePlanResponse;
    if (!response.ok) {
      return { ok: false, error: payload.error || 'Creative plan failed' };
    }
    return payload;
  } catch (error) {
    rethrowAbort(error);
    console.error('[AI] Creative plan failed:', error);
    return { ok: false, error: 'Network error' };
  }
}

export async function createCreativeBuild(request: {
  prompt: string;
  language: string;
  plan: CreativePlan;
}, signal?: AbortSignal): Promise<CreativeBuildResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/creative/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    const payload = await response.json().catch(() => ({})) as CreativeBuildResponse;
    if (!response.ok) {
      return { ok: false, error: payload.error || 'Creative build failed' };
    }
    return payload;
  } catch (error) {
    rethrowAbort(error);
    console.error('[AI] Creative build failed:', error);
    return { ok: false, error: 'Network error' };
  }
}

export async function compileCreativeContracts(
  files: CreativeBuildFile[],
  signal?: AbortSignal,
): Promise<CreativeCompileResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/creative/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
      signal,
    });
    const payload = await response.json().catch(() => ({})) as CreativeCompileResponse;
    if (!response.ok) {
      return { ok: false, error: payload.error || 'Contract compilation failed' };
    }
    return payload;
  } catch (error) {
    rethrowAbort(error);
    console.error('[AI] Contract compilation failed:', error);
    return { ok: false, error: 'Network error' };
  }
}

export function parseCreativeBuildDraft(raw: string): CreativeBuild {
  const normalized = raw.replace(/```[a-z0-9_-]*\s*/gi, '').replace(/```/g, '');
  const markerPattern = /@@FILE:([^|\r\n]+)\|([^@\r\n]+)@@/g;
  const markers = Array.from(normalized.matchAll(markerPattern));
  const files = markers.map((marker, index): CreativeBuildFile => {
    const contentStart = (marker.index ?? 0) + marker[0].length;
    const nextMarker = markers[index + 1]?.index;
    const endMarker = normalized.indexOf('@@END@@', contentStart);
    const contentEnd = nextMarker ?? (endMarker >= 0 ? endMarker : normalized.length);
    return {
      path: (marker[1] || 'untitled.txt').trim(),
      language: (marker[2] || 'text').trim(),
      content: normalized.slice(contentStart, contentEnd).replace(/^\s+/, ''),
    };
  });
  const summaryStart = normalized.indexOf('@@SUMMARY@@');
  const firstFileStart = markers[0]?.index ?? normalized.length;
  const summary = normalized
    .slice(summaryStart >= 0 ? summaryStart + '@@SUMMARY@@'.length : 0, firstFileStart)
    .trim();

  return { summary, files };
}

export async function createCreativeBuildStream(
  request: {
    prompt: string;
    language: string;
    plan: CreativePlan;
  },
  onDraft: (build: CreativeBuild) => void,
  signal?: AbortSignal,
): Promise<CreativeBuildResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/creative/build-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({})) as CreativeBuildResponse;
      return { ok: false, error: payload.error || 'Creative build stream failed' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let rawBuild = '';
    let completedBuild: CreativeBuild | undefined;
    let streamError = '';

    while (true) {
      const { done, value } = await reader.read();
      lineBuffer += decoder.decode(value, { stream: !done });
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = done ? '' : lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          type?: 'delta' | 'done' | 'error';
          delta?: string;
          build?: CreativeBuild;
          error?: string;
        };
        if (event.type === 'delta' && event.delta) {
          rawBuild += event.delta;
          onDraft(parseCreativeBuildDraft(rawBuild));
        } else if (event.type === 'done' && event.build) {
          completedBuild = event.build;
        } else if (event.type === 'error') {
          streamError = event.error || 'Creative build stream failed';
        }
      }

      if (done) break;
    }

    if (streamError) return { ok: false, error: streamError };
    if (!completedBuild) return { ok: false, error: 'Creative build stream ended early' };
    onDraft(completedBuild);
    return { ok: true, build: completedBuild };
  } catch (error) {
    rethrowAbort(error);
    console.error('[AI] Creative build stream failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function getStoredAgentConversations(): Promise<StoredConversationSummary[]> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/conversations`, {
      method: 'GET',
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch (error) {
    console.error('[AI] Get stored conversations failed:', error);
    return [];
  }
}

export async function searchStoredAgentConversations(
  query: string,
): Promise<StoredConversationSearchResult[]> {
  try {
    const response = await fetchWithAuthRetry(
      `${API_BASE_URL}/ai/conversations/search?q=${encodeURIComponent(query.trim())}`,
      { method: 'GET' },
    );
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error('[AI] Search stored conversations failed:', error);
    return [];
  }
}

export async function getStoredAgentConversation(
  conversationId: string,
): Promise<StoredConversationDetail | null> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/conversations/${conversationId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('[AI] Get stored conversation failed:', error);
    return null;
  }
}

export async function deleteStoredAgentConversation(
  conversationId: string,
): Promise<boolean> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/conversations/${conversationId}`, {
      method: 'DELETE',
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({})) as { success?: boolean };
    return Boolean(payload.success);
  } catch (error) {
    console.error('[AI] Delete stored conversation failed:', error);
    return false;
  }
}

export async function syncAgentConversation(request: {
  conversationId: string;
  title?: string;
  model?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<boolean> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/sync-body`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({})) as { success?: boolean };
    return Boolean(payload.success);
  } catch (error) {
    console.error('[AI] Sync conversation failed:', error);
    return false;
  }
}

export async function confirmAgentAction(request: {
  conversationId: string;
  approve: boolean;
}): Promise<AgentChatResponse> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/agent/confirm`, {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Agent confirmation failed' }));
      return {
        ok: false,
        error: error.error || error.message || 'Agent confirmation failed',
      };
    }

    return response.json();
  } catch (error) {
    console.error('[AI] Agent confirmation failed:', error);
    return {
      ok: false,
      error: 'Network error',
    };
  }
}

export async function submitClientToolResult(request: {
  conversationId: string;
  toolUseId: string;
  result: string;
}): Promise<AgentChatResponse> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/agent/client-tool-result`, {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Client tool result submit failed' }));
      return {
        ok: false,
        error: error.error || error.message || 'Client tool result submit failed',
      };
    }

    return response.json();
  } catch (error) {
    console.error('[AI] Client tool result submit failed:', error);
    return {
      ok: false,
      error: 'Network error',
    };
  }
}

export async function sweepAgentSandbox(request: {
  conversationId: string;
}): Promise<AgentSweepResponse> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/agent/sweep`, {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Sandbox sweep failed' }));
      return {
        ok: false,
        error: error.error || error.message || 'Sandbox sweep failed',
      };
    }

    return response.json();
  } catch (error) {
    console.error('[AI] Sandbox sweep failed:', error);
    return {
      ok: false,
      error: 'Network error',
    };
  }
}

export async function getAgentSandboxDetails(
  conversationId: string,
): Promise<AgentSandboxDetailsResponse> {
  try {
    const response = await fetchWithAuthRetry(`${API_BASE_URL}/ai/agent/sandbox/${conversationId}`, {
      method: 'GET',
    });
    const payload = await response.json().catch(() => ({})) as AgentSandboxDetailsResponse;
    if (!response.ok) {
      return { ok: false, error: payload.error || 'Sandbox wallet lookup failed' };
    }
    return payload;
  } catch (error) {
    console.error('[AI] Get sandbox details failed:', error);
    return { ok: false, error: 'Network error' };
  }
}
