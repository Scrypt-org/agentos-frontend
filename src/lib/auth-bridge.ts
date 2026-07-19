/**
 * 授权桥接模块 - 处理跨域通信和弹窗授权
 * 解决 Storage Partitioning 导致的 iframe 中无法访问 LocalStorage 的问题
 */

import {
  InjPassConnectionError,
  type InjPassConnectionErrorCode,
} from './injpass-connection-error';

// ===== 1. 安全配置 =====
// 通过环境变量配置跨域白名单（逗号分隔）：
// NEXT_PUBLIC_ALLOWED_ORIGINS=https://omisper.example.com,https://inj-pass-frontend-test.vercel.app
const ALLOWED_ORIGINS: string[] = (process.env.NEXT_PUBLIC_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isLocalhostOrigin = (origin: string): boolean =>
  origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');

const isTrustedOrigin = (origin: string): boolean => {
  const isSameOrigin = typeof window !== 'undefined' && origin === window.location.origin;
  const isInWhitelist = ALLOWED_ORIGINS.includes(origin);
  const allowLocalhostInDev = process.env.NODE_ENV !== 'production' && isLocalhostOrigin(origin);

  return isSameOrigin || isInWhitelist || allowLocalhostInDev;
};

const getAuthPopupUrl = () => {
  // 在客户端使用 window.location.origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth`;
  }
  return '/auth';
};

// 弹窗定位到屏幕右下角，连接完成后会缩小为悬浮球
const getPopupFeatures = (width = 400, height = 800) => {
  const left = Math.max(0, (screen.availWidth  || screen.width)  - width  - 20);
  const top  = Math.max(0, (screen.availHeight || screen.height) - height - 60);
  return `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`;
};

// ===== 2. 类型定义 =====
export interface AuthRequest {
  type: 'PASSKEY_SIGN';
  requestId: string;
  message: string;
  origin: string; // 请求来源（用于验证）
}

export interface AuthResponse {
  type: 'PASSKEY_SIGN_RESPONSE' | 'AUTH_WINDOW_READY';
  requestId: string;
  signature?: number[];
  address?: string;
  error?: string;
}

export interface WalletConnectRequest {
  type: 'WALLET_CONNECT';
  requestId: string;
  origin: string;
  appOrigin?: string;
}

export interface WalletConnectResponse {
  type: 'WALLET_CONNECT_RESPONSE' | 'AUTH_WINDOW_READY';
  requestId: string;
  address?: string;
  walletName?: string;
  walletType?: 'passkey' | 'traditional';
  code?: InjPassConnectionErrorCode;
  error?: string;
}

export function watchPopupClosed(
  popup: Pick<Window, 'closed'>,
  onClose: () => void,
  intervalMs = 250,
): () => void {
  const interval = setInterval(() => {
    if (!popup.closed) return;
    clearInterval(interval);
    onClose();
  }, intervalMs);
  return () => clearInterval(interval);
}

export type CurrentAuthRequestMessage =
  | WalletConnectRequest
  | AuthRequest
  | { type: 'SIGN_REQUEST'; requestId: string; message: string }
  | { type: 'TX_REQUEST'; requestId: string; tx: unknown };

/** Return true only for an INJ Pass protocol message belonging to this request. */
export function isCurrentAuthRequestMessage(
  data: unknown,
  requestId: string,
): data is CurrentAuthRequestMessage {
  if (!data || typeof data !== 'object') return false;
  const message = data as Record<string, unknown>;
  if (message.requestId !== requestId) return false;

  switch (message.type) {
    case 'WALLET_CONNECT':
      return typeof message.origin === 'string';
    case 'PASSKEY_SIGN':
      return typeof message.origin === 'string' && typeof message.message === 'string';
    case 'SIGN_REQUEST':
      return typeof message.message === 'string';
    case 'TX_REQUEST':
      return Boolean(message.tx) && typeof message.tx === 'object';
    default:
      return false;
  }
}

