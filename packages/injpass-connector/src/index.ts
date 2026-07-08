/**
 * @injpass/cli - Lightweight SDK for embedding INJ Pass wallet
 * 
 * This SDK allows dApps to easily integrate INJ Pass wallet via iframe
 * without dealing with postMessage complexity.
 * 
 * ⚡ New Architecture (v2.0):
 * - Uses popup windows for Passkey authentication (bypasses iframe restrictions)
 * - No longer requires Storage Access API
 * - Works seamlessly across all browsers (Safari, Chrome, Firefox)
 * - Fully compatible with Storage Partitioning
 */

export interface InjPassConfig {
  /**
   * URL of the INJ Pass embed page (REQUIRED)
   * 
   * Development: http://localhost:3001/embed
   * Production: Your deployed INJ Pass URL + /embed
   * 
   * @example
   * ```typescript
   * // Development
   * embedUrl: 'http://localhost:3001/embed'
   * 
   * // Production (Vercel)
   * embedUrl: 'https://your-app.vercel.app/embed'
   * ```
   */
  embedUrl: string;

  /**
   * Position of the iframe
   * @default { bottom: '20px', right: '20px' }
   */
  position?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };

  /**
   * Size of the iframe
   * @default { width: '400px', height: '300px' }
   */
  size?: {
    width: string;
    height: string;
  };

  /**
   * Display mode
   * - 'floating': Fixed position overlay
   * - 'modal': Full-screen modal
   * - 'inline': Embedded in container
   * @default 'floating'
   */
  mode?: 'floating' | 'modal' | 'inline';

  /**
   * Container element ID for inline mode
   */
  containerId?: string;

  /**
   * Auto-hide iframe when connected
   * @default true
   */
  autoHide?: boolean;

  /**
   * EVM JSON-RPC endpoint, used by `getEthereumProvider()` to answer read-only
   * methods (eth_call, eth_estimateGas, eth_getTransactionReceipt, ...) directly,
   * without round-tripping to the wallet. Required if you use `getEthereumProvider()`.
   *
   * @example 'https://k8s.testnet.json-rpc.injective.network/'
   */
  rpcUrl?: string;

  /**
   * EVM chain id reported by `getEthereumProvider()` (eth_chainId).
   *
   * @example 1439 // Injective inEVM testnet
   */
  chainId?: number;
}

export interface ConnectedWallet {
  address: string;
  walletName?: string;
  signer: InjPassSigner;
}

/** Minimal EIP-1193 provider surface (compatible with `window.ethereum`). */
export interface Eip1193Provider {
  isInjPass: boolean;
  isMetaMask: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

export class InjPassConnector {
  private iframe: HTMLIFrameElement | null = null;
  private config: Required<Omit<InjPassConfig, 'containerId' | 'rpcUrl' | 'chainId'>> & Pick<InjPassConfig, 'containerId'>;
  private embedOrigin: string;
  private connected = false;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private disconnectListeners: Set<() => void> = new Set();
  private rpcUrl?: string;
  private chainId?: number;
  private connectedWallet: ConnectedWallet | null = null;

  constructor(config: InjPassConfig) {
    if (!config.embedUrl) {
      throw new Error(
        'embedUrl is required. Please provide the INJ Pass embed URL.\n' +
        'Example: { embedUrl: "http://localhost:3001/embed" }'
      );
    }

    const parsedEmbedUrl = new URL(config.embedUrl);

    this.config = {
      embedUrl: config.embedUrl,
      position: config.position || { bottom: '20px', right: '20px' },
      size: config.size || { width: '400px', height: '300px' },
      mode: config.mode || 'floating',
      autoHide: config.autoHide !== undefined ? config.autoHide : true,
      containerId: config.containerId,
    };
    this.embedOrigin = parsedEmbedUrl.origin;
    this.rpcUrl = config.rpcUrl;
    this.chainId = config.chainId;

    // Auto-cleanup when page is closed/unloaded
    // This ensures the iframe and popup are properly closed when dApp is closed
    const cleanupHandler = () => {
      // Only cleanup if we have an active connection or pending iframe
      if (this.iframe || this.connected) {
        this.disconnect();
      }
    };

    window.addEventListener('pagehide', cleanupHandler);

    // Fallback for some browsers that don't fire pagehide reliably
    window.addEventListener('beforeunload', cleanupHandler);
  }

