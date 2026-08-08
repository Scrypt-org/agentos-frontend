'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { createWeb3Provider, injectWeb3Provider } from '@/services/web3-provider';
import { NETWORK_CONFIG, ACTIVE_NETWORK } from '@/config/network';

interface DAppBrowserProps {
  url: string;
  name: string;
  onClose: () => void;
}

export default function DAppBrowser({ url, name, onClose }: DAppBrowserProps) {
  const { address, privateKey } = useWallet();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);
  const [proxyUrl, setProxyUrl] = useState('');
  const [signing, setSigning] = useState(false);

  // Get proxy URL for iframe-safe loading
  useEffect(() => {
    const fetchProxyUrl = async () => {
      try {
        const backendUrl = NETWORK_CONFIG.backendUrl;
        const response = await fetch(
          `${backendUrl}/api/proxy/iframe-url?url=${encodeURIComponent(url)}`
        );
        const data = await response.json();
        setProxyUrl(data.proxyUrl);
      } catch (error) {
        console.error('[DAppBrowser] Failed to get proxy URL:', error);
        // Fallback to direct URL
        setProxyUrl(url);
      }
    };
    
    fetchProxyUrl();
  }, [url]);

  useEffect(() => {
    if (!iframeRef.current || !address) return;

    // Create Web3 provider
    const provider = createWeb3Provider({
      address: address as `0x${string}`,
      chainId: ACTIVE_NETWORK.chainId,
      onSignTransaction: async (tx) => {
        console.log('[DAppBrowser] Sign transaction request:', tx);
        
        // Show transaction approval modal
        setPendingTransaction(tx);
        setShowTransactionModal(true);
        
        // Wait for user approval
        return new Promise((resolve, reject) => {
          // Store resolve/reject for later use
          (window as any).__pendingTxResolve = resolve;
          (window as any).__pendingTxReject = reject;
        });
      },
      onSignMessage: async (message) => {
        console.log('[DAppBrowser] Sign message request:', message);
        
        if (!privateKey) {
          throw new Error('Private key not available');
        }

        try {
          const backendUrl = NETWORK_CONFIG.backendUrl;
          const response = await fetch(`${backendUrl}/api/web3/sign-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              privateKey: Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
              message,
            }),
          });

          const data = await response.json();
          if (!data.success) {
            throw new Error(data.error || 'Failed to sign message');
          }

          return data.signature;
        } catch (error) {
          console.error('[DAppBrowser] Message signing error:', error);
          throw error;
        }
      },
      onSwitchChain: async (chainId) => {
        console.log('[DAppBrowser] Switch chain request:', chainId);
        if (chainId !== ACTIVE_NETWORK.chainId) {
          throw new Error(`Only ${ACTIVE_NETWORK.name} network is supported`);
        }
      },
    });

    // Inject provider into iframe
    injectWeb3Provider(iframeRef.current, provider);
  }, [address, privateKey]);

  const handleApproveTransaction = async () => {
    if (!pendingTransaction || !privateKey) return;

    setSigning(true);
    try {
      const backendUrl = NETWORK_CONFIG.backendUrl;
      const response = await fetch(`${backendUrl}/api/web3/sign-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
          transaction: pendingTransaction,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to sign transaction');
      }

      // Resolve the promise
      if ((window as any).__pendingTxResolve) {
        (window as any).__pendingTxResolve(data.txHash);
      }

      setShowTransactionModal(false);
      setPendingTransaction(null);
    } catch (error) {
      console.error('[DAppBrowser] Transaction approval error:', error);
      
      // Reject the promise
      if ((window as any).__pendingTxReject) {
        (window as any).__pendingTxReject(error);
      }
    } finally {
      setSigning(false);
    }
  };

  const handleRejectTransaction = () => {
    // Reject the promise
    if ((window as any).__pendingTxReject) {
      (window as any).__pendingTxReject(new Error('User rejected transaction'));
    }

    setShowTransactionModal(false);
    setPendingTransaction(null);
  };

  const handleIframeLoad = () => {
    setLoading(false);
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      setLoading(true);
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleGoBack = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.history.back();
    }
  };

  const handleGoForward = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.history.forward();
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header/Toolbar */}
      <div className="bg-black border-b border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-bold text-white">{name}</h2>
              <p className="text-xs text-gray-400">{currentUrl}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation buttons */}
            <button
              onClick={handleGoBack}
              className="p-2 rounded-xl hover:bg-white/10 transition-all"
              title="Go Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleGoForward}
              className="p-2 rounded-xl hover:bg-white/10 transition-all"
              title="Go Forward"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 rounded-xl hover:bg-white/10 transition-all"
              title="Refresh"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Loading bar */}
        {loading && (
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
      </div>

      {/* iframe container */}
      <div className="flex-1 relative">
        {proxyUrl ? (
          <iframe
            ref={iframeRef}
            src={proxyUrl}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Transaction Approval Modal */}
      {showTransactionModal && pendingTransaction && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white/10 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-white mb-4">Approve Transaction</h3>
            
            <div className="space-y-3 mb-6">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">From</div>
                <div className="text-sm font-mono text-white">{address}</div>
              </div>
              
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">To</div>
                <div className="text-sm font-mono text-white">{pendingTransaction.to}</div>
              </div>
              
              {pendingTransaction.value && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs text-gray-400 mb-1">Value</div>
                  <div className="text-sm font-mono text-white">{pendingTransaction.value} MON</div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRejectTransaction}
                disabled={signing}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleApproveTransaction}
                disabled={signing}
                className="flex-1 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {signing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Signing...
                  </>
                ) : (
                  'Approve'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