// ===== 3. 弹窗授权函数 - 签名 =====
export function triggerPasskeySign(message: string): Promise<{ signature: Uint8Array; address: string }> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const authUrl = getAuthPopupUrl();
    
    // 打开授权窗口
    const popup = window.open(
      `${authUrl}?requestId=${requestId}&origin=${encodeURIComponent(window.location.origin)}&action=sign`,
      'injpass_auth',
      getPopupFeatures()
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    // 监听授权结果
    const handleMessage = (event: MessageEvent<AuthResponse>) => {
      if (event.source !== popup || event.origin !== window.location.origin) return;

      const { type, requestId: respId, signature, address, error } = event.data;

      // 处理窗口准备就绪消息
      if (type === 'AUTH_WINDOW_READY' && respId === requestId) {
        console.log('✅ Auth window ready, sending sign request');
        clearInterval(sendInterval); // 停止轮询
        sendRequest(); // 发送一次请求
        return;
      }

      if (type === 'PASSKEY_SIGN_RESPONSE' && respId === requestId) {
        // 清理所有资源
        clearTimeout(timeout);
        clearInterval(sendInterval);
        window.removeEventListener('message', handleMessage);
        
        if (!popup.closed) {
          popup.close();
        }

        if (error) {
          reject(new Error(error));
        } else if (signature && address) {
          resolve({ signature: new Uint8Array(signature), address });
        } else {
          reject(new Error('Invalid response from auth window'));
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // 将签名请求发送给弹窗
    const sendRequest = () => {
      if (popup && !popup.closed) {
        const request: AuthRequest = {
          type: 'PASSKEY_SIGN',
          requestId,
          message,
          origin: window.location.origin
        };
        popup.postMessage(request, authUrl.startsWith('http') ? new URL(authUrl).origin : window.location.origin);
      }
    };

    // 超时处理（60秒）
    const timeout = setTimeout(() => {
      clearInterval(sendInterval);
      window.removeEventListener('message', handleMessage);
      if (!popup.closed) {
        popup.close();
      }
      reject(new Error('Authentication timeout. Please try again.'));
    }, 60000);

    // 轮询发送请求，确保弹窗加载完成（降低频率避免重复触发）
    let attempts = 0;
    const maxAttempts = 5; // 减少到 5 次
    const sendInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(sendInterval);
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        reject(new Error('Authentication window was closed'));
        return;
      }
      
      sendRequest();
      attempts++;
      
      if (attempts >= maxAttempts) {
        clearInterval(sendInterval);
      }
    }, 1000); // 增加到 1 秒
  });
}

// ===== 4. 弹窗授权函数 - 连接钱包 =====
export function triggerWalletConnect(appOrigin?: string): Promise<{
  address: string;
  walletName: string;
  walletType?: 'passkey' | 'traditional';
  popup: Window;
}> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const authUrl = getAuthPopupUrl();
    
    // 打开授权窗口
    const query = new URLSearchParams({
      requestId,
      origin: window.location.origin,
      action: 'connect',
    });
    if (appOrigin) query.set('appOrigin', appOrigin);
    const popup = window.open(
      `${authUrl}?${query.toString()}`,
      'injpass_connect',
      getPopupFeatures()
    );

    if (!popup) {
      reject(new InjPassConnectionError('POPUP_BLOCKED', 'Popup blocked. Please allow popups for this site.'));
      return;
    }
    console.log('[INJPASS] connect: auth popup opened, waiting for AUTH_WINDOW_READY', { requestId });
    let settled = false;
    let stopCloseWatch: () => void = () => undefined;

    // 监听连接结果
    const handleMessage = (event: MessageEvent<WalletConnectResponse>) => {
      if (event.source !== popup || event.origin !== window.location.origin) return;

      const { type, requestId: respId, address, walletName, walletType, error } = event.data;

      // 处理窗口准备就绪消息
      if (type === 'AUTH_WINDOW_READY' && respId === requestId) {
        console.log('[INJPASS] connect: AUTH_WINDOW_READY received, sending WALLET_CONNECT');
        clearInterval(sendInterval); // 停止轮询
        sendRequest(); // 发送一次请求
        return;
      }

      if (type === 'WALLET_CONNECT_RESPONSE' && respId === requestId) {
        if (settled) return;
        settled = true;
        console.log('[INJPASS] connect: WALLET_CONNECT_RESPONSE received', { hasError: !!error });
        // 清理资源（但不关闭弹窗！）
        clearTimeout(timeout);
        clearTimeout(blockedCheck);
        clearInterval(sendInterval);
        stopCloseWatch();
        window.removeEventListener('message', handleMessage);
        
        // 🔐 不关闭弹窗，让它转换为持久化签名模式

        if (error) {
          // 出错时才关闭弹窗
          if (!popup.closed) {
            popup.close();
          }
          reject(new InjPassConnectionError(event.data.code || 'PROTOCOL_ERROR', error));
        } else if (address && walletName) {
          // 成功时返回弹窗引用
          resolve({ address, walletName, walletType, popup });
        } else {
          if (!popup.closed) {
            popup.close();
          }
          reject(new InjPassConnectionError('PROTOCOL_ERROR', 'Invalid response from auth window'));
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // 弹窗拦截检测：部分拦截器/浏览器会返回一个立即关闭的假窗口，
    // window.open 不返回 null，因此需要延迟复查 popup.closed，
    // 给出明确的"弹窗被拦截"提示，而不是误导性的"窗口被关闭"。
    const blockedCheck = setTimeout(() => {
      if (popup.closed) {
        if (settled) return;
        settled = true;
        clearInterval(sendInterval);
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        reject(
          new InjPassConnectionError('POPUP_BLOCKED', 'Popup blocked. Please allow popups for this site and try again.')
        );
        return;
      }

      stopCloseWatch = watchPopupClosed(popup, () => {
        if (settled) return;
        settled = true;
        clearInterval(sendInterval);
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        reject(new InjPassConnectionError('USER_CANCELLED', 'Authentication window was closed'));
      });
    }, 600);

    // 将连接请求发送给弹窗
    const sendRequest = () => {
      if (popup && !popup.closed) {
        const request: WalletConnectRequest = {
          type: 'WALLET_CONNECT',
          requestId,
          origin: window.location.origin,
          appOrigin,
        };
        popup.postMessage(request, authUrl.startsWith('http') ? new URL(authUrl).origin : window.location.origin);
      }
    };

    // 超时处理（60秒）
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(sendInterval);
      clearTimeout(blockedCheck);
      stopCloseWatch();
      window.removeEventListener('message', handleMessage);
      if (!popup.closed) {
        popup.close();
      }
      reject(new InjPassConnectionError('CONNECTION_TIMEOUT', 'Connection timeout. Please try again.'));
    }, 60000);

    // 轮询发送请求（降低频率避免重复触发）
    let attempts = 0;
    const maxAttempts = 5; // 减少到 5 次
    const sendInterval = setInterval(() => {
      if (popup.closed) {
        if (settled) return;
        settled = true;
        clearInterval(sendInterval);
        clearTimeout(timeout);
        clearTimeout(blockedCheck);
        stopCloseWatch();
        window.removeEventListener('message', handleMessage);
        reject(new InjPassConnectionError('USER_CANCELLED', 'Authentication window was closed'));
        return;
      }

      sendRequest();
      attempts++;

      if (attempts >= maxAttempts) {
        clearInterval(sendInterval);
      }
    }, 1000); // 增加到 1 秒
  });
}