  /**
   * Connect to INJ Pass wallet
   * 
   * ⚡ How it works (New Architecture):
   * 1. SDK creates an iframe with INJ Pass embed page
   * 2. User clicks "Connect" in the iframe
   * 3. A popup window opens for Passkey authentication
   * 4. User authenticates with biometrics in the popup
   * 5. Popup closes and sends wallet info back to iframe
   * 6. Iframe forwards the info to your dApp
   * 
   * This popup approach bypasses browser restrictions on:
   * - Storage Access in iframes
   * - WebAuthn in cross-origin iframes
   * - Third-party cookie blocking
   */
  async connect(): Promise<ConnectedWallet> {
    if (this.connected) {
      throw new Error('Already connected');
    }

    // Wait for connection
    return new Promise((resolve, reject) => {
      // The embed page proves it loaded and its JS ran by sending its first
      // INJPASS_RESIZE. If nothing arrives within 15s, the widget almost
      // certainly failed to load (network can't reach the embed host, an ad/
      // privacy blocker killed the iframe, etc.). Fail with an actionable
      // message rather than making the dApp spin for the full 60s.
      let embedLoaded = false;
      const loadTimeout = setTimeout(() => {
        if (!embedLoaded) {
          clearTimeout(timeout);
          reject(
            new Error(
              `INJ Pass widget did not load (network or blocked?): ${this.config.embedUrl}`,
            ),
          );
          this.disconnect();
        }
      }, 15000);

      const timeout = setTimeout(() => {
        reject(
          new Error(
            embedLoaded
              ? 'Connection timeout: no response from the INJ Pass approval popup. Please retry and complete the passkey prompt.'
              : `Connection timeout: the INJ Pass widget never loaded (${this.config.embedUrl}).`,
          ),
        );
        this.disconnect();
      }, 60000); // 60 second timeout

      this.messageHandler = (event: MessageEvent) => {
        if (event.origin !== this.embedOrigin) {
          return; // Ignore messages from other origins
        }

        const { type, address, walletName, error } = event.data;

        if (type === 'INJPASS_CONNECTED') {
          clearTimeout(loadTimeout);
          clearTimeout(timeout);
          this.connected = true;

          // Don't hide — the embed page shrinks itself to a ball
          const signer = new InjPassSigner(this.iframe!, this.embedOrigin);

          const wallet: ConnectedWallet = {
            address,
            walletName,
            signer,
          };
          this.connectedWallet = wallet;

          resolve(wallet);
        }

        // Embed page requests iframe resize (ball ↔ card)
        if (type === 'INJPASS_RESIZE' && this.iframe) {
          // First RESIZE = the embed page is alive; cancel the load watchdog.
          if (!embedLoaded) {
            embedLoaded = true;
            clearTimeout(loadTimeout);
          }
          const { width, height } = event.data;
          this.iframe.style.width = `${width}px`;
          this.iframe.style.height = `${height}px`;
          this.iframe.style.borderRadius = (width <= 80 && height <= 80) ? '50%' : '16px';
          // Reveal on first resize message, and enable hover/click
          this.iframe.style.opacity = '1';
          this.iframe.style.pointerEvents = 'auto';
        }

        if (type === 'INJPASS_ERROR') {
          clearTimeout(timeout);
          reject(new Error(error || 'Connection failed'));
          this.disconnect();
        }

        if (type === 'INJPASS_SIGN_RESPONSE') {
          const pending = this.pendingRequests.get(event.data.requestId);
          if (pending) {
            if (event.data.error) {
              pending.reject(new Error(event.data.error));
            } else {
              pending.resolve(event.data.signature);
            }
            this.pendingRequests.delete(event.data.requestId);
          }
        }

        // Handle disconnect from embed page (when user clicks Disconnect in embed)
        if (type === 'INJPASS_DISCONNECTED') {
          this.disconnect();
        }
      };

      window.addEventListener('message', this.messageHandler);

      // Create the iframe now that reject/timeouts are in scope. onError fires
      // when the embed document itself can't be fetched (DNS/network/blocked
      // host) — fail fast instead of waiting out the load watchdog.
      this.createIframe(() => {
        if (!embedLoaded) {
          clearTimeout(loadTimeout);
          clearTimeout(timeout);
          reject(new Error(`Failed to load INJ Pass widget: ${this.config.embedUrl}`));
          this.disconnect();
        }
      });
    });
  }

