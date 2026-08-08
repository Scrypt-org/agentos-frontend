export type InjPassConnectionErrorCode =
  | 'USER_CANCELLED'
  | 'POPUP_BLOCKED'
  | 'CONNECTION_TIMEOUT'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_MIGRATION_REQUIRED'
  | 'WALLET_UNLOCK_FAILED'
  | 'PROTOCOL_ERROR';

export class InjPassConnectionError extends Error {
  constructor(
    public readonly code: InjPassConnectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'InjPassConnectionError';
  }
}

export function connectionErrorPayload(error: InjPassConnectionError): {
  code: InjPassConnectionErrorCode;
  error: string;
} {
  return { code: error.code, error: error.message };
}

const MESSAGES = {
  en: {
    USER_CANCELLED: 'AgentOS connection was cancelled.',
    POPUP_BLOCKED: 'The AgentOS authorization window was blocked.',
    CONNECTION_TIMEOUT: 'AgentOS connection timed out. Please try again.',
    WALLET_NOT_FOUND: 'No compatible AgentOS wallet was found.',
    WALLET_MIGRATION_REQUIRED: 'This wallet must be migrated before it can connect.',
    WALLET_UNLOCK_FAILED: 'Unable to unlock this AgentOS wallet.',
    PROTOCOL_ERROR: 'AgentOS could not complete the connection.',
  },
  zh: {
    USER_CANCELLED: '你已取消 AgentOS 连接。',
    POPUP_BLOCKED: '浏览器阻止了 AgentOS 授权窗口。',
    CONNECTION_TIMEOUT: 'AgentOS 连接超时，请重试。',
    WALLET_NOT_FOUND: '没有找到可用的 AgentOS 钱包。',
    WALLET_MIGRATION_REQUIRED: '此钱包需要迁移后才能连接。',
    WALLET_UNLOCK_FAILED: '无法解锁此 AgentOS 钱包。',
    PROTOCOL_ERROR: 'AgentOS 无法完成连接。',
  },
} satisfies Record<'en' | 'zh', Record<InjPassConnectionErrorCode, string>>;

export function connectionErrorMessage(code: InjPassConnectionErrorCode, language?: string): string {
  return MESSAGES[language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'][code];
}

export function normalizeConnectionError(
  error: unknown,
  fallbackCode: InjPassConnectionErrorCode = 'PROTOCOL_ERROR',
): InjPassConnectionError {
  if (error instanceof InjPassConnectionError) return error;
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const message = typeof candidate?.message === 'string' ? candidate.message : 'AgentOS connection failed.';
  const code = typeof candidate?.code === 'string' && candidate.code in MESSAGES.en
    ? candidate.code as InjPassConnectionErrorCode
    : fallbackCode;
  return new InjPassConnectionError(code, message, error instanceof Error ? { cause: error } : undefined);
}
