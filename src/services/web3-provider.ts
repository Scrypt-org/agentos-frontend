/**
 * Web3 Provider for AgentOS
 * Injects Web3 provider into DApp iframes
 */

import { Address } from 'viem';

export interface Web3Provider {
  isInjPass: boolean;
  isMetaMask: boolean; // For compatibility
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

export interface Web3ProviderConfig {
  address: Address;
  chainId: number;
  onSignTransaction?: (tx: any) => Promise<string>;
  onSignMessage?: (message: string) => Promise<string>;
  onSwitchChain?: (chainId: number) => Promise<void>;
}

/**
 * Create Web3 Provider for injecting into DApp iframe
 */
export function createWeb3Provider(config: Web3ProviderConfig): Web3Provider {
  const eventListeners = new Map<string, Set<(...args: any[]) => void>>();

  const provider: Web3Provider = {
    isInjPass: true,
    isMetaMask: true, // For compatibility with DApps checking for MetaMask

    request: async ({ method, params = [] }) => {
      console.log('[Web3Provider] Request:', method, params);

      switch (method) {
        // Account methods
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [config.address];

        case 'eth_chainId':
          return `0x${config.chainId.toString(16)}`;

        case 'net_version':
          return config.chainId.toString();

        // Balance
        case 'eth_getBalance':
          // TODO: Implement actual balance fetching
          return '0x0';

        // Transaction methods
        case 'eth_sendTransaction':
          if (config.onSignTransaction) {
            const tx = params[0];
            const hash = await config.onSignTransaction(tx);
            return hash;
          }
          throw new Error('Transaction signing not configured');

        case 'eth_signTransaction':
          if (config.onSignTransaction) {
            const tx = params[0];
            const hash = await config.onSignTransaction(tx);
            return hash;
          }
          throw new Error('Transaction signing not configured');

        // Signing methods
        case 'personal_sign':
        case 'eth_sign':
          if (config.onSignMessage) {
            const message = params[0];
            const signature = await config.onSignMessage(message);
            return signature;
          }
          throw new Error('Message signing not configured');

        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
          if (config.onSignMessage) {
            const data = params[1] || params[0];
            const signature = await config.onSignMessage(JSON.stringify(data));
            return signature;
          }
          throw new Error('Typed data signing not configured');

        // Chain switching
        case 'wallet_switchEthereumChain':
          if (config.onSwitchChain) {
            const chainId = parseInt(params[0].chainId, 16);
            await config.onSwitchChain(chainId);
            return null;
          }
          throw new Error('Chain switching not supported');

        case 'wallet_addEthereumChain':
          // For now, we don't support adding new chains
          throw new Error('Adding chains not supported');

        // Read-only methods (pass through to RPC)
        case 'eth_blockNumber':
        case 'eth_getBlockByNumber':
        case 'eth_getBlockByHash':
        case 'eth_getTransactionByHash':
        case 'eth_getTransactionReceipt':
        case 'eth_call':
        case 'eth_estimateGas':
        case 'eth_gasPrice':
          // TODO: Implement RPC passthrough
          throw new Error(`Method ${method} not yet implemented`);

        default:
          throw new Error(`Method ${method} not supported`);
      }
    },

    on: (event: string, handler: (...args: any[]) => void) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      eventListeners.get(event)!.add(handler);
    },

    removeListener: (event: string, handler: (...args: any[]) => void) => {
      const listeners = eventListeners.get(event);
      if (listeners) {
        listeners.delete(handler);
      }
    },
  };

  return provider;
}

/**
 * Inject Web3 Provider into iframe
 */
export function injectWeb3Provider(iframe: HTMLIFrameElement, provider: Web3Provider) {
  if (!iframe.contentWindow) {
    console.error('[Web3Provider] Cannot inject: iframe has no contentWindow');
    return;
  }

  try {
    // Wait for iframe to load
    iframe.addEventListener('load', () => {
      if (!iframe.contentWindow) return;

      // Inject provider into iframe's window
      const script = iframe.contentDocument?.createElement('script');
      if (!script) return;

      script.textContent = `
        (function() {
          // Create provider object
          const provider = {
            isInjPass: true,
            isMetaMask: true,
            request: async (args) => {
              return window.parent.postMessage({
                type: 'injpass_rpc_request',
                id: Date.now(),
                method: args.method,
                params: args.params || []
              }, '*');
            },
            on: (event, handler) => {
              window.addEventListener('injpass_' + event, (e) => handler(e.detail));
            },
            removeListener: (event, handler) => {
              window.removeEventListener('injpass_' + event, (e) => handler(e.detail));
            }
          };

          // Inject as ethereum provider
          window.ethereum = provider;
          
          // Dispatch event to notify DApp
          window.dispatchEvent(new Event('ethereum#initialized'));
        })();
      `;

      iframe.contentDocument?.head.appendChild(script);
      console.log('[Web3Provider] Injected into iframe');
    });

    // Listen for RPC requests from iframe
    window.addEventListener('message', async (event) => {
      if (event.data?.type === 'injpass_rpc_request') {
        try {
          const result = await provider.request({
            method: event.data.method,
            params: event.data.params,
          });

          // Send response back to iframe
          iframe.contentWindow?.postMessage({
            type: 'injpass_rpc_response',
            id: event.data.id,
            result,
          }, '*');
        } catch (error) {
          // Send error back to iframe
          iframe.contentWindow?.postMessage({
            type: 'injpass_rpc_response',
            id: event.data.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, '*');
        }
      }
    });
  } catch (error) {
    console.error('[Web3Provider] Failed to inject:', error);
  }
}