  /**
   * Disconnect from wallet
   */
  disconnect(): void {
    // Remove iframe
    if (this.iframe) {
      this.iframe.contentWindow?.postMessage({ type: 'INJPASS_DISCONNECT' }, this.embedOrigin);
      this.iframe.remove();
      this.iframe = null;
    }

    // Remove modal backdrop if exists
    const backdrop = document.getElementById('injpass-backdrop');
    if (backdrop) {
      backdrop.remove();
    }

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    this.connected = false;
    this.connectedWallet = null;
    this.pendingRequests.clear();

    // Notify all disconnect listeners
    this.notifyDisconnectListeners();
  }

  /**
   * Subscribe to disconnect events
   */
  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  /**
   * Notify all listeners when disconnected
   */
  private notifyDisconnectListeners(): void {
    this.disconnectListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in disconnect listener:', error);
      }
    });
  }

  /**
   * Show the iframe (if hidden)
   */
  show(): void {
    if (this.iframe) {
      this.iframe.style.display = 'block';
    }
  }

  /**
   * Hide the iframe
   */
  hide(): void {
    if (this.iframe) {
      this.iframe.style.display = 'none';
    }
  }

  /**
   * Build an EIP-1193 provider (compatible with `window.ethereum`) backed by the
   * connected INJ Pass wallet.
   *
   * - Read-only RPC methods (eth_call, eth_estimateGas, eth_getTransactionReceipt, ...)
   *   are answered directly via `config.rpcUrl`.
   * - Account / signing / transaction methods are routed to the wallet, which
   *   confirms with passkey in the secure popup. The private key never leaves it.
   *
   * Assign the result to `window.ethereum` so existing wallet libraries
   * (ethers `BrowserProvider`, wagmi `injected`) work unchanged.
   *
   * @example
   * const c = new InjPassConnector({ embedUrl, rpcUrl, chainId: 1439 });
   * window.ethereum = c.getEthereumProvider();
   */
  getEthereumProvider(): Eip1193Provider {
    const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();

    const rpcRequest = async (method: string, params: unknown[] = []): Promise<unknown> => {
      if (!this.rpcUrl) {
        throw new Error(
          `INJ Pass provider: rpcUrl is required to handle "${method}". ` +
          'Pass { rpcUrl } to InjPassConnector.'
        );
      }
      const res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      });
      const json = await res.json();
      if (json.error) {
        // Preserve `code` and `data` so callers (e.g. ethers `BrowserProvider`)
        // can decode the revert payload (0x08c379a0…) into a real reason such as
        // "execution reverted: amount<min" instead of an opaque "missing revert data".
        const err = new Error(json.error.message || `RPC error for ${method}`) as Error & {
          code?: number;
          data?: unknown;
        };
        if (typeof json.error.code === 'number') err.code = json.error.code;
        if (json.error.data !== undefined) err.data = json.error.data;
        throw err;
      }
      return json.result;
    };

    const ensureConnected = async (): Promise<ConnectedWallet> => {
      if (!this.connectedWallet) {
        await this.connect();
      }
      if (!this.connectedWallet) {
        throw new Error('INJ Pass wallet not connected');
      }
      return this.connectedWallet;
    };

    const toHex = (bytes: Uint8Array) =>
      '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const provider: Eip1193Provider = {
      isInjPass: true,
      isMetaMask: true, // many dApps gate on this; the shim is fully EIP-1193

      request: async ({ method, params = [] }) => {
        switch (method) {
          case 'eth_requestAccounts': {
            const wallet = await ensureConnected();
            return [wallet.address];
          }

          case 'eth_accounts':
            return this.connectedWallet ? [this.connectedWallet.address] : [];

          case 'eth_chainId':
            if (typeof this.chainId === 'number') return '0x' + this.chainId.toString(16);
            return rpcRequest('eth_chainId', params);

          case 'net_version':
            if (typeof this.chainId === 'number') return this.chainId.toString();
            return rpcRequest('net_version', params);

          case 'eth_sendTransaction': {
            const wallet = await ensureConnected();
            const tx = (params[0] || {}) as {
              to?: string; data?: string; value?: string; gas?: string;
            };
            console.log('[INJ Pass SDK] eth_sendTransaction called:', {
              to: tx.to,
              value: tx.value,
              dataLength: tx.data?.length,
            });
            const txHash = await wallet.signer.sendTransaction({
              to: tx.to ?? '',
              data: tx.data,
              value: tx.value,
              gas: tx.gas,
            });
            console.log('[INJ Pass SDK] eth_sendTransaction resolved, txHash:', txHash);
            return txHash;
          }

          case 'personal_sign':
          case 'eth_sign': {
            const wallet = await ensureConnected();
            // personal_sign => [message, address]; eth_sign => [address, message]
            const message = method === 'personal_sign' ? params[0] : params[1];
            const sig = await wallet.signer.signMessage(String(message));
            return toHex(sig);
          }

          case 'eth_signTypedData':
          case 'eth_signTypedData_v3':
          case 'eth_signTypedData_v4': {
            const wallet = await ensureConnected();
            const data = params[1] ?? params[0];
            const sig = await wallet.signer.signMessage(
              typeof data === 'string' ? data : JSON.stringify(data),
            );
            return toHex(sig);
          }

          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain':
            return null; // wallet is fixed to Injective inEVM

          default:
            // Everything else (reads) is forwarded to the JSON-RPC endpoint.
            return rpcRequest(method, params);
        }
      },

      on: (event, handler) => {
        if (!eventListeners.has(event)) eventListeners.set(event, new Set());
        eventListeners.get(event)!.add(handler);
      },

      removeListener: (event, handler) => {
        eventListeners.get(event)?.delete(handler);
      },
    };

    return provider;
  }

  private createIframe(onError?: () => void): void {
    this.iframe = document.createElement('iframe');
    this.iframe.src = this.config.embedUrl;
    if (onError) {
      // Fires when the browser cannot load the iframe document (network error,
      // blocked host). Note: for a cross-origin document that DOES load, only
      // `onload` fires and its content stays unreadable — readiness is instead
      // confirmed by the embed page's first INJPASS_RESIZE message (see connect).
      this.iframe.onerror = onError;
    }

    // Note: We no longer need 'publickey-credentials-get' in iframe
    // because Passkey authentication happens in a popup window
    // This makes the SDK work in all browsers without Storage Access API
    this.iframe.setAttribute('allow', 'publickey-credentials-get *; publickey-credentials-create *');
    
    this.iframe.style.border = 'none';
    this.iframe.style.borderRadius = '16px';
    this.iframe.style.boxShadow = 'none';
    this.iframe.style.background = 'transparent';
    this.iframe.style.backgroundColor = 'transparent';
    // 关键：初始尺寸为 0，且 pointerEvents 为 none，防止挡住页面
    this.iframe.style.width = '0px';
    this.iframe.style.height = '0px';
    this.iframe.style.opacity = '0';
    this.iframe.style.pointerEvents = 'none';
    this.iframe.style.zIndex = '9999';
    this.iframe.style.transition = 'width 0.25s ease, height 0.25s ease, border-radius 0.25s ease, opacity 0.15s ease';
    this.iframe.style.overflow = 'hidden';
    this.iframe.setAttribute('allowtransparency', 'true');

    if (this.config.mode === 'floating') {
      this.iframe.style.position = 'fixed';
      Object.entries(this.config.position).forEach(([key, value]) => {
        (this.iframe!.style as CSSStyleDeclaration & Record<string, string>)[key] = value;
      });
      // ⚠️ DO NOT set width/height here for floating mode!
      // The embed page controls size via INJPASS_RESIZE messages
      // iframe starts at 0×0 opacity:0, then embed page resizes it
      document.body.appendChild(this.iframe);
    } else if (this.config.mode === 'modal') {
      this.iframe.style.position = 'fixed';
      this.iframe.style.top = '50%';
      this.iframe.style.left = '50%';
      this.iframe.style.transform = 'translate(-50%, -50%)';
      this.iframe.style.width = this.config.size.width;
      this.iframe.style.height = this.config.size.height;
      
      // Add backdrop
      const backdrop = document.createElement('div');
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100vw';
      backdrop.style.height = '100vh';
      backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)';
      backdrop.style.zIndex = '9998';
      backdrop.id = 'injpass-backdrop';
      document.body.appendChild(backdrop);
      document.body.appendChild(this.iframe);
    } else if (this.config.mode === 'inline' && this.config.containerId) {
      const container = document.getElementById(this.config.containerId);
      if (!container) {
        throw new Error(`Container #${this.config.containerId} not found`);
      }
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      container.appendChild(this.iframe);
    }
  }
}

