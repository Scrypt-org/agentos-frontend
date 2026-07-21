import type { Eip1193Provider } from './index';

export const INJPASS_MINIAPP_CHANNEL = 'injpass-miniapp-v1';

export interface InjPassMiniAppSession {
  authenticated: boolean;
  address: string | null;
  walletName?: string;
  chainId: number;
  /** INJ Pass interface language, such as en, de, fr, ko, ja, zh-Hans, or zh-Hant. */
  language?: string;
}

export interface InjPassMiniAppConfig {
  /** Usually inferred from the iframe URL or document.referrer. */
  hostOrigin?: string;
  /** Override only when an INJ Pass host uses a versioned private channel. */
  channel?: string;
  /** RPC timeout. Wallet approvals may take longer than ordinary reads. */
  timeoutMs?: number;
}

export interface ConnectedMiniAppWallet {
  address: string;
  walletName?: string;
  chainId: number;
  provider: Eip1193Provider;
}

export type InjPassMiniAppNavigationAction = 'back' | 'forward' | 'home' | 'reload';

type EventHandler = (...args: unknown[]) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error & { code?: number; data?: unknown }) => void;
  timer: ReturnType<typeof setTimeout>;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function persistHostContext(): void {
  if (!isBrowser() || window.parent === window) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('injpass_miniapp') === '1') {
    window.sessionStorage.setItem('injpass.miniapp.active', '1');
  }
  const configuredOrigin = params.get('injpass_host_origin');
  if (!configuredOrigin) return;
  try {
    window.sessionStorage.setItem('injpass.miniapp.parentOrigin', new URL(configuredOrigin).origin);
  } catch {
    // Invalid origins are rejected when the connector is constructed.
  }
}

function inferHostOrigin(explicit?: string): string {
  if (!isBrowser()) throw new Error('INJ Pass mini app connector requires a browser.');
  persistHostContext();
  const candidate = explicit
    || window.sessionStorage.getItem('injpass.miniapp.parentOrigin')
    || (document.referrer ? new URL(document.referrer).origin : '');
  if (!candidate) throw new Error('Unable to determine the INJ Pass host origin.');
  return new URL(candidate).origin;
}

export class InjPassMiniAppConnector {
  private readonly hostOrigin: string;
  private readonly channel: string;
  private readonly timeoutMs: number;
  private readonly homePath: string;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventListeners = new Map<string, Set<EventHandler>>();
  private readonly sessionListeners = new Set<(session: InjPassMiniAppSession) => void>();
  private readonly provider: Eip1193Provider;
  private session: InjPassMiniAppSession | null = null;
  private requestCounter = 0;
  private navigationDepth = 0;
  private navigationForwardDepth = 0;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;
  private titleObserver: MutationObserver | null = null;

  static isEmbedded(): boolean {
    if (!isBrowser() || window.parent === window) return false;
    persistHostContext();
    return new URLSearchParams(window.location.search).get('injpass_miniapp') === '1'
      || window.sessionStorage.getItem('injpass.miniapp.active') === '1';
  }

  constructor(config: InjPassMiniAppConfig = {}) {
    if (!InjPassMiniAppConnector.isEmbedded()) {
      throw new Error('This app is not running inside an INJ Pass mini app frame.');
    }
    this.hostOrigin = inferHostOrigin(config.hostOrigin);
    this.channel = config.channel || INJPASS_MINIAPP_CHANNEL;
    this.timeoutMs = config.timeoutMs || 120_000;
    this.homePath = window.location.pathname || '/';
    this.provider = {
      isInjPass: true,
      isMetaMask: false,
      request: ({ method, params = [] }) => this.request(method, params),
      on: (event, handler) => {
        const listeners = this.eventListeners.get(event) || new Set<EventHandler>();
        listeners.add(handler);
        this.eventListeners.set(event, listeners);
      },
      removeListener: (event, handler) => this.eventListeners.get(event)?.delete(handler),
    };
    this.navigationDepth = window.location.pathname === '/' ? 0 : 1;
    window.addEventListener('message', this.handleMessage);
    this.installNavigationBridge();
    this.post({ type: 'ready' });
    queueMicrotask(this.sendNavigation);
  }

  getEthereumProvider(): Eip1193Provider {
    return this.provider;
  }

  getSession(): InjPassMiniAppSession | null {
    return this.session;
  }

  async connect(options: { requestLogin?: boolean } = {}): Promise<ConnectedMiniAppWallet | null> {
    const session = await this.waitForSession();
    if (!session.authenticated || !session.address) {
      if (options.requestLogin) await this.requestLogin();
      return null;
    }
    return {
      address: session.address,
      walletName: session.walletName,
      chainId: session.chainId,
      provider: this.provider,
    };
  }

  async requestLogin(): Promise<void> {
    await this.request('injpass_requestLogin', []);
  }

  async requestLogout(): Promise<void> {
    await this.request('injpass_requestLogout', []);
  }