// ===== 4.5 弹窗授权函数 - 交易审批 =====
export function triggerTxRequest(tx: {
  to: string;
  data?: string;
  value?: string;
  gas?: string;
}): Promise<{ popup: Window }> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const authUrl = getAuthPopupUrl();

    const popup = window.open(
      `${authUrl}?requestId=${requestId}&origin=${encodeURIComponent(window.location.origin)}&action=connect`,
      'injpass_connect',
      getPopupFeatures()
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;

      const { type, requestId: respId } = event.data;

      if (type === 'AUTH_WINDOW_READY' && respId === requestId) {
        clearInterval(sendInterval);
        // Popup ready — send the TX_REQUEST
        if (popup && !popup.closed) {
          popup.postMessage(
            { type: 'TX_REQUEST', requestId, tx },
            authUrl.startsWith('http') ? new URL(authUrl).origin : window.location.origin
          );
        }
        cleanup();
        resolve({ popup });
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(sendInterval);
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Transaction approval timeout.'));
    }, 30000);

    // Poll until the popup is ready
    let attempts = 0;
    const maxAttempts = 10;
    const sendInterval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Auth popup was closed'));
        return;
      }
      // Nudge the popup to ensure it loads
      try { popup.focus(); } catch {}
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(sendInterval);
      }
    }, 1000);
  });
}

// ===== 5. Origin 验证工具函数 =====
export function isValidOrigin(origin: string): boolean {
  return isTrustedOrigin(origin);
}

// ===== 6. 状态检查（使用 Broadcast Channel 替代 Cookie） =====
export class WalletStateChannel {
  private channel: BroadcastChannel | null = null;

  constructor() {
    // 检查浏览器支持
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('injpass_wallet_state');
    }
  }

  // 广播钱包状态（在主域调用）
  broadcastState(address: string | null) {
    if (this.channel) {
      this.channel.postMessage({ type: 'WALLET_STATE', address, timestamp: Date.now() });
    }
  }

  // 监听钱包状态（在 DApp iframe 调用）
  onStateChange(callback: (address: string | null) => void) {
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data.type === 'WALLET_STATE') {
          callback(event.data.address);
        }
      };
    }
  }

  // 请求当前状态
  requestState() {
    if (this.channel) {
      this.channel.postMessage({ type: 'REQUEST_STATE', timestamp: Date.now() });
    }
  }

  close() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
