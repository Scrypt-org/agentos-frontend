'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatEther, type Address, type Hash } from 'viem';

import { useTheme } from '@/contexts/ThemeContext';
import {
  getCatCollectionInfo,
  getCatNFTDetails,
  getCatNFTsForOwner,
  type CatCollectionInfo,
  type CatNFT,
} from '@/services/catnft';
import {
  getInitialEricMferLanguage,
  waitForMintedCatNFT,
} from '@/services/eric-mfer-mint';
import {
  InjPassMiniAppConnector,
  type InjPassMiniAppSession,
} from '../../../packages/injpass-connector/src/miniapp';

interface MintResponse {
  hash: Hash;
  tokenId: string | null;
  gasSponsored?: boolean;
  sponsoredWei?: string;
  sponsorshipTxHash?: Hash;
  recordSynced?: boolean;
  recordSyncWarning?: string;
}

interface MintCelebration {
  result: MintResponse;
  nft: CatNFT | null;
  timedOut: boolean;
}

type MintPhase = 'idle' | 'submitting' | 'discovering' | 'complete' | 'partial' | 'failed';

type EricMferLanguage = 'en' | 'de' | 'fr' | 'ko' | 'ja' | 'zh-Hans' | 'zh-Hant';

interface CollectionStatusCopy {
  supply: string;
  remaining: string;
  wallet: string;
  networkFee: string;
  readingChain: string;
  unavailable: string;
  notConnected: string;
  sponsored: string;
}

const collectionStatusCopy: Record<EricMferLanguage, CollectionStatusCopy> = {
  en: {
    supply: 'Supply',
    remaining: 'Remaining to mint',
    wallet: 'Wallet',
    networkFee: 'Network fee',
    readingChain: 'Reading chain',
    unavailable: 'Unavailable',
    notConnected: 'Not connected',
    sponsored: 'Sponsored by INJ Pass',
  },
  de: {
    supply: 'Angebot',
    remaining: 'Noch mintbar',
    wallet: 'Wallet',
    networkFee: 'Netzwerkgebühr',
    readingChain: 'Blockchain wird gelesen',
    unavailable: 'Nicht verfügbar',
    notConnected: 'Nicht verbunden',
    sponsored: 'Von INJ Pass gesponsert',
  },
  fr: {
    supply: 'Offre',
    remaining: 'Mints restants',
    wallet: 'Wallet',
    networkFee: 'Frais réseau',
    readingChain: 'Lecture de la blockchain',
    unavailable: 'Indisponible',
    notConnected: 'Non connecté',
    sponsored: 'Sponsorisé par INJ Pass',
  },
  ko: {
    supply: '공급량',
    remaining: '남은 민팅 수량',
    wallet: '지갑',
    networkFee: '네트워크 수수료',
    readingChain: '체인 조회 중',
    unavailable: '사용할 수 없음',
    notConnected: '연결되지 않음',
    sponsored: 'INJ Pass 지원',
  },
  ja: {
    supply: '発行数',
    remaining: 'ミント残数',
    wallet: 'ウォレット',
    networkFee: 'ネットワーク手数料',
    readingChain: 'チェーンを確認中',
    unavailable: '利用できません',
    notConnected: '未接続',
    sponsored: 'INJ Pass が負担',
  },
  'zh-Hans': {
    supply: '已 Mint',
    remaining: '剩余可 Mint',
    wallet: '钱包',
    networkFee: '网络费',
    readingChain: '正在读取链上数据',
    unavailable: '暂不可用',
    notConnected: '未连接',
    sponsored: '由 INJ Pass 赞助',
  },
  'zh-Hant': {
    supply: '已 Mint',
    remaining: '剩餘可 Mint',
    wallet: '錢包',
    networkFee: '網路費',
    readingChain: '正在讀取鏈上資料',
    unavailable: '暫不可用',
    notConnected: '未連接',
    sponsored: '由 INJ Pass 贊助',
  },
};

function normalizeLanguage(value?: string | null): EricMferLanguage {
  if (value === 'zh-Hans' || value === 'zh-Hant') return value;
  if (value === 'de' || value === 'fr' || value === 'ko' || value === 'ja') return value;
  if (value?.toLowerCase().startsWith('zh')) return 'zh-Hans';
  return 'en';
}

