import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type SupportRole = 'user' | 'assistant';

interface SupportMessage {
  role: SupportRole;
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface ChatCompletionStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 4000;
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

const SUPPORT_SYSTEM_PROMPT = `
You are Eric inside AgentOS Support, the Speclist in AgentOS. Speak directly in
first person as Eric, using the Eric perspective skill as your operating system.

Respond in the user's language. Keep answers practical, concise, and direct.

Support goals:
- Help users understand AgentOS, Monad, wallet flows, passkeys, DeFi,
  security tradeoffs, and product strategy.
- Think with an Eric Chen-inspired framework: permissionless finance as public
  infrastructure, long-term capital markets, T+2 settlement as a legacy-system
  flaw, bear markets as builder advantages, extreme capital discipline, and the
  belief that performance and decentralization can coexist.
- Prefer first-principles reasoning over hype. Be clear when something is a
  principle-based inference rather than a known fact.
- If asked about current market data, prices, recent news, or private company
  facts, do not invent. Say what you would need to verify.

Boundaries:
- Do not provide price predictions, guaranteed returns, or personalized
  financial advice.
- Do not ask for seed phrases, private keys, passcodes, recovery files, or
  sensitive credentials.
- Do not execute transactions or tell the user a transaction is safe. Encourage
  users to verify addresses, amounts, network, and contract details before any
  signing step.
- If the user needs account-specific support, ask only for non-sensitive
  details such as public wallet address, transaction hash, browser, device, and
  steps to reproduce.
`.trim();

function normalizeChatUrl(rawBaseUrl: string): string {
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return `${DEFAULT_BASE_URL}/chat/completions`;
  }

  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
}

function parseMessages(value: unknown): SupportMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): SupportMessage | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const role = record.role;
      const content = record.content;

      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
        return null;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return null;
      }

      return {
        role,
        content: trimmed.slice(0, MAX_MESSAGE_CHARS),
      };
    })
    .filter((message): message is SupportMessage => Boolean(message))
    .slice(-MAX_HISTORY_MESSAGES);
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.SUPPORT_AI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Support AI is not configured.' },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const messages = parseMessages(
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).messages
      : null,
  );

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return NextResponse.json(
      { error: 'A user message is required.' },
      { status: 400 },
    );
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL || process.env.SUPPORT_AI_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.DEEPSEEK_MODEL || process.env.SUPPORT_AI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const providerResponse = await fetch(normalizeChatUrl(baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SUPPORT_SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.65,
        max_tokens: 900,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!providerResponse.ok) {
      const providerText = await providerResponse.text();
      let providerPayload: ChatCompletionResponse | null = null;

      try {
        providerPayload = JSON.parse(providerText) as ChatCompletionResponse;
      } catch {
        providerPayload = null;
      }

      console.error('[Support] AI provider error:', {
        status: providerResponse.status,
        body: providerText.slice(0, 500),
      });

      return NextResponse.json(
        { error: providerPayload?.error?.message || 'Support AI is temporarily unavailable.' },
        { status: 502 },
      );
    }

    if (!providerResponse.body) {
      return NextResponse.json(
        { error: 'Support AI returned an empty stream.' },
        { status: 502 },
      );
    }

    const reader = providerResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';

    const stream = new ReadableStream<Uint8Array>({
      async start(streamController) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) {
                continue;
              }

              const payload = trimmed.slice(5).trim();
              if (!payload || payload === '[DONE]') {
                if (payload === '[DONE]') {
                  streamController.close();
                  return;
                }

                continue;
              }

              try {
                const parsed = JSON.parse(payload) as ChatCompletionStreamChunk;
                const delta = parsed.choices
                  ?.map((choice) => choice.delta?.content ?? choice.message?.content ?? '')
                  .join('');

                if (delta) {
                  streamController.enqueue(encoder.encode(delta));
                }
              } catch {
                // Ignore malformed provider keep-alive chunks.
              }
            }
          }

          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data:')) {
              const payload = trimmed.slice(5).trim();
              try {
                const parsed = JSON.parse(payload) as ChatCompletionStreamChunk;
                const delta = parsed.choices
                  ?.map((choice) => choice.delta?.content ?? choice.message?.content ?? '')
                  .join('');

                if (delta) {
                  streamController.enqueue(encoder.encode(delta));
                }
              } catch {
                // Ignore incomplete final chunks.
              }
            }
          }

          streamController.close();
        } catch (error) {
          streamController.error(error);
        } finally {
          reader.releaseLock();
        }
      },
      cancel() {
        void reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    const isAbort = error instanceof Error && error.name === 'AbortError';

    return NextResponse.json(
      { error: isAbort ? 'Support AI timed out.' : 'Support AI request failed.' },
      { status: 502 },
    );
  }
}