  onSession(listener: (session: InjPassMiniAppSession) => void): () => void {
    this.sessionListeners.add(listener);
    if (this.session) queueMicrotask(() => listener(this.session as InjPassMiniAppSession));
    return () => this.sessionListeners.delete(listener);
  }

  waitForSession(timeoutMs = 10_000): Promise<InjPassMiniAppSession> {
    if (this.session) return Promise.resolve(this.session);
    this.post({ type: 'ready' });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('INJ Pass host session was not received.'));
      }, timeoutMs);
      const unsubscribe = this.onSession((session) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(session);
      });
    });
  }

  openHostChat(): void {
    this.post({ type: 'open-host-chat' });
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    window.removeEventListener('popstate', this.sendNavigation);
    window.removeEventListener('hashchange', this.sendNavigation);
    if (this.originalPushState) window.history.pushState = this.originalPushState;
    if (this.originalReplaceState) window.history.replaceState = this.originalReplaceState;
    this.titleObserver?.disconnect();
    this.titleObserver = null;
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error('INJ Pass mini app connector was destroyed.'));
    });
    this.pending.clear();
    this.eventListeners.clear();
    this.sessionListeners.clear();
  }

  private request(method: string, params: unknown[]): Promise<unknown> {
    const id = `miniapp-${Date.now()}-${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error(`INJ Pass timed out while handling ${method}.`) as Error & { code?: number };
        error.code = -32000;
        reject(error);
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.post({ type: 'rpc-request', id, method, params });
    });
  }

  private post(payload: Record<string, unknown>): void {
    window.parent.postMessage({ channel: this.channel, ...payload }, this.hostOrigin);
  }

  private readNavigationPath(): string {
    const url = new URL(window.location.href);
    url.searchParams.delete('injpass_miniapp');
    url.searchParams.delete('injpass_host_origin');
    return `${url.pathname}${url.search}${url.hash}` || '/';
  }

  private sendNavigation = (): void => {
    this.post({
      type: 'navigation',
      path: this.readNavigationPath(),
      title: document.title,
      canGoBack: this.navigationDepth > 0 || window.location.pathname !== '/',
      canGoForward: this.navigationForwardDepth > 0,
    });
  };

  private scheduleNavigation = (): void => {
    window.setTimeout(this.sendNavigation, 0);
  };

  private installNavigationBridge(): void {
    this.originalPushState = window.history.pushState;
    this.originalReplaceState = window.history.replaceState;
    window.history.pushState = ((data: unknown, unused: string, url?: string | URL | null) => {
      this.originalPushState?.call(window.history, data, unused, url);
      this.navigationDepth += 1;
      this.navigationForwardDepth = 0;
      this.scheduleNavigation();
    }) as History['pushState'];
    window.history.replaceState = ((data: unknown, unused: string, url?: string | URL | null) => {
      this.originalReplaceState?.call(window.history, data, unused, url);
      this.scheduleNavigation();
    }) as History['replaceState'];
    window.addEventListener('popstate', this.sendNavigation);
    window.addEventListener('hashchange', this.sendNavigation);
    this.titleObserver = new MutationObserver(this.scheduleNavigation);
    this.titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  private handleNavigationCommand(action: unknown): void {
    if (action === 'back') {
      if (this.navigationDepth <= 0 && window.location.pathname === '/') return;
      this.navigationDepth = Math.max(0, this.navigationDepth - 1);
      this.navigationForwardDepth += 1;
      window.history.back();
      return;
    }
    if (action === 'forward') {
      if (this.navigationForwardDepth <= 0) return;
      this.navigationDepth += 1;
      this.navigationForwardDepth -= 1;
      window.history.forward();
      return;
    }
    if (action === 'home') {
      this.navigationDepth = 0;
      this.navigationForwardDepth = 0;
      window.location.assign(this.homePath);
      return;
    }
    if (action === 'reload') window.location.reload();
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((listener) => listener(...args));
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.source !== window.parent || event.origin !== this.hostOrigin) return;
    const message = event.data as Record<string, unknown> | null;
    if (!message || message.channel !== this.channel) return;

    if (message.type === 'navigation-command') {
      this.handleNavigationCommand(message.action);
      return;
    }

    if (message.type === 'session') {
      const previous = this.session;
      const next = message.session as InjPassMiniAppSession;
      this.session = next;
      this.sessionListeners.forEach((listener) => listener(next));
      if (previous?.address !== next.address) this.emit('accountsChanged', next.address ? [next.address] : []);
      if (previous?.chainId !== next.chainId) this.emit('chainChanged', `0x${next.chainId.toString(16)}`);
      return;
    }

    if (message.type !== 'rpc-response' || typeof message.id !== 'string') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error && typeof message.error === 'object') {
      const payload = message.error as { code?: number; message?: string; data?: unknown };
      const error = new Error(payload.message || 'INJ Pass request failed.') as Error & { code?: number; data?: unknown };
      error.code = payload.code;
      error.data = payload.data;
      pending.reject(error);
      return;
    }
    pending.resolve(message.result);
  };
}