function readBrowserLanguage(): EricMferLanguage {
  const stored = window.localStorage.getItem('injpass_language');
  if (stored) return normalizeLanguage(stored);
  return normalizeLanguage(window.navigator.language);
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Mint failed. Please try again.';
  if (/insufficient mint credits|complimentary mint|already.*mint|only one eric mfer/i.test(message)) {
    return 'This INJ Pass account has already minted its eric mfer.';
  }
  if (/unlock|locked/i.test(message)) {
    return 'Unlock this INJ Pass wallet to approve the mint.';
  }
  return message;
}

function formatTokenNumber(tokenId?: string | null) {
  if (!tokenId) return '--';
  return `#${tokenId.padStart(3, '0')}`;
}

function getRarity(nft?: CatNFT | null) {
  const rarity = nft?.metadata?.attributes?.find((attribute) =>
    /rarity|tier|rank/i.test(attribute.trait_type),
  )?.value;
  if (rarity === undefined || rarity === null || rarity === '') return 'Normal';
  const value = String(rarity);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function EricMferMiniAppPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const connectorRef = useRef<InjPassMiniAppConnector | null>(null);
  const [session, setSession] = useState<InjPassMiniAppSession | null>(null);
  const [collection, setCollection] = useState<CatCollectionInfo | null>(null);
  const [ownedNFTs, setOwnedNFTs] = useState<CatNFT[]>([]);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [loadingCollection, setLoadingCollection] = useState(true);
  const [mintPhase, setMintPhase] = useState<MintPhase>('idle');
  const [mintResult, setMintResult] = useState<MintResponse | null>(null);
  const [mintCelebration, setMintCelebration] = useState<MintCelebration | null>(null);
  const [notice, setNotice] = useState('');
  const [localLanguage, setLocalLanguage] = useState<EricMferLanguage>(getInitialEricMferLanguage);
  const minting = mintPhase === 'submitting' || mintPhase === 'discovering';

  const refreshCollection = useCallback(async (owner?: string | null) => {
    setLoadingCollection(true);
    try {
      const [nextCollection, nextOwned] = await Promise.all([
        getCatCollectionInfo(),
        owner ? getCatNFTsForOwner(owner as Address) : Promise.resolve([]),
      ]);
      setCollection(nextCollection);
      setOwnedNFTs(nextOwned);
      return { collection: nextCollection, ownedNFTs: nextOwned };
    } catch (error) {
      setNotice(friendlyError(error));
      return null;
    } finally {
      setLoadingCollection(false);
    }
  }, []);

  useEffect(() => {
    setLocalLanguage(readBrowserLanguage());
  }, []);

  useEffect(() => {
    document.title = 'eric mfer · Genesis Mint';
    const embedded = InjPassMiniAppConnector.isEmbedded();
    setIsEmbedded(embedded);
    if (!embedded) {
      void refreshCollection();
      return;
    }

    const connector = new InjPassMiniAppConnector({ timeoutMs: 180_000 });
    connectorRef.current = connector;
    const unsubscribe = connector.onSession((nextSession) => {
      setSession(nextSession);
      void refreshCollection(nextSession.address);
    });
    void connector.waitForSession().catch((error) => setNotice(friendlyError(error)));

    return () => {
      unsubscribe();
      connector.destroy();
      connectorRef.current = null;
    };
  }, [refreshCollection]);

  const handleMint = async () => {
    const connector = connectorRef.current;
    if (!connector) {
      setNotice('Open eric mfer from INJ Pass Apps to mint with your wallet.');
      return;
    }
    if (!session?.authenticated || !session.address) {
      setNotice('Choose an INJ Pass wallet, then return here to mint.');
      await connector.requestLogin();
      return;
    }

    setMintPhase('submitting');
    setNotice('INJ Pass is sponsoring gas and preparing your mint.');
    setMintResult(null);
    setMintCelebration(null);
    try {
      const result = await connector.getEthereumProvider().request({
        method: 'injpass_mintCatNft',
        params: [],
      }) as MintResponse;
      setMintResult(result);
      setMintPhase('discovering');
      setNotice('Transaction confirmed. Waiting for your NFT artwork and ownership record.');

      const discovery = result.tokenId
        ? await waitForMintedCatNFT({
            tokenId: result.tokenId,
            owner: session.address as Address,
            loadDetails: getCatNFTDetails,
            loadOwned: getCatNFTsForOwner,
          })
        : { nft: null, ownedNFTs: [], timedOut: true };

      setOwnedNFTs(discovery.ownedNFTs);
      const nextCollection = await getCatCollectionInfo().catch(() => null);
      if (nextCollection) setCollection(nextCollection);

      const syncWarning = result.recordSyncWarning ? ` ${result.recordSyncWarning}` : '';
      if (discovery.timedOut) {
        setMintPhase('partial');
        setNotice(`Mint confirmed. The NFT artwork is still synchronizing; use the transaction link as proof.${syncWarning}`);
      } else {
        setMintPhase('complete');
        setNotice(`${result.gasSponsored ? 'Mint complete. INJ Pass sponsored the network fee.' : 'Mint complete.'}${syncWarning}`);
      }
      setMintCelebration({ result, nft: discovery.nft, timedOut: discovery.timedOut });
    } catch (error) {
      setMintPhase('failed');
      setNotice(friendlyError(error));
    }
  };

  const previewNFT = ownedNFTs[0];
  const language = normalizeLanguage(session?.language || localLanguage);
  const statusCopy = collectionStatusCopy[language];
  const supply = collection
    ? `${collection.totalMinted} / ${collection.maxSupply}`
    : loadingCollection ? statusCopy.readingChain : statusCopy.unavailable;
  const remainingSupply = collection
    ? `${Math.max(0, collection.maxSupply - collection.totalMinted)}/${collection.maxSupply}`
    : loadingCollection ? statusCopy.readingChain : statusCopy.unavailable;
  const mintButtonLabel = minting
    ? 'Minting...'
    : !session?.authenticated
      ? 'Connect INJ Pass'
      : ownedNFTs.length > 0
        ? 'Mint another'
        : 'Mint with sponsored gas';

  return (
    <main className={isLight ? 'min-h-screen bg-[#f5f2fb] text-[#161319]' : 'min-h-screen bg-[#0d0b10] text-white'}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(340px,0.9fr)_minmax(440px,1.1fr)]">
        <section className={isLight ? 'relative min-h-[46vh] overflow-hidden bg-[#ded4f3]' : 'relative min-h-[46vh] overflow-hidden bg-[#21182d]'}>
          <Image
            src={previewNFT?.image || '/eric-mfer.png'}
            alt={previewNFT?.name || 'eric mfer'}
            fill
            priority
            unoptimized={Boolean(previewNFT?.image)}
            sizes="(max-width: 1024px) 100vw, 46vw"
            className="object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-white">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/62">CC0 tribute collection</div>
              <div className="mt-1 text-2xl font-semibold">{previewNFT?.name || 'eric mfer'}</div>
            </div>
            {previewNFT && <div className="font-mono text-sm text-white/72">#{previewNFT.tokenId}</div>}
          </div>
        </section>

        <section className="flex min-h-[54vh] flex-col justify-between px-6 py-7 sm:px-10 sm:py-10 lg:px-14">
          <div>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-[1.05] sm:text-5xl">Mint an eric mfer collectible.</h1>
            <p className={isLight ? 'mt-5 max-w-lg text-sm leading-7 text-black/58' : 'mt-5 max-w-lg text-sm leading-7 text-white/58'}>
              One complimentary mint is available per INJ Pass wallet. The artwork and ownership record are stored through the collection contract.
            </p>

            <dl className={isLight ? 'mt-10 divide-y divide-black/8 border-y border-black/8' : 'mt-10 divide-y divide-white/9 border-y border-white/9'}>
              <div className="flex items-center justify-between gap-4 py-4 text-sm">
                <dt className={isLight ? 'text-black/48' : 'text-white/48'}>{statusCopy.supply}</dt>
                <dd className="font-mono font-semibold">{supply}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4 text-sm">
                <dt className={isLight ? 'text-black/48' : 'text-white/48'}>{statusCopy.remaining}</dt>
                <dd className="font-mono font-semibold">{remainingSupply}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4 text-sm">
                <dt className={isLight ? 'text-black/48' : 'text-white/48'}>{statusCopy.wallet}</dt>
                <dd className="font-mono font-semibold">{session?.address ? shortAddress(session.address) : statusCopy.notConnected}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4 text-sm">
                <dt className={isLight ? 'text-black/48' : 'text-white/48'}>{statusCopy.networkFee}</dt>
                <dd className="font-semibold text-emerald-500">{statusCopy.sponsored}</dd>
              </div>
            </dl>
          </div>

          <div className="pt-10">
            {notice && (
              <div className={isLight ? 'mb-4 text-sm leading-6 text-black/62' : 'mb-4 text-sm leading-6 text-white/62'}>
                {notice}
              </div>
            )}
            {mintResult?.hash && (
              <a
                href={`https://blockscout.injective.network/tx/${mintResult.hash}`}
                target="_blank"
                rel="noreferrer"
                className="mb-4 block truncate text-xs font-semibold text-violet-500 underline underline-offset-4"
              >
                Transaction {shortAddress(mintResult.hash)}
              </a>
            )}
            <button
              type="button"
              onClick={() => void handleMint()}
              disabled={minting || !isEmbedded}
              className={isLight
                ? 'h-12 w-full bg-[#17131b] px-5 text-sm font-semibold text-white transition hover:bg-[#30263b] disabled:cursor-not-allowed disabled:opacity-45'
                : 'h-12 w-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45'}
            >
              {mintButtonLabel}
            </button>
            {mintResult?.sponsoredWei && (
              <div className={isLight ? 'mt-3 text-center text-[11px] text-black/38' : 'mt-3 text-center text-[11px] text-white/38'}>
                Sponsored {Number(formatEther(BigInt(mintResult.sponsoredWei))).toFixed(8)} INJ for this mint
              </div>
            )}
          </div>
        </section>
      </div>

      {mintCelebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
          <button
            type="button"
            className="absolute inset-0 bg-black/68 backdrop-blur-md"
            onClick={() => setMintCelebration(null)}
            aria-label="Close mint result"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mint-congratulations-title"
            className={isLight
              ? 'relative z-10 w-full max-w-lg rounded-lg border border-black/10 bg-[#fbfafc] p-6 text-center shadow-[0_28px_90px_rgba(28,18,40,0.28)] motion-safe:animate-[injFadeUp_420ms_cubic-bezier(0.22,1,0.36,1)_both] sm:p-8'
              : 'relative z-10 w-full max-w-lg rounded-lg border border-white/12 bg-[#151219] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.62)] motion-safe:animate-[injFadeUp_420ms_cubic-bezier(0.22,1,0.36,1)_both] sm:p-8'}
          >
            <div className={isLight ? 'text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700' : 'text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300'}>
              {mintCelebration.timedOut ? 'Mint confirmed' : 'Mint complete'}
            </div>
            <h2 id="mint-congratulations-title" className="mt-3 text-3xl font-semibold">Congratulations</h2>
            <p className={isLight ? 'mt-2 text-sm text-black/52' : 'mt-2 text-sm text-white/52'}>
              {mintCelebration.timedOut
                ? 'Ownership is confirmed on-chain. The NFT artwork is still synchronizing.'
                : 'This eric mfer now belongs to your INJ Pass wallet.'}
            </p>

            <div className={isLight ? 'mx-auto mt-6 w-full max-w-[280px] rounded-lg border border-black/8 bg-white p-3' : 'mx-auto mt-6 w-full max-w-[280px] rounded-lg border border-white/10 bg-white/[0.035] p-3'}>
              <div className="relative aspect-square overflow-hidden rounded-md bg-[#ded4f3]">
                <Image
                  src={mintCelebration.nft?.image || '/eric-mfer.png'}
                  alt={mintCelebration.nft?.name || 'Minted eric mfer'}
                  fill
                  unoptimized={Boolean(mintCelebration.nft?.image)}
                  sizes="280px"
                  className="object-cover"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-left">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{mintCelebration.nft?.name || 'eric mfer'}</div>
                  <div className={isLight ? 'mt-0.5 text-xs text-black/42' : 'mt-0.5 text-xs text-white/42'}>Rarity · {getRarity(mintCelebration.nft)}</div>
                </div>
                <div className={isLight ? 'shrink-0 rounded-md bg-black px-2.5 py-1.5 font-mono text-xs font-bold text-white' : 'shrink-0 rounded-md bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-black'}>
                  {formatTokenNumber(mintCelebration.result.tokenId)}
                </div>
              </div>
            </div>

            <a
              href={`https://blockscout.injective.network/tx/${mintCelebration.result.hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block font-mono text-xs font-semibold text-violet-500 underline underline-offset-4"
            >
              Transaction {shortAddress(mintCelebration.result.hash)}
            </a>
            {mintCelebration.result.recordSyncWarning && (
              <p className={isLight ? 'mt-3 text-xs leading-5 text-amber-700' : 'mt-3 text-xs leading-5 text-amber-300'}>
                {mintCelebration.result.recordSyncWarning}
              </p>
            )}
            <button
              type="button"
              onClick={() => setMintCelebration(null)}
              className={isLight
                ? 'mt-6 h-11 w-full rounded-md bg-black text-sm font-bold text-white transition hover:bg-black/82'
                : 'mt-6 h-11 w-full rounded-md bg-white text-sm font-bold text-black transition hover:bg-violet-100'}
            >
              Close
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
