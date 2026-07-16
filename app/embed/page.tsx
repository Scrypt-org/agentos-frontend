'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TrustPillBadge from '@/components/TrustPillBadge';
import WelcomeThemeIconButton from '@/components/WelcomeThemeIconButton';
import { WalletErrorToast } from '@/components/WalletErrorToast';
import { useTheme } from '@/contexts/ThemeContext';
import { triggerWalletConnect, triggerTxRequest, isValidOrigin } from '@/lib/auth-bridge';
import { useWalletErrorToast } from '@/lib/useWalletErrorToast';
import { creditNinja, debitNinja, getNinjaStatus } from '@/services/points';
import { getAuthToken, refreshToken, verifyToken } from '@/services/passkey';

const BALL_SIZE = 58;
const CARD_W = 392;
const CARD_H = 314;
const CONNECT_W = 392;
const CONNECT_H = 620;

function postToParent(message: Record<string, unknown>, targetOrigin: string) {
  if (!targetOrigin) return;
  window.parent.postMessage(message, targetOrigin);
}

function requestResize(width: number, height: number, targetOrigin: string) {
  postToParent(
    {
      type: 'INJPASS_RESIZE',
      width,
      height,
    },
    targetOrigin
  );
}

async function ensureEmbedSession(): Promise<string> {
  const existingToken = getAuthToken();
  if (!existingToken) {
    throw new Error('No active INJ Pass session. Please reconnect.');
  }

  const verified = await verifyToken(existingToken);
  if (verified.valid) {
    return existingToken;
  }

  const refreshed = await refreshToken(existingToken);
  if (!refreshed) {
    throw new Error('INJ Pass session expired. Please reconnect.');
  }

  return refreshed;
}

function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <rect x="4" y="11" width="16" height="9" rx="2.8" />
      <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function FingerprintIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" d="M12 4.5a6.5 6.5 0 00-6.5 6.5" />
      <path strokeLinecap="round" d="M12 4.5a6.5 6.5 0 016.5 6.5" />
      <path strokeLinecap="round" d="M8 11a4 4 0 018 0v2.4" />
      <path strokeLinecap="round" d="M8.2 15.4c.2 2.4-.4 4.1-1.7 5.6" />
      <path strokeLinecap="round" d="M12 8a3 3 0 013 3v4.5c0 2.2-.5 4.1-1.7 5.8" />
      <path strokeLinecap="round" d="M11.2 12.5v3.8c0 1.5-.3 2.8-1.2 4.2" />
      <path strokeLinecap="round" d="M16.8 11.8v1.6c0 3.1-.3 5.3-1.6 7.6" />
    </svg>
  );
}

function MinimizeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" d="M5 12h14" />
    </svg>
  );
}

function DisconnectIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 8l4 4-4 4" />
      <path strokeLinecap="round" d="M19 12H9" />
      <path strokeLinecap="round" d="M13 4H7a2 2 0 00-2 2v12a2 2 0 002 2h6" />
    </svg>
  );
}

function OpenIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14L19 5" />
      <path strokeLinecap="round" d="M19 13v4a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4" />
    </svg>
  );
}