class InjPassSigner {
  private requestCounter = 0;

  constructor(
    private iframe: HTMLIFrameElement,
    private targetOrigin: string
  ) {}

  /**
   * Sign a message
   * 
   * ⚡ How it works (New Architecture):
   * 1. SDK sends sign request to iframe
   * 2. Iframe opens a popup window for authentication
   * 3. User authenticates with Passkey in the popup
   * 4. Popup signs the message and sends result back
   * 5. Result is forwarded to your dApp
   * 
   * This ensures security while bypassing iframe limitations
   */
  async signMessage(message: string): Promise<Uint8Array> {
    const requestId = `sign_${++this.requestCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Signing timeout'));
      }, 30000);

      let resolved = false;
      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        try { bc.close(); } catch {}
      };

      const handler = (event: MessageEvent) => {
        if (resolved) return;
        if (event.data.type === 'INJPASS_SIGN_RESPONSE' && event.data.requestId === requestId) {
          resolved = true;
          cleanup();
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(new Uint8Array(event.data.signature));
          }
        }
      };

      let bc: BroadcastChannel;
      try {
        bc = new BroadcastChannel('injpass_tx');
        bc.onmessage = (event: MessageEvent) => {
          if (resolved) return;
          if (event.data.type === 'SIGN_RESPONSE' && event.data.requestId === requestId) {
            resolved = true;
            cleanup();
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              resolve(new Uint8Array(event.data.signature));
            }
          }
        };
      } catch {
        bc = {} as BroadcastChannel;
      }

      window.addEventListener('message', handler);

      this.iframe.contentWindow?.postMessage({
        type: 'INJPASS_SIGN_REQUEST',
        data: {
          id: requestId,
          message,
        },
      }, this.targetOrigin);
    });
  }

  /**
   * Sign and broadcast an EVM transaction.
   *
   * The request travels iframe → secure popup, where the user approves with a
   * passkey and the popup signs + broadcasts with the private key. Only the
   * resulting transaction hash is returned — the key never leaves the popup.
   *
   * @param tx Transaction fields. `value`/`gas` are hex-quantity strings
   *           (as ethers/wagmi produce them); `to`/`data` are 0x-hex.
   * @returns The broadcast transaction hash (0x...).
   */
  async sendTransaction(tx: {
    to: string;
    data?: string;
    value?: string;
    gas?: string;
  }): Promise<string> {
    const requestId = `tx_${++this.requestCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      // Generous timeout: the user must approve with a passkey in the popup.
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Transaction timeout'));
      }, 120000);

