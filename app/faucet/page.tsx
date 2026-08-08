'use client';

/**
 * Testnet Faucet Page
 *
 * @author Alex <jsxj81@163.com>
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import Image from 'next/image';

interface NetworkBalance {
  id: string;
  symbol: string;
  chainName: string;
  amount: string;
  balance: string;
  color: string;
  isBase: boolean;
}

interface ClaimResult {
  injTxHash: string;
  ethTxHash: string | null;
  injExplorerUrl: string;
  ethExplorerUrl: string | null;
}

type PageState = 'loading-balances' | 'idle' | 'claiming' | 'success' | 'error';

const CHAIN_LOGO: Record<string, string> = {
  monad: '/injswap.png',
};

export default function FaucetPage() {
  const router = useRouter();
  const { address, isCheckingSession } = useWallet();
  const [isEmbedded] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('embed') === '1';
  });

  const [balances, setBalances] = useState<NetworkBalance[]>([]);
  const [selectedCompanion, setSelectedCompanion] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading-balances');
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isCheckingSession) return;
    fetchBalances();
  }, [isCheckingSession]);

  const fetchBalances = async () => {
    setPageState('loading-balances');
    try {
      const res = await fetch('/api/faucet/balance');
      const data = await res.json();
      if (data.balances) setBalances(data.balances);
    } catch {
      /* degrade gracefully */
    } finally {
      setPageState('idle');
    }
  };

  const handleClaim = async () => {
    if (!address) {
      setErrorMsg('Set up or sign in to INJ Pass first so the faucet knows where to send testnet assets.');
      setPageState('error');
      return;
    }
    setPageState('claiming');
    setErrorMsg('');
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, companion: selectedCompanion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Claim failed');
      setClaimResult(data);
      setPageState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setPageState('error');
    }
  };

  const injBalance = balances.find((b) => b.isBase);
  const loadingBals = pageState === 'loading-balances';
  const canClaim = !!address && pageState !== 'claiming' && pageState !== 'loading-balances';

  if (isCheckingSession) {
    return (
      <div className={`${isEmbedded ? 'h-full' : 'min-h-screen'} bg-black flex items-center justify-center`}>
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`${isEmbedded ? 'h-full overflow-y-auto' : 'min-h-screen pb-24 md:pb-8'} bg-black text-white`}>
      {!isEmbedded && (
        <div className="bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex-shrink-0"
                aria-label="Go back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 flex-shrink-0">
                <Image src="/lambdalogo.png" alt="Logo" width={32} height={32} className="w-full h-full object-contain" />
              </div>

              <div>
                <h1 className="text-sm font-bold">Testnet Faucet</h1>
                <p className="text-xs text-gray-400">1 claim per account per day</p>
              </div>
            </div>
          </div>
        </div>
      )}

        <div className={`${isEmbedded ? 'px-4 py-4' : 'max-w-7xl mx-auto px-4 pt-6 pb-6'}`}>
        {!address && (
          <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-amber-200">Wallet required</div>
              <div className="mt-1 text-xs leading-relaxed text-amber-100/80">
                The faucet page can open directly, but claiming still needs an INJ Pass wallet address on this device.
              </div>
            </div>
          </div>
        )}

        {/* Info banner */}
        <div className="rounded-2xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 flex gap-3 items-start mb-6">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
          </svg>
          <p className="text-xs text-violet-300 leading-relaxed">
            Sends testnet MON on Monad Testnet to your wallet.
          </p>
        </div>

        {/* ── MON — always included ── */}
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Always included
        </div>

        <div className="w-full flex items-center gap-4 p-4 rounded-2xl bg-violet-600/15 border border-violet-500/50 mb-6">
          {/* Radio — always checked */}
          <div className="w-5 h-5 rounded-full border-2 bg-violet-600 border-violet-400 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          {/* Logo */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 bg-white/5">
            <Image src={CHAIN_LOGO.monad} alt="MON" width={40} height={40} className="w-full h-full object-contain" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm mb-0.5">MON</div>
            <div className="text-xs text-gray-500">Monad Testnet · 0.5 MON</div>
          </div>

          {/* Inventory */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-500 mb-0.5">Inventory</div>
            {loadingBals ? (
              <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
            ) : (
              <div className="font-mono text-sm font-semibold">
                {injBalance ? Number(injBalance.balance).toFixed(4) : '—'} MON
              </div>
            )}
          </div>
        </div>

        {/* ── Summary ── */}
        <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3 mb-6">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-sm text-gray-300">
            You will receive <span className="text-white font-semibold">0.5 MON</span>
          </span>
        </div>

        {/* ── Error ── */}
        {pageState === 'error' && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex gap-3 items-start mb-6">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
            </svg>
            <p className="text-sm text-red-300">{errorMsg}</p>
          </div>
        )}

        {/* ── Success ── */}
        {pageState === 'success' && claimResult && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5 space-y-3 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="font-bold text-emerald-400">Tokens sent!</span>
            </div>
            <TxRow label="MON Transaction" hash={claimResult.injTxHash} url={claimResult.injExplorerUrl} />
            {claimResult.ethTxHash && (
              <TxRow label="ETH Transaction" hash={claimResult.ethTxHash} url={claimResult.ethExplorerUrl!} />
            )}
            <p className="text-xs text-emerald-600/80">
              Tokens may take a few seconds to appear in your wallet.
            </p>
          </div>
        )}

        {/* ── CTA Button ── */}
        {pageState !== 'success' ? (
          <button
            onClick={handleClaim}
            disabled={!canClaim}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2.5 ${
              !canClaim
                ? 'bg-white/10 text-gray-500 cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-100 active:scale-98 shadow-lg shadow-white/5'
            }`}
          >
            {pageState === 'claiming' ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-900 rounded-full animate-spin" />
                Sending tokens…
              </>
            ) : pageState === 'loading-balances' ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                Verifying you are human
              </>
            ) : !address ? (
              'Set Up INJ Pass to Claim'
            ) : (
              'Claim Tokens'
            )}
          </button>
        ) : (
          <button
            onClick={() => router.back()}
            className="w-full py-4 rounded-2xl font-bold text-base bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function TxRow({ label, hash, url }: { label: string; hash: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between group">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-mono text-emerald-400 group-hover:text-emerald-300 underline underline-offset-2 flex items-center gap-1">
        {hash.slice(0, 8)}…{hash.slice(-6)}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </span>
    </a>
  );
}