export default function EmbedPage() {
  const { theme } = useTheme();
  const isLightMode = theme === 'light';
  const [{ embeddingOrigin, embeddingOriginError }] = useState(() => {
    if (typeof window === 'undefined') {
      return { embeddingOrigin: '', embeddingOriginError: '' };
    }

    const explicitOrigin = new URLSearchParams(window.location.search).get('appOrigin');
    let referrerOrigin = '';
    try {
      referrerOrigin = document.referrer ? new URL(document.referrer).origin : '';
    } catch {
      return {
        embeddingOrigin: '',
        embeddingOriginError: 'Unable to verify the parent app origin.',
      };
    }

    const isEmbedded = window.parent !== window;
    if (isEmbedded && !referrerOrigin) {
      return {
        embeddingOrigin: '',
        embeddingOriginError: 'The parent app disabled origin information, so INJ Pass cannot connect safely.',
      };
    }

    if (explicitOrigin && referrerOrigin && explicitOrigin !== referrerOrigin) {
      return {
        embeddingOrigin: '',
        embeddingOriginError: 'The requested app origin does not match the page embedding INJ Pass.',
      };
    }

    return {
      embeddingOrigin: referrerOrigin || explicitOrigin || window.location.origin,
      embeddingOriginError: '',
    };
  });

  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState<'passkey' | 'traditional' | null>(null);
  const [loading, setLoading] = useState(false);
  const [authPopup, setAuthPopup] = useState<Window | null>(null);
  const authPopupRef = useRef<Window | null>(null);
  const [hasPendingSign, setHasPendingSign] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const { errorToast, showErrorToast, dismissErrorToast } = useWalletErrorToast();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastReportedSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!connected) {
      requestResize(CONNECT_W, CONNECT_H, embeddingOrigin);
    } else if (minimized) {
      requestResize(BALL_SIZE, BALL_SIZE, embeddingOrigin);
    } else {
      requestResize(CARD_W, CARD_H, embeddingOrigin);
    }
  }, [connected, embeddingOrigin, minimized]);

  useEffect(() => {
    if (typeof window === 'undefined' || minimized) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const measuredHeight = Math.ceil(rect.height);
      const nextWidth = connected ? CARD_W : CONNECT_W;
      const fallbackHeight = connected ? CARD_H : CONNECT_H;
      const nextHeight = Math.max(fallbackHeight, measuredHeight);
      const lastReported = lastReportedSizeRef.current;

      if (
        lastReported
        && Math.abs(lastReported.width - nextWidth) < 2
        && Math.abs(lastReported.height - nextHeight) < 2
      ) {
        return;
      }

      lastReportedSizeRef.current = {
        width: nextWidth,
        height: nextHeight,
      };
      requestResize(nextWidth, nextHeight, embeddingOrigin);
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(node);

    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [address, connected, embeddingOrigin, errorToast, hasPendingSign, loading, minimized, walletName]);

  useEffect(() => {
    if (hasPendingSign && minimized) {
      setMinimized(false);
    }
  }, [hasPendingSign, minimized]);

  useEffect(() => {
    const handleUnload = () => {
      if (authPopup && !authPopup.closed) {
        authPopup.close();
      }
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [authPopup]);

  const expand = useCallback(() => setMinimized(false), []);
  const minimize = useCallback(() => setMinimized(true), []);
  const handleDisconnect = useCallback(() => {
    if (authPopup && !authPopup.closed) {
      authPopup.close();
    }

    const backdrop = document.getElementById('injpass-backdrop');
    if (backdrop) {
      backdrop.remove();
    }

    setAuthPopup(null);
    authPopupRef.current = null;
    setAddress('');
    setWalletName('');
    setWalletType(null);
    setConnected(false);
    setMinimized(false);
    setHasPendingSign(false);
    postToParent({ type: 'INJPASS_DISCONNECTED' }, embeddingOrigin);
  }, [authPopup, embeddingOrigin]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const { type } = event.data;
      const isPopupResponse = type === 'SIGN_RESPONSE' || type === 'TX_RESPONSE';
      const isFromParent = event.source === window.parent && event.origin === embeddingOrigin;
      const isFromAuthPopup = (
        event.source === authPopupRef.current
        && event.origin === window.location.origin
      );
      if (isPopupResponse ? !isFromAuthPopup : !isFromParent) return;

      // Auth popup sends flat: { type, requestId, ... }
      // SDK sends nested: { type, data: { id, ... } }
      // Normalize: prefer event.data.data (SDK), fallback to event.data (popup)
      const data = event.data.data || event.data;
      const postBack = (payload: Record<string, unknown>) => {
        event.source?.postMessage(payload, { targetOrigin: event.origin });
      };

      if (type === 'INJPASS_SIGN_REQUEST') {
        if (!connected) {
          postBack({
            type: 'INJPASS_SIGN_RESPONSE',
            requestId: data.id,
            error: 'Wallet not connected',
          });
          return;
        }

        if (authPopupRef.current && !authPopupRef.current.closed) {
          authPopupRef.current.postMessage(
            {
              type: 'SIGN_REQUEST',
              requestId: data.id,
              message: data.message,
            },
            window.location.origin
          );

          try {
            authPopupRef.current.focus();
          } catch {}

          setHasPendingSign(true);
        } else {
          postBack({
            type: 'INJPASS_SIGN_RESPONSE',
            requestId: data.id,
            error: 'Auth popup is closed. Please reconnect.',
          });
        }
      }

      if (type === 'INJPASS_TX_REQUEST') {
        if (!connected) {
          postBack({
            type: 'INJPASS_TX_RESPONSE',
            requestId: data.id,
            error: 'Wallet not connected',
          });
          return;
        }

        if (authPopupRef.current && !authPopupRef.current.closed) {
          authPopupRef.current.postMessage(
            {
              type: 'TX_REQUEST',
              requestId: data.id,
              tx: data.tx,
            },
            window.location.origin
          );

          try {
            authPopupRef.current.focus();
          } catch {}

          setHasPendingSign(true);
        } else {
          // Popup was closed — auto-open a new one for this transaction
          void (async () => {
            try {
              const { popup } = await triggerTxRequest(data.tx);
              authPopupRef.current = popup;
              setAuthPopup(popup);
              setHasPendingSign(true);
            } catch (err) {
              postBack({
                type: 'INJPASS_TX_RESPONSE',
                requestId: data.id,
                error: err instanceof Error ? err.message : 'Failed to open approval window',
              });
            }
          })();
        }
      }

      if (type === 'INJPASS_GET_NINJA_STATUS') {
        void (async () => {
          try {
            if (!connected) {
              throw new Error('Wallet not connected');
            }

            await ensureEmbedSession();
            const status = await getNinjaStatus();
            postBack({
              type: 'INJPASS_NINJA_STATUS_RESPONSE',
              requestId: data?.id,
              status,
            });
          } catch (error) {
            postBack({
              type: 'INJPASS_NINJA_STATUS_RESPONSE',
              requestId: data?.id,
              error: error instanceof Error ? error.message : 'Failed to fetch NINJA status',
            });
          }
        })();
      }

      if (type === 'INJPASS_CREDIT_NINJA' || type === 'INJPASS_DEBIT_NINJA') {
        void (async () => {
          try {
            if (!connected) {
              throw new Error('Wallet not connected');
            }

            const amount = Number(data?.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
              throw new Error('Invalid NINJA amount');
            }

            await ensureEmbedSession();
            const adjustResult = type === 'INJPASS_CREDIT_NINJA'
              ? await creditNinja(amount, {
                  reason: typeof data?.reason === 'string' ? data.reason : undefined,
                  source: typeof data?.source === 'string' ? data.source : 'embed_sdk',
                })
              : await debitNinja(amount, {
                  reason: typeof data?.reason === 'string' ? data.reason : undefined,
                  source: typeof data?.source === 'string' ? data.source : 'embed_sdk',
                });

            if (!adjustResult.success) {
              throw new Error(adjustResult.error || 'Failed to adjust NINJA');
            }

            postBack({
              type: 'INJPASS_NINJA_ADJUST_RESPONSE',
              requestId: data?.id,
              operation: type === 'INJPASS_CREDIT_NINJA' ? 'credit' : 'debit',
              result: adjustResult,
            });
          } catch (error) {
            postBack({
              type: 'INJPASS_NINJA_ADJUST_RESPONSE',
              requestId: data?.id,
              operation: type === 'INJPASS_CREDIT_NINJA' ? 'credit' : 'debit',
              error: error instanceof Error ? error.message : 'Failed to adjust NINJA',
            });
          }
        })();
      }

      if (type === 'SIGN_RESPONSE') {
        setHasPendingSign(false);
        postToParent(
          {
            type: 'INJPASS_SIGN_RESPONSE',
            requestId: data.requestId,
            signature: data.signature,
            address: data.address,
            error: data.error,
          },
          embeddingOrigin
        );
      }

      if (type === 'TX_RESPONSE') {
        console.log('[INJ Pass /embed] TX_RESPONSE received from popup:', {
          requestId: data.requestId,
          txHash: data.txHash,
          error: data.error,
          rawData: event.data,
        });
        setHasPendingSign(false);
        postToParent(
          {
            type: 'INJPASS_TX_RESPONSE',
            requestId: data.requestId,
            txHash: data.txHash,
            error: data.error,
          },
          embeddingOrigin
        );
        console.log('[INJ Pass /embed] INJPASS_TX_RESPONSE forwarded to parent (dApp)');
      }

      if (type === 'INJPASS_DISCONNECT') {
        handleDisconnect();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [connected, embeddingOrigin, handleDisconnect]);

  const handleConnect = async () => {
    setLoading(true);
    dismissErrorToast(true);

    try {
      if (embeddingOriginError) {
        throw new Error(embeddingOriginError);
      }
      if (!embeddingOrigin || !isValidOrigin(embeddingOrigin)) {
        throw new Error('This app origin is not authorized to connect to INJ Pass.');
      }
      const { address: walletAddress, walletName: nextWalletName, walletType: nextWalletType, popup } =
        await triggerWalletConnect(embeddingOrigin);

      setAddress(walletAddress);
      setWalletName(nextWalletName);
      setWalletType(nextWalletType || null);
      setConnected(true);

      if (popup && !popup.closed) {
        authPopupRef.current = popup;
        setAuthPopup(popup);
      }

      postToParent(
        {
          type: 'INJPASS_CONNECTED',
          address: walletAddress,
          walletName: nextWalletName,
          walletType: nextWalletType,
        },
        embeddingOrigin
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      showErrorToast(errorMsg);
      postToParent({ type: 'INJPASS_ERROR', error: errorMsg }, embeddingOrigin);
    } finally {
      setLoading(false);
    }
  };

  const cardTone = isLightMode
    ? 'border-[#c9d7ec] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,247,252,0.88))] text-[#171b24] shadow-[0_24px_60px_rgba(92,104,126,0.18)]'
    : 'border-white/10 bg-[linear-gradient(180deg,rgba(25,16,33,0.98),rgba(10,8,16,0.99))] text-white shadow-[0_28px_80px_rgba(8,6,13,0.5)]';
  const softSurfaceTone = isLightMode
    ? 'border-[#d5dfee] bg-white/72'
    : 'border-white/10 bg-white/[0.05]';
  const secondaryButtonTone = isLightMode
    ? 'border-[#c9d6ea] bg-white/74 text-[#243043] hover:bg-white'
    : 'border-white/10 bg-white/[0.06] text-white/82 hover:bg-white/[0.1]';
  const brandTextTone = isLightMode ? 'text-[#495468]' : 'text-white/62';

  if (connected && minimized) {
    return (
      <div
        ref={rootRef}
        onClick={expand}
        style={{ width: '100%', maxWidth: BALL_SIZE, height: BALL_SIZE }}
        className="group relative cursor-pointer select-none"
      >
        <div
          className={`absolute inset-0 rounded-full border backdrop-blur-xl transition-all duration-500 ${
            isLightMode
              ? 'border-[#c8d4e8] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(234,239,247,0.88)_60%,rgba(220,227,240,0.8))] shadow-[0_14px_36px_rgba(88,102,129,0.18)]'
              : 'border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),rgba(88,63,134,0.26)_35%,rgba(13,12,22,0.96)_75%)] shadow-[0_16px_44px_rgba(6,5,10,0.5)]'
          }`}
        />
        <div
          className={`absolute inset-[7px] rounded-full border ${
            isLightMode ? 'border-[#d6dff0]' : 'border-white/12'
          }`}
        />
        <div className="relative flex h-full w-full items-center justify-center">
          <LockIcon
            className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 ${
              isLightMode ? 'text-[#4f48df]' : 'text-white'
            }`}
          />
        </div>
        {hasPendingSign ? (
          <>
            <span className="absolute right-0 top-0 block h-3.5 w-3.5 rounded-full bg-amber-400/90 blur-[1px]" />
            <span className="absolute right-[2px] top-[2px] block h-2.5 w-2.5 rounded-full bg-amber-300 animate-pulse" />
          </>
        ) : null}
      </div>
    );
  }

  if (connected && !minimized) {
    return (
      <div
        ref={rootRef}
        style={{ width: '100%', maxWidth: CARD_W, minHeight: CARD_H }}
        className={`relative isolate overflow-hidden rounded-[30px] border backdrop-blur-2xl ${cardTone}`}
      >
        <div
          className={`absolute inset-0 ${
            isLightMode
              ? 'bg-[radial-gradient(circle_at_top_left,rgba(137,111,255,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,108,162,0.1),transparent_40%)]'
              : 'bg-[radial-gradient(circle_at_top_left,rgba(145,93,255,0.2),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,85,155,0.12),transparent_40%)]'
          }`}
        />

        <div className="relative z-10 flex h-full flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`text-[10px] font-medium uppercase tracking-[0.22em] ${brandTextTone}`}>
                INJ Pass Authorization
              </div>
              <h2 className="mt-2 text-[1.05rem] font-semibold tracking-[-0.02em]">
                Session active
              </h2>
              <p className={`mt-1 text-xs leading-5 ${brandTextTone}`}>
                {walletName || 'Secure wallet session'} is ready for requests.
              </p>
            </div>

            <button
              onClick={minimize}
              title="Minimize"
              className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition-all ${secondaryButtonTone}`}
            >
              <MinimizeIcon />
            </button>
          </div>

          <div className={`mt-4 rounded-[24px] border p-3 ${softSurfaceTone}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-[10px] uppercase tracking-[0.2em] ${brandTextTone}`}>
                  Wallet address
                </p>
                <p className="mt-1 font-mono text-[13px]">
                  {address.slice(0, 8)}...{address.slice(-6)}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  hasPendingSign
                    ? isLightMode
                      ? 'border-amber-300 bg-amber-100/90 text-amber-700'
                      : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                    : isLightMode
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-emerald-400/28 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {hasPendingSign ? 'Awaiting approval' : 'Connected'}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <TrustPillBadge label={walletType === 'traditional' ? 'Local Encryption' : 'Passkey Security'} icon="passkey" isLightMode={isLightMode} showActivation activationIndex={0} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.14em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
            <TrustPillBadge label="Sovereign Custody" icon="custody" isLightMode={isLightMode} showActivation activationIndex={1} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.14em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
            <TrustPillBadge label="Agent Session" icon="lock" isLightMode={isLightMode} showActivation activationIndex={2} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.14em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
          </div>

          {hasPendingSign && authPopup && !authPopup.closed ? (
            <button
              onClick={() => {
                try {
                  authPopup.focus();
                } catch {}
              }}
              className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-semibold transition-all ${
                isLightMode
                  ? 'border-amber-300 bg-amber-100/90 text-amber-700 hover:bg-amber-100'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/16'
              }`}
            >
              <LockIcon />
              Review request in secure window
            </button>
          ) : null}

          {!hasPendingSign && authPopup && !authPopup.closed ? (
            <button
              onClick={() => {
                try {
                  authPopup.focus();
                } catch {}
              }}
              className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-semibold transition-all ${secondaryButtonTone}`}
            >
              <OpenIcon />
              Open secure window
            </button>
          ) : null}

          <div className="mt-auto grid grid-cols-2 gap-2.5 pt-4">
            <button
              onClick={handleDisconnect}
              className={`inline-flex items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-semibold transition-all ${secondaryButtonTone}`}
            >
              <DisconnectIcon />
              Disconnect
            </button>
            <button
              onClick={minimize}
              className={`inline-flex items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-semibold transition-all ${
                isLightMode
                  ? 'border-[#c7d6ef] bg-[linear-gradient(180deg,#ffffff_0%,#eff4fb_100%)] text-[#273245] hover:brightness-[1.02]'
                  : 'border-[#cfb5ff]/26 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] text-white hover:bg-white/[0.14]'
              }`}
            >
              <LockIcon />
              Minimize
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      style={{ width: '100%', maxWidth: CONNECT_W, minHeight: CONNECT_H }}
      className={`relative isolate overflow-hidden rounded-[32px] border backdrop-blur-2xl ${cardTone}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
        {errorToast ? (
          <WalletErrorToast
            key={errorToast.id}
            message={errorToast.message}
            isExiting={errorToast.isExiting}
            isLightMode={isLightMode}
          />
        ) : null}
      </div>

      <div
        className={`absolute inset-0 ${
          isLightMode
            ? 'bg-[radial-gradient(circle_at_0%_0%,rgba(146,115,255,0.17),transparent_35%),radial-gradient(circle_at_100%_0%,rgba(255,132,174,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.1),transparent_55%)]'
            : 'bg-[radial-gradient(circle_at_0%_0%,rgba(146,115,255,0.18),transparent_35%),radial-gradient(circle_at_100%_0%,rgba(255,132,174,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_55%)]'
        }`}
      />

      <div className="relative z-10 flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-[10px] font-medium uppercase tracking-[0.22em] ${brandTextTone}`}>
              INJ Pass Authorization
            </div>
            <h2 className="mt-2 text-[1.28rem] font-semibold tracking-[-0.03em]">
              Connect to INJ Pass
            </h2>
            <p className={`mt-2 max-w-[21rem] text-sm leading-6 ${brandTextTone}`}>
              Choose one of your INJ Pass wallets and keep every signature inside
              a secure authorization window.
            </p>
          </div>

          <div className="shrink-0">
            <WelcomeThemeIconButton />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <TrustPillBadge label="Wallet Choice" icon="passkey" isLightMode={isLightMode} showActivation activationIndex={0} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.14em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
          <TrustPillBadge label="Sovereign Custody" icon="custody" isLightMode={isLightMode} showActivation activationIndex={1} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.14em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
          <TrustPillBadge label="Agent Session" icon="lock" isLightMode={isLightMode} showActivation activationIndex={2} className="!gap-1.5 !px-2.5 !py-1 !text-[10px] !font-medium !tracking-[0.14em] !uppercase sm:!px-2.5 sm:!py-1 sm:!text-[10px]" />
        </div>

        <div className={`relative mt-5 overflow-hidden rounded-[24px] border p-4 ${softSurfaceTone}`}>
          <div
            className={`pointer-events-none absolute inset-0 rounded-[24px] border ${
              isLightMode ? 'border-rose-500/28' : 'border-rose-400/26'
            } motion-safe:animate-[passkeyCardBorderGlow_3.8s_cubic-bezier(0.22,1,0.36,1)_infinite]`}
          />
          <span
            className={`pointer-events-none absolute left-0 top-0 h-px w-[42%] ${
              isLightMode
                ? 'bg-[linear-gradient(90deg,transparent,rgba(244,63,94,0.08),rgba(239,68,68,0.9),rgba(244,63,94,0.08),transparent)]'
                : 'bg-[linear-gradient(90deg,transparent,rgba(251,113,133,0.08),rgba(248,113,113,0.9),rgba(251,113,133,0.08),transparent)]'
            } motion-safe:animate-[passkeyCardBorderSweep_4.8s_linear_infinite]`}
          />
          <span
            className={`pointer-events-none absolute bottom-0 right-0 h-px w-[38%] ${
              isLightMode
                ? 'bg-[linear-gradient(90deg,transparent,rgba(244,63,94,0.06),rgba(239,68,68,0.78),rgba(244,63,94,0.06),transparent)]'
                : 'bg-[linear-gradient(90deg,transparent,rgba(251,113,133,0.06),rgba(248,113,113,0.8),rgba(251,113,133,0.06),transparent)]'
            } motion-safe:animate-[passkeyCardBorderSweepReverse_5.6s_linear_infinite]`}
          />

          <div className="relative z-[1] flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border ${
                isLightMode
                  ? 'border-[#d1dcf0] bg-white/80 text-[#4f48df]'
                  : 'border-white/10 bg-white/[0.06] text-white'
              }`}
            >
              <LockIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[-0.01em]">
                Choose your INJ Pass wallet
              </p>
              <p className={`mt-1 text-xs leading-5 ${brandTextTone}`}>
                Select a Passkey or traditional wallet. INJ Gift receives only
                the address and approved results.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-[22px] border px-4 py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
            isLightMode
              ? 'border-[#cfd9ec] bg-[linear-gradient(180deg,#ffffff_0%,#f0f5fc_100%)] text-[#243043] hover:brightness-[1.02]'
              : 'border-[#d1b6ff]/26 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.07))] text-white hover:bg-white/[0.15]'
          }`}
        >
          {loading ? (
            <>
              <svg
                className="h-[18px] w-[18px] animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  className="opacity-25"
                />
                <path
                  d="M21 12a9 9 0 00-9-9"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <FingerprintIcon className="h-[18px] w-[18px]" />
              Choose wallet
            </>
          )}
        </button>

        <p className={`mt-3 text-center text-[11px] leading-5 ${brandTextTone}`}>
          The connector mirrors your current INJ Pass day or night theme automatically.
        </p>
      </div>
    </div>
  );
}