      let resolved = false;
      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        try { bc.close(); } catch {}
      };

      const handler = (event: MessageEvent) => {
        if (resolved) return;
        console.log('[INJ Pass SDK] TX message received:', {
          type: event.data.type,
          requestId: event.data.requestId,
          expectedRequestId: requestId,
          txHash: event.data.txHash,
          error: event.data.error,
          origin: event.origin,
        });
        if (event.data.type === 'INJPASS_TX_RESPONSE' && event.data.requestId === requestId) {
          resolved = true;
          cleanup();
          if (event.data.error) {
            console.error('[INJ Pass SDK] TX rejected:', event.data.error);
            reject(new Error(event.data.error));
          } else {
            console.log('[INJ Pass SDK] TX resolved with hash:', event.data.txHash);
            resolve(event.data.txHash as string);
          }
        }
      };

      // BroadcastChannel fallback: popup may send directly via BC
      // when window.opener is cross-origin (iframe → popup scenario)
      let bc: BroadcastChannel;
      try {
        bc = new BroadcastChannel('injpass_tx');
        bc.onmessage = (event: MessageEvent) => {
          if (resolved) return;
          console.log('[INJ Pass SDK] TX BroadcastChannel message:', {
            type: event.data.type,
            requestId: event.data.requestId,
            expectedRequestId: requestId,
            txHash: event.data.txHash,
            error: event.data.error,
          });
          if (event.data.type === 'TX_RESPONSE' && event.data.requestId === requestId) {
            resolved = true;
            cleanup();
            if (event.data.error) {
              console.error('[INJ Pass SDK] TX BroadcastChannel rejected:', event.data.error);
              reject(new Error(event.data.error));
            } else {
              console.log('[INJ Pass SDK] TX BroadcastChannel resolved with hash:', event.data.txHash);
              resolve(event.data.txHash as string);
            }
          }
        };
      } catch {
        // BroadcastChannel not supported — rely on postMessage only
        bc = {} as BroadcastChannel;
      }

      window.addEventListener('message', handler);

      this.iframe.contentWindow?.postMessage({
        type: 'INJPASS_TX_REQUEST',
        data: {
          id: requestId,
          tx,
        },
      }, this.targetOrigin);
    });
  }
}

export type { InjPassSigner };
