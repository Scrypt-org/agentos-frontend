'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePin } from '@/contexts/PinContext';
import { useWallet } from '@/contexts/WalletContext';
import { estimateGas, getCosmosTxHistory, getTxHistory, sendTransaction, waitForTransaction } from '@/wallet/chain';
import { getBalance as getNinjaBalanceFromBackend } from '@/services/points';
import { GasEstimate, INJECTIVE_MAINNET } from '@/types/chain';
import { ACTIVE_NETWORK } from '@/config/network';
import { getTokenPrices } from '@/services/price';
import { executeSwap, getSwapQuote, ROUTER_ADDRESS } from '@/services/dex-swap';
import { startQRScanner, stopQRScanner, clearQRScanner, isCameraSupported, isValidAddress } from '@/services/qr-scanner';
import { isNFCSupported, readNFCCard, type NFCCardData } from '@/services/nfc';
import { getN1NJ4NFTs, type NFT } from '@/services/nft';
import { getUserStakingInfo, type StakingInfo } from '@/services/staking';
import { QRCodeSVG } from 'qrcode.react';
import { createPublicClient, formatEther, formatUnits, http, type Address } from 'viem';
import Image from 'next/image';
import NFTDetailModal from '@/components/NFTDetailModal';
import TransactionAuthModal from '@/components/TransactionAuthModal';
import WelcomeThemeIconButton from '@/components/WelcomeThemeIconButton';
import { LegacyWalletBanner } from '@/components/LegacyWalletBanner';
import NinjaMinerGame from '@/components/NinjaMinerGame';
import EditableAccountIdentity from '@/components/EditableAccountIdentity';
import { useTheme } from '@/contexts/ThemeContext';
import { TOKENS_MAINNET, TOKENS_TESTNET } from '@/services/tokens';
import { ERC20_ABI } from '@/services/dex-abi';
import { FAUCET_NETWORKS } from '@/config/faucet';
import SettingsPage from '../settings/page';
import { privateKeyToHex } from '@/utils/wallet';
import { getInjectiveAddress, getEthereumAddress } from '@injectivelabs/sdk-ts';
import { INJECTIVE_TESTNET } from '@/types/chain';
import { encodeFunctionData, keccak256, stringToHex } from 'viem';

type AssetTab = 'tokens' | 'nfts' | 'defi' | 'earn';
type WalletPanel = 'overview' | 'send' | 'receive' | 'swap' | 'history' | 'settings' | 'card' | 'chance';
type AddressType = 'evm' | 'cosmos';
type CardPanelTab = 'pay' | 'cards';
type DashboardTransactionType = 'send' | 'receive' | 'swap';
type DashboardTransactionStatus = 'completed' | 'pending' | 'failed';
type DashboardHistoryFilter = 'all' | DashboardTransactionType;
type DashboardChainType = 'EVM' | 'Cosmos';
type SwapToken = 'INJ' | 'USDT' | 'USDC' | 'LAM';
type BalanceDisplayUnit = 'INJ' | 'USD';
type AssetSurfaceMode = 'assets' | 'ai' | 'faucet';
type WalletNetworkMode = 'mainnet' | 'testnet';
type FaucetCategory = 'popular' | 'others';
type ChancePlanId = 'go' | 'pro' | 'max';

interface BoundCardPreview {
  uid: string;
  name: string;
  isActive: boolean;
  boundAt: Date;
  cardNumber: string;
  cvv: string;
}

const NINJA_BALANCE_EVENT = 'inj-pass:ninja-balance-update';
const NINJA_BALANCE_POLL_MS = 20_000;
const DEFAULT_NINJA_BALANCE = 22;
const LAM_USD_PRICE = 0.01;
const POPULAR_FAUCET_IDS = new Set(['injective', 'sepolia', 'arbitrum', 'base']);

const PLAN_GO_PRICE_WEI_ENV = process.env.NEXT_PUBLIC_PLAN_GO_PRICE_WEI;
const PLAN_PRO_PRICE_WEI_ENV = process.env.NEXT_PUBLIC_PLAN_PRO_PRICE_WEI;
const PLAN_MAX_PRICE_WEI_ENV = process.env.NEXT_PUBLIC_PLAN_MAX_PRICE_WEI;
const CHANCE_CONTRACT_ADDRESS_ENV = process.env.NEXT_PUBLIC_CHANCE_CONTRACT_ADDRESS;

if (!PLAN_GO_PRICE_WEI_ENV || !/^\d+$/.test(PLAN_GO_PRICE_WEI_ENV)) {
  throw new Error('NEXT_PUBLIC_PLAN_GO_PRICE_WEI is required and must be an integer wei string.');
}

if (!PLAN_PRO_PRICE_WEI_ENV || !/^\d+$/.test(PLAN_PRO_PRICE_WEI_ENV)) {
  throw new Error('NEXT_PUBLIC_PLAN_PRO_PRICE_WEI is required and must be an integer wei string.');
}

if (!PLAN_MAX_PRICE_WEI_ENV || !/^\d+$/.test(PLAN_MAX_PRICE_WEI_ENV)) {
  throw new Error('NEXT_PUBLIC_PLAN_MAX_PRICE_WEI is required and must be an integer wei string.');
}

if (!CHANCE_CONTRACT_ADDRESS_ENV || !/^0x[a-fA-F0-9]{40}$/.test(CHANCE_CONTRACT_ADDRESS_ENV)) {
  throw new Error('NEXT_PUBLIC_CHANCE_CONTRACT_ADDRESS is required and must be a valid 0x address.');
}

const MORE_CHANCE_PLANS: Array<{
  id: ChancePlanId;
  planId: number;
  name: string;
  chances: number;
  priceWei: bigint;
  blurb: string;
  accentClass: string;
  surfaceClass: string;
}> = [
  {
    id: 'go',
    planId: 1,
    name: 'Go',
    chances: 3,
    priceWei: BigInt(PLAN_GO_PRICE_WEI_ENV),
    blurb: 'Quick refill for a few extra tap runs.',
    accentClass: 'text-emerald-300',
    surfaceClass: 'border-emerald-400/18 bg-emerald-500/[0.08]',
  },
  {
    id: 'pro',
    planId: 2,
    name: 'Pro',
    chances: 12,
    priceWei: BigInt(PLAN_PRO_PRICE_WEI_ENV),
    blurb: 'Best balance for repeat LAM farming.',
    accentClass: 'text-violet-200',
    surfaceClass: 'border-violet-400/22 bg-violet-500/[0.08]',
  },
  {
    id: 'max',
    planId: 3,
    name: 'Max',
    chances: 30,
    priceWei: BigInt(PLAN_MAX_PRICE_WEI_ENV),
    blurb: 'Longest session pack for power users.',
    accentClass: 'text-amber-200',
    surfaceClass: 'border-amber-400/18 bg-amber-500/[0.08]',
  },
];

const CHANCE_MANAGER_ABI = [
  {
    type: 'function',
    name: 'plans',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint8' }],
    outputs: [
      { name: 'priceWei', type: 'uint256' },
      { name: 'chances', type: 'uint32' },
      { name: 'cooldownSeconds', type: 'uint32' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'chanceCooldownEndsAt',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'buyChance',
    stateMutability: 'payable',
    inputs: [
      { name: 'planId', type: 'uint8' },
      { name: 'clientRef', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;
const CHANCE_PURCHASE_SUBMITTED_EVENT = 'inj-pass:chance-purchase-submitted';

const NETWORK_META: Record<WalletNetworkMode, { label: string; shortLabel: string; chain: typeof INJECTIVE_MAINNET; tokenSet: typeof TOKENS_MAINNET }> = {
  mainnet: {
    label: 'Injective EVM Mainnet',
    shortLabel: 'Mainnet',
    chain: INJECTIVE_MAINNET,
    tokenSet: TOKENS_MAINNET,
  },
  testnet: {
    label: 'Injective EVM Testnet',
    shortLabel: 'Testnet',
    chain: INJECTIVE_TESTNET,
    tokenSet: TOKENS_TESTNET as typeof TOKENS_MAINNET,
  },
};

const CHANCE_CONTRACT_ADDRESS = CHANCE_CONTRACT_ADDRESS_ENV as Address;
const CHANCE_NETWORK_MODE: WalletNetworkMode = ACTIVE_NETWORK.chainId === 1439 ? 'testnet' : 'mainnet';
const CHANCE_NETWORK_META = NETWORK_META[CHANCE_NETWORK_MODE];

const FAUCET_ICON_BY_ID: Record<string, string> = {
  injective: '/injswap.png',
  sepolia: '/eth-logo.png',
  arbitrum: '/arb-logo.png',
  optimism: '/op-logo.png',
  base: '/base-logo.png',
  polygonzkevm: '/polygon-logo.png',
};

interface DashboardTransaction {
  id: string;
  type: DashboardTransactionType;
  amount: string;
  token: string;
  address: string;
  timestamp: Date;
  status: DashboardTransactionStatus;
  txHash?: string;
  chainType: DashboardChainType;
}

function truncateMiddle(value: string, start = 6, end = 4) {
  if (!value) return '';
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatDashboardTimestamp(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFaucetClaimStorageKey(walletAddress?: string) {
  if (!walletAddress) return null;
  return `injpass:faucet-claim:${walletAddress.toLowerCase()}:${new Date().toISOString().split('T')[0]}`;
}

async function getDashboardTokenBalances(userAddress: Address, networkMode: WalletNetworkMode) {
  const networkMeta = NETWORK_META[networkMode];
  const client = createPublicClient({
    transport: http(networkMeta.chain.rpcUrl),
  });

  const nativeBalance = await client.getBalance({ address: userAddress });
  const results: Record<string, string> = {
    INJ: formatUnits(nativeBalance, 18),
    USDC: '0',
    USDT: '0',
  };

  await Promise.all(
    (['USDC', 'USDT'] as const).map(async (symbol) => {
      const tokenInfo = networkMeta.tokenSet[symbol];
      if (!tokenInfo) {
        results[symbol] = '0';
        return;
      }

      try {
        const rawBalance = await client.readContract({
          address: tokenInfo.address as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        }) as bigint;

        results[symbol] = formatUnits(rawBalance, tokenInfo.decimals);
      } catch (error) {
        console.error(`Failed to load ${symbol} balance on ${networkMode}:`, error);
        results[symbol] = '0';
      }
    })
  );

  return results;
}

const ROLLING_DIGIT_STACK = Array.from({ length: 20 }, (_, index) => String(index % 10));

function RollingDigit({ digit, delayMs = 0 }: { digit: string; delayMs?: number }) {
  const isNumeric = /^\d$/.test(digit);
  const hasAnimatedRef = useRef(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!isNumeric) return;

    const nextDigit = Number(digit);

    setPosition((current) => {
      if (!hasAnimatedRef.current) {
        hasAnimatedRef.current = true;
        return nextDigit;
      }

      const currentDigit = ((current % 10) + 10) % 10;
      let nextPosition = current - currentDigit + nextDigit;

      if (nextPosition <= current) {
        nextPosition += 10;
      }

      return nextPosition;
    });
  }, [digit, isNumeric]);

  if (!isNumeric) {
    return (
      <span className="inline-flex h-[1em] items-center justify-center leading-none text-white/70">
        {digit}
      </span>
    );
  }

  return (
    <span className="relative inline-flex h-[1em] min-w-[0.62em] overflow-hidden leading-none tabular-nums">
      <span
        className="flex flex-col will-change-transform transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transform: `translateY(-${position}em)`,
          transitionDelay: `${delayMs}ms`,
        }}
      >
        {ROLLING_DIGIT_STACK.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="flex h-[1em] items-center justify-center leading-none"
          >
            {value}
          </span>
        ))}
      </span>
    </span>
  );
}

function RollingBalanceNumber({ value }: { value: string }) {
  return (
    <span className="inline-flex items-end" aria-label={value}>
      <span className="sr-only">{value}</span>
      <span className="inline-flex items-end" aria-hidden="true">
        {value.split('').map((character, index) => (
          <RollingDigit
            key={`${character}-${index}`}
            digit={character}
            delayMs={index * 45}
          />
        ))}
      </span>
    </span>
  );
}

function buildPixelTrendSeries(currentValue: number, changePct: number) {
  const pointCount = 18;

  if (!Number.isFinite(currentValue) || currentValue <= 0) {
    return Array.from({ length: pointCount }, () => 0);
  }

  const safeFactor = Math.max(0.15, 1 + changePct / 100);
  const startValue = currentValue / safeFactor;
  const drift = currentValue - startValue;
  const waveBase = Math.max(Math.abs(drift) * 0.16, currentValue * 0.018);
  const rippleBase = Math.max(Math.abs(drift) * 0.05, currentValue * 0.008);

  const series = Array.from({ length: pointCount }, (_, index) => {
    const t = index / (pointCount - 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const wave = Math.sin((t * 3.2 + 0.15) * Math.PI) * waveBase * (1 - t * 0.15);
    const ripple = Math.cos((t * 6.4 + 0.2) * Math.PI) * rippleBase;

    return Math.max(0, startValue + drift * eased + wave + ripple);
  });

  series[pointCount - 1] = currentValue;

  return series;
}

function PixelTrendChart({
  values,
  hidden,
  changePct,
  currentValueLabel,
  networkMode,
  replayKey = 0,
}: {
  values: number[];
  hidden: boolean;
  changePct: number;
  currentValueLabel: string;
  networkMode: WalletNetworkMode;
  replayKey?: number;
}) {
  const width = 320;
  const height = 184;
  const paddingLeft = 20;
  const paddingRight = 18;
  const paddingTop = 18;
  const paddingBottom = 30;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const range = maxValue - minValue;
  const accentClass = networkMode === 'testnet' ? 'text-emerald-300' : 'text-amber-300';
  const accentColor = networkMode === 'testnet' ? '#6ee7b7' : '#fbbf24';
  const accentFill = networkMode === 'testnet' ? 'rgba(110,231,183,0.16)' : 'rgba(251,191,36,0.16)';
  const chartAnimationKey = `${hidden ? 'hidden' : 'visible'}-${currentValueLabel}-${changePct.toFixed(2)}-${replayKey}`;
  const gridDots = Array.from({ length: 11 }, (_, column) =>
    Array.from({ length: 6 }, (_, row) => ({
      x: paddingLeft + column * (chartWidth / 10),
      y: paddingTop + row * (chartHeight / 5),
      key: `${column}-${row}`,
    }))
  ).flat();

  const points = values.map((value, index) => {
    const x = paddingLeft + (index / Math.max(values.length - 1, 1)) * chartWidth;
    const normalized = range < 0.0001 ? 0.55 : 1 - (value - minValue) / range;
    const y = paddingTop + normalized * chartHeight;

    return { x, y };
  });

  const stepPath = points
    .map((point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }

      return `H ${point.x} V ${point.y}`;
    })
    .join(' ');

  const areaPath =
    points.length > 0
      ? `${stepPath} V ${paddingTop + chartHeight} H ${points[0].x} Z`
      : '';

  return (
    <div className="relative h-full min-h-[148px] px-1 py-1 sm:min-h-[220px] sm:py-2 xl:pl-4">
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gray-500">24H Trend</div>
          <div className="mt-1 text-xs text-gray-400">Pixel asset movement</div>
        </div>
        <div className={`text-sm font-semibold ${accentClass}`}>
          {changePct >= 0 ? '+' : ''}
          {changePct.toFixed(2)}%
        </div>
      </div>

      {hidden ? (
        <div className="relative mt-2 flex h-[120px] items-center justify-center sm:mt-4 sm:h-[184px]">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-500">Trend Hidden</div>
            <div className="mt-2 text-sm text-gray-400">Unhide balance to view</div>
          </div>
        </div>
      ) : (
        <svg
          key={chartAnimationKey}
          className="relative mt-2 h-[120px] w-full sm:mt-4 sm:h-[184px]"
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          aria-label="24 hour asset movement chart"
        >
          {gridDots.map((dot) => (
            <rect
              key={dot.key}
              x={dot.x - 1.5}
              y={dot.y - 1.5}
              width="3"
              height="3"
              rx="0.5"
              fill="rgba(255,255,255,0.10)"
              shapeRendering="crispEdges"
            />
          ))}
          <path
            d={areaPath}
            fill={accentFill}
            shapeRendering="crispEdges"
            style={{
              opacity: 0,
              animation: 'pixelTrendAreaFade 700ms cubic-bezier(0.22,1,0.36,1) 220ms forwards',
            }}
          />
          <path
            d={stepPath}
            pathLength={1}
            stroke={accentColor}
            strokeWidth="3"
            strokeLinejoin="miter"
            strokeLinecap="square"
            shapeRendering="crispEdges"
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1,
              animation: 'pixelTrendDraw 1100ms cubic-bezier(0.22,1,0.36,1) forwards',
            }}
          />
          {points.map((point, index) => (
            <rect
              key={`point-${index}`}
              x={point.x - 3}
              y={point.y - 3}
              width="6"
              height="6"
              fill={accentColor}
              shapeRendering="crispEdges"
              style={{
                opacity: 0,
                animation: `pixelTrendPointIn 240ms cubic-bezier(0.22,1,0.36,1) ${320 + index * 28}ms forwards`,
              }}
            />
          ))}
        </svg>
      )}

      <div className="relative mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-gray-500">
        <span>Now</span>
        <span className="font-mono text-gray-300">${hidden ? '••••' : currentValueLabel}</span>
      </div>
    </div>
  );
}

function DashboardSurfaceFrame({
  src,
  title,
  className,
  loadingStrategy = 'lazy',
}: {
  src: string;
  title: string;
  className?: string;
  loadingStrategy?: 'lazy' | 'eager';
}) {
  return (
    <iframe
      src={src}
      title={title}
      className={`h-full w-full border-0 ${className ?? 'bg-black'}`}
      loading={loadingStrategy}
    />
  );
}

function DashboardSkeleton({
  isLight,
  statusLabel,
}: {
  isLight: boolean;
  statusLabel: string;
}) {
  return (
    <div className={`min-h-screen ${isLight ? 'bg-[#eef4fb] text-slate-900' : 'bg-black text-white'}`}>
      <div className={`${isLight ? 'border-b border-slate-200/70 bg-white/70' : 'border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent'} backdrop-blur-sm`}>
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-5 flex flex-col gap-4 md:mb-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className={`h-4 w-32 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className={`h-9 w-56 rounded-2xl animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:flex-nowrap">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className={`h-9 w-20 rounded-xl animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
            <div className={`rounded-[28px] border p-5 ${isLight ? 'border-slate-200/70 bg-white/80' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="mb-4 flex items-center justify-between">
                <div className={`h-4 w-24 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                <div className={`h-8 w-24 rounded-full animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
              </div>
              <div className={`h-12 w-48 rounded-2xl animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
              <div className={`mt-3 h-4 w-40 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className={`rounded-2xl border p-4 ${isLight ? 'border-slate-200/70 bg-slate-50/90' : 'border-white/10 bg-white/[0.03]'}`}
                  >
                    <div className={`h-3 w-16 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                    <div className={`mt-3 h-7 w-24 rounded-xl animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-[28px] border p-5 ${isLight ? 'border-slate-200/70 bg-white/80' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="mb-4 flex items-center justify-between">
                <div className={`h-4 w-20 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                <div className={`h-8 w-20 rounded-full animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
              </div>
              <div className="space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${isLight ? 'border-slate-200/70 bg-slate-50/90' : 'border-white/10 bg-white/[0.03]'}`}
                  >
                    <div className={`h-11 w-11 rounded-full animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className={`h-3.5 w-28 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                      <div className={`h-3.5 w-40 rounded-full animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
                    </div>
                    <div className={`h-8 w-14 rounded-xl animate-pulse ${isLight ? 'bg-slate-200/90' : 'bg-white/10'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
            <div className={`rounded-[28px] border p-5 ${isLight ? 'border-slate-200/70 bg-white/80' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className={`mb-4 h-4 w-24 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className={`h-[420px] rounded-[24px] animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/[0.04]'}`} />
            </div>
            <div className={`rounded-[28px] border p-5 ${isLight ? 'border-slate-200/70 bg-white/80' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className={`mb-4 h-4 w-28 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className="space-y-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className={`rounded-2xl border p-4 ${isLight ? 'border-slate-200/70 bg-slate-50/90' : 'border-white/10 bg-white/[0.03]'}`}
                  >
                    <div className={`h-3 w-16 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                    <div className={`mt-3 h-20 rounded-2xl animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/[0.04]'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`mt-5 text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
            {statusLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { isUnlocked, address, privateKey, resetTxAuth, isCheckingSession, keystore } = useWallet();
  const { autoLockMinutes, isPinLocked } = usePin();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletNetworkMode, setWalletNetworkMode] = useState<WalletNetworkMode>('mainnet');
  const [networkSwitching, setNetworkSwitching] = useState(false);
  const [walletSurfaceMotionKey, setWalletSurfaceMotionKey] = useState(0);
  const [assetSurfaceMotionKey, setAssetSurfaceMotionKey] = useState(0);
  const [injPrice, setInjPrice] = useState<number>(25);
  const [injPriceChange24h, setInjPriceChange24h] = useState<number>(0);
  const [usdtPriceChange24h, setUsdtPriceChange24h] = useState<number>(0);
  const [usdcPriceChange24h, setUsdcPriceChange24h] = useState<number>(0);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balanceDisplayUnit, setBalanceDisplayUnit] = useState<BalanceDisplayUnit>('INJ');
  const [balanceUnitMenuOpen, setBalanceUnitMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ninjaBalance, setNinjaBalance] = useState(DEFAULT_NINJA_BALANCE);
  const [assetTab, setAssetTab] = useState<AssetTab>('tokens');
  const [faucetCategory, setFaucetCategory] = useState<FaucetCategory>('popular');
  const [assetSurfaceMode, setAssetSurfaceMode] = useState<AssetSurfaceMode>('assets');
  const [assetTrendReplayKey, setAssetTrendReplayKey] = useState(0);
  const [faucetClaimingId, setFaucetClaimingId] = useState<string | null>(null);
  const [faucetClaimedId, setFaucetClaimedId] = useState<string | null>(null);
  const [faucetClaimLocked, setFaucetClaimLocked] = useState(false);
  const [faucetError, setFaucetError] = useState('');
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({
    INJ: '0.0000',
    USDC: '0.00',
    LAM: '0.00',
    USDT: '0.00',
  });
  
  // QR Scanner states
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrSuccess, setQrSuccess] = useState(false);
  const [scannedAddress, setScannedAddress] = useState('');
  const [closingQRScanner, setClosingQRScanner] = useState(false);
  const [showMyQR, setShowMyQR] = useState(false);
  
  // NFT states
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [nftsLoading, setNftsLoading] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  
  // Staking states
  const [stakingInfo, setStakingInfo] = useState<StakingInfo | null>(null);
  const [stakingLoading, setStakingLoading] = useState(false);
  
  // Wallet action states
  const [walletPanel, setWalletPanel] = useState<WalletPanel>('overview');
  const [receiveAddressType, setReceiveAddressType] = useState<AddressType>('evm');
  const [receiveCopied, setReceiveCopied] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendGasEstimate, setSendGasEstimate] = useState<GasEstimate | null>(null);
  const [sendEstimating, setSendEstimating] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendTxHash, setSendTxHash] = useState('');
  const [swapFromToken, setSwapFromToken] = useState<SwapToken>('INJ');
  const [swapToToken, setSwapToToken] = useState<SwapToken>('USDT');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapQuoteAmount, setSwapQuoteAmount] = useState('');
  const [swapSlippage, setSwapSlippage] = useState('0.5');
  const [swapQuoteLoading, setSwapQuoteLoading] = useState(false);
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapPriceImpact, setSwapPriceImpact] = useState('0.00');
  const [swapError, setSwapError] = useState('');
  const [swapTxHash, setSwapTxHash] = useState('');
  const [historyFilter, setHistoryFilter] = useState<DashboardHistoryFilter>('all');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyItems, setHistoryItems] = useState<DashboardTransaction[]>([]);
  const [selectedChancePlan, setSelectedChancePlan] = useState<ChancePlanId>('pro');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInlineSendAuth, setShowInlineSendAuth] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<'send' | 'swap' | 'chance' | null>(null);
  const [postAuthAction, setPostAuthAction] = useState<'send' | 'swap' | 'chance' | null>(null);
  const [chanceSubmitting, setChanceSubmitting] = useState(false);
  const [chanceError, setChanceError] = useState('');
  const [chanceTxHash, setChanceTxHash] = useState('');
  const [cardPanelTab, setCardPanelTab] = useState<CardPanelTab>('pay');
  const [boundCards, setBoundCards] = useState<BoundCardPreview[]>([]);
  const [cardScanState, setCardScanState] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [cardScanData, setCardScanData] = useState<NFCCardData | null>(null);
  const [cardScanError, setCardScanError] = useState('');
  const [flippedTokenCard, setFlippedTokenCard] = useState<string | null>(null);
  const [copiedTokenInfo, setCopiedTokenInfo] = useState<string | null>(null);
  const [sendAmountAlertActive, setSendAmountAlertActive] = useState(false);
  const tokenFlipTimerRef = useRef<number | null>(null);
  const aiCompactPromoteTimerRef = useRef<number | null>(null);
  const balanceUnitMenuTimerRef = useRef<number | null>(null);
  const cardScanSessionRef = useRef(0);
  const isLight = theme === 'light';
  const sendAmountAlertTimerRef = useRef<number | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const currentNetworkMeta = NETWORK_META[walletNetworkMode];
  const [aiCompactNinjaPromoted, setAiCompactNinjaPromoted] = useState(false);

  useEffect(() => {
    if (redirectTimerRef.current) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    // Wait for session check to complete
    if (isCheckingSession) {
      console.log('[Dashboard] Still checking session, waiting...');
      return;
    }

    console.log('[Dashboard] isUnlocked:', isUnlocked, 'address:', address);
    if (!isUnlocked || !address) {
      redirectTimerRef.current = window.setTimeout(() => {
        const fallbackRoute = keystore || address ? '/unlock' : '/welcome';
        console.log(`[Dashboard] Wallet state not ready, redirecting to ${fallbackRoute}`);
        router.replace(fallbackRoute);
        redirectTimerRef.current = null;
      }, 320);
      return;
    }

    console.log('[Dashboard] Unlocked, loading data...');
    void loadData({ background: hasLoadedOnceRef.current });
    hasLoadedOnceRef.current = true;
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, address, isCheckingSession, keystore, router, walletNetworkMode]);

  const syncNinjaBalance = useCallback(async () => {
    if (!address || walletNetworkMode !== 'mainnet') {
      setNinjaBalance(0);
      return;
    }

    try {
      const balance = await getNinjaBalanceFromBackend();
      const safeBalance = Number.isFinite(balance) ? balance : 0;
      setNinjaBalance(safeBalance);
    } catch (error) {
      console.error('Failed to load NINJA balance from backend:', error);
      setNinjaBalance(0);
    }
  }, [address, walletNetworkMode]);

  useEffect(() => {
    void syncNinjaBalance();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncNinjaBalance();
      }
    }, NINJA_BALANCE_POLL_MS);

    const handleNinjaBalanceUpdate = () => {
      void syncNinjaBalance();
    };

    const handleWindowFocus = () => {
      void syncNinjaBalance();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncNinjaBalance();
      }
    };

    window.addEventListener(NINJA_BALANCE_EVENT, handleNinjaBalanceUpdate);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(NINJA_BALANCE_EVENT, handleNinjaBalanceUpdate);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncNinjaBalance]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storageKey = getFaucetClaimStorageKey(address || undefined);
    if (!storageKey) {
      setFaucetClaimedId(null);
      setFaucetClaimLocked(false);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setFaucetClaimedId(null);
        setFaucetClaimLocked(false);
        return;
      }

      const parsed = JSON.parse(raw) as { targetId?: string };
      setFaucetClaimedId(parsed.targetId || null);
      setFaucetClaimLocked(true);
    } catch (error) {
      console.error('Failed to restore faucet claim state:', error);
      setFaucetClaimedId(null);
      setFaucetClaimLocked(false);
    }
  }, [address]);

  useEffect(() => {
    return () => {
      if (balanceUnitMenuTimerRef.current) {
        window.clearTimeout(balanceUnitMenuTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setTokenBalances((current) => ({
      ...current,
      LAM: walletNetworkMode === 'mainnet' ? ninjaBalance.toFixed(2) : '0.00',
    }));
  }, [ninjaBalance, walletNetworkMode]);

  useEffect(() => {
    if (tokenFlipTimerRef.current) {
      window.clearTimeout(tokenFlipTimerRef.current);
      tokenFlipTimerRef.current = null;
    }

    if (!flippedTokenCard) {
      return;
    }

    tokenFlipTimerRef.current = window.setTimeout(() => {
      setFlippedTokenCard((current) => (current === flippedTokenCard ? null : current));
      tokenFlipTimerRef.current = null;
    }, 5000);

    return () => {
      if (tokenFlipTimerRef.current) {
        window.clearTimeout(tokenFlipTimerRef.current);
        tokenFlipTimerRef.current = null;
      }
    };
  }, [flippedTokenCard]);

  useEffect(() => {
    if (aiCompactPromoteTimerRef.current) {
      window.clearTimeout(aiCompactPromoteTimerRef.current);
      aiCompactPromoteTimerRef.current = null;
    }

    if (assetSurfaceMode !== 'ai') {
      setAiCompactNinjaPromoted(false);
      return;
    }

    setAiCompactNinjaPromoted(false);
    aiCompactPromoteTimerRef.current = window.setTimeout(() => {
      setAiCompactNinjaPromoted(true);
      aiCompactPromoteTimerRef.current = null;
    }, 620);

    return () => {
      if (aiCompactPromoteTimerRef.current) {
        window.clearTimeout(aiCompactPromoteTimerRef.current);
        aiCompactPromoteTimerRef.current = null;
      }
    };
  }, [assetSurfaceMode]);

  useEffect(() => {
    return () => {
      if (sendAmountAlertTimerRef.current) {
        window.clearTimeout(sendAmountAlertTimerRef.current);
        sendAmountAlertTimerRef.current = null;
      }
      if (aiCompactPromoteTimerRef.current) {
        window.clearTimeout(aiCompactPromoteTimerRef.current);
        aiCompactPromoteTimerRef.current = null;
      }
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  const loadBoundCards = useCallback(() => {
    if (!address || typeof window === 'undefined') {
      setBoundCards([]);
      return;
    }

    try {
      const saved = window.localStorage.getItem(`nfc_cards_${address}`);
      if (!saved) {
        setBoundCards([]);
        return;
      }

      const parsed = JSON.parse(saved) as Array<Omit<BoundCardPreview, 'boundAt'> & { boundAt: string }>;
      setBoundCards(
        parsed.map((card) => ({
          ...card,
          boundAt: new Date(card.boundAt),
        }))
      );
    } catch (error) {
      console.error('Failed to load bound cards:', error);
      setBoundCards([]);
    }
  }, [address]);

  const startCardScanner = useCallback(async () => {
    const sessionId = cardScanSessionRef.current + 1;
    cardScanSessionRef.current = sessionId;
    setCardScanData(null);
    setCardScanError('');

    if (!isNFCSupported()) {
      setCardScanState('error');
      setCardScanError('NFC is not supported on this device. Please use an Android device with Chrome browser.');
      return;
    }

    setCardScanState('scanning');

    try {
      const nextCardData = await readNFCCard();
      if (cardScanSessionRef.current !== sessionId) {
        return;
      }

      setCardScanData(nextCardData);
      if (!nextCardData.address) {
        setCardScanState('error');
        setCardScanError('This card has no address stored yet. Open Manage Cards to bind or review it first.');
        return;
      }

      setCardScanState('success');
    } catch (error) {
      if (cardScanSessionRef.current !== sessionId) {
        return;
      }

      setCardScanState('error');
      setCardScanError((error as Error).message || 'Failed to read NFC card. Please try again.');
    }
  }, []);

  useEffect(() => {
    loadBoundCards();
  }, [loadBoundCards]);

  useEffect(() => {
    if (walletPanel !== 'card' || cardPanelTab !== 'pay') {
      cardScanSessionRef.current += 1;
      return;
    }

    if (cardScanState === 'idle') {
      void startCardScanner();
    }
  }, [cardPanelTab, cardScanState, startCardScanner, walletPanel]);

  const loadData = useCallback(async ({
    background = false,
    keepRefreshing = false,
  }: {
    background?: boolean;
    keepRefreshing?: boolean;
  } = {}) => {
    if (!address) return;

    try {
      if (background) {
        setRefreshing(true);
        setNetworkSwitching(true);
      } else {
        setLoading(true);
      }
      // Prices: one batched CoinGecko request instead of 3 separate calls.
      // Balances: getDashboardTokenBalances already returns the native INJ
      // balance, so we no longer make a separate getChainBalance RPC round-trip.
      const [prices, tokenBalData] = await Promise.all([
        getTokenPrices(['injective-protocol', 'tether', 'usd-coin']),
        getDashboardTokenBalances(address as Address, walletNetworkMode),
      ]);

      const injPriceData = prices['injective-protocol'];
      if (injPriceData) {
        setInjPrice(injPriceData.usd);
        setInjPriceChange24h(injPriceData.usd24hChange || 0);
      }
      setUsdtPriceChange24h(prices['tether']?.usd24hChange || 0);
      setUsdcPriceChange24h(prices['usd-coin']?.usd24hChange || 0);
      setTokenBalances({
        INJ: parseFloat(tokenBalData.INJ).toFixed(4),
        USDC: parseFloat(tokenBalData.USDC).toFixed(2),
        LAM: walletNetworkMode === 'mainnet' ? ninjaBalance.toFixed(2) : '0.00',
        USDT: parseFloat(tokenBalData.USDT).toFixed(2),
      });
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
      if (!keepRefreshing) {
        setRefreshing(false);
      }
      setNetworkSwitching(false);
    }
  }, [address, ninjaBalance, walletNetworkMode]);

  const handleFaucetTokenClaim = useCallback(async (networkId: string) => {
    if (!address || faucetClaimLocked || faucetClaimingId) {
      return;
    }

    setFaucetClaimingId(networkId);
    setFaucetError('');

    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          companion: networkId === 'injective' ? null : networkId,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Claim failed');
      }

      setFaucetClaimedId(networkId);
      setFaucetClaimLocked(true);

      const storageKey = getFaucetClaimStorageKey(address);
      if (storageKey && typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, JSON.stringify({
          targetId: networkId,
          claimedAt: new Date().toISOString(),
        }));
      }

      void loadData({ background: true });
    } catch (error) {
      setFaucetError(error instanceof Error ? error.message : 'Claim failed');
    } finally {
      setFaucetClaimingId(null);
    }
  }, [address, faucetClaimLocked, faucetClaimingId, loadData]);

  // Load NFTs when switching to NFTs tab
  const loadNFTs = async () => {
    if (!address || nftsLoading) return;

    try {
      setNftsLoading(true);
      console.log('[Dashboard] Loading NFTs for address:', address);
      const userNFTs = await getN1NJ4NFTs(address as Address);
      console.log('[Dashboard] Loaded NFTs:', userNFTs);
      setNfts(userNFTs);
    } catch (error) {
      console.error('Failed to load NFTs:', error);
    } finally {
      setNftsLoading(false);
    }
  };

  // Load staking info when switching to DeFi tab
  const loadStakingInfo = async () => {
    if (!address || stakingLoading) return;

    try {
      setStakingLoading(true);
      console.log('[Dashboard] Loading staking info for address:', address);
      const info = await getUserStakingInfo(address as Address);
      console.log('[Dashboard] Loaded staking info:', info);
      setStakingInfo(info);
    } catch (error) {
      console.error('Failed to load staking info:', error);
    } finally {
      setStakingLoading(false);
    }
  };

  // Load NFTs when NFT tab is selected
  useEffect(() => {
    if (assetTab === 'nfts' && address && nfts.length === 0) {
      loadNFTs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTab, address]);

  // Load staking info when DeFi tab is selected
  useEffect(() => {
    if (assetTab === 'defi' && address && !stakingInfo) {
      loadStakingInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTab, address]);

  const handleRefresh = () => {
    setRefreshing(true);

    void (async () => {
      try {
        const refreshTasks: Array<Promise<unknown>> = [
          loadData({ background: true, keepRefreshing: true }),
          syncNinjaBalance(),
        ];

        // Also refresh staking info if on DeFi tab
        if (assetTab === 'defi') {
          refreshTasks.push(loadStakingInfo());
        }

        // Also refresh NFTs if on NFTs tab
        if (assetTab === 'nfts') {
          refreshTasks.push(loadNFTs());
        }

        await Promise.all(refreshTasks);
      } finally {
        setRefreshing(false);
      }
    })();
  };

  const toggleWalletPanel = (panel: Exclude<WalletPanel, 'overview'>) => {
    setWalletPanel((current) => (current === panel ? 'overview' : panel));
  };

  const getCosmosAddress = useCallback((evmAddress: string) => {
    if (!evmAddress) return '';
    try {
      return getInjectiveAddress(evmAddress);
    } catch (error) {
      console.error('Failed to convert address to cosmos format:', error);
      return '';
    }
  }, []);

  const getEvmAddress = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('0x')) return trimmed;
    if (trimmed.startsWith('inj1')) {
      return getEthereumAddress(trimmed);
    }
    return trimmed;
  }, []);

  const receiveDisplayAddress = receiveAddressType === 'evm' ? (address || '') : getCosmosAddress(address || '');
  const sendGasLimitLabel = sendGasEstimate ? sendGasEstimate.gasLimit.toString() : 'Awaiting input';
  const sendEstimatedGasCostInInj = sendGasEstimate ? Number(formatEther(sendGasEstimate.totalCost)) : null;
  const sendEstimatedGasLabel = sendGasEstimate
    ? sendEstimatedGasCostInInj !== null && sendEstimatedGasCostInInj > 0 && sendEstimatedGasCostInInj < 0.0001
      ? '<0.0001 INJ'
      : `${(sendEstimatedGasCostInInj ?? 0).toFixed(4)} INJ`
    : 'Awaiting input';
  const sendBalanceValue = parseFloat(tokenBalances.INJ || '0');
  const sendAmountNumeric = Number(sendAmount);
  const sendAmountExceedsBalance =
    sendAmount.trim() !== '' && Number.isFinite(sendAmountNumeric) && sendAmountNumeric > sendBalanceValue;
  const swapTokenOptions = [
    { symbol: 'INJ' as const, name: 'Injective', icon: '/injswap.png', balance: tokenBalances.INJ, enabled: true },
    { symbol: 'USDT' as const, name: 'Tether', icon: '/USDT_Logo.png', balance: tokenBalances.USDT, enabled: true },
    { symbol: 'USDC' as const, name: 'USD Coin', icon: '/USDC_Logo.png', balance: tokenBalances.USDC, enabled: true },
    { symbol: 'LAM' as const, name: 'LAM', icon: '/lam-logo.png', balance: walletNetworkMode === 'mainnet' ? ninjaBalance.toFixed(2) : '0.00', enabled: false },
  ];
  const swapFromMeta = swapTokenOptions.find((token) => token.symbol === swapFromToken) || swapTokenOptions[0];
  const swapToMeta = swapTokenOptions.find((token) => token.symbol === swapToToken) || swapTokenOptions[1];
  const getAlternateSwapToken = (current: SwapToken) => (
    swapTokenOptions.find((token) => token.symbol !== current)?.symbol || 'INJ'
  );
  const sanitizeDecimalInput = useCallback((value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    const firstDot = cleaned.indexOf('.');

    if (firstDot === -1) {
      return cleaned;
    }

    return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  }, []);

  const triggerSendAmountAlert = () => {
    if (sendAmountAlertTimerRef.current) {
      window.clearTimeout(sendAmountAlertTimerRef.current);
      sendAmountAlertTimerRef.current = null;
    }

    setSendAmountAlertActive(false);
    window.requestAnimationFrame(() => {
      setSendAmountAlertActive(true);
      sendAmountAlertTimerRef.current = window.setTimeout(() => {
        setSendAmountAlertActive(false);
        sendAmountAlertTimerRef.current = null;
      }, 520);
    });
  };
  const filteredHistoryItems = historyFilter === 'all'
    ? historyItems
    : historyItems.filter((item) => item.type === historyFilter);
  const walletPanelMeta: Record<Exclude<WalletPanel, 'overview'>, { title: string; subtitle: string }> = {
    card: {
      title: 'Card Center',
      subtitle: 'Tap a card, inject its address into Send, or manage bound NFC cards without leaving this wallet surface.',
    },
    send: {
      title: 'Send INJ',
      subtitle: 'Transfer directly from this wallet card without leaving the dashboard.',
    },
    receive: {
      title: 'Receive Assets',
      subtitle: 'Show your address and QR code inline for quick inbound transfers.',
    },
    swap: {
      title: 'Swap Assets',
      subtitle: 'Run a quick Injective swap inside your main wallet surface.',
    },
    history: {
      title: 'Recent Activity',
      subtitle: 'Review your latest on-chain transfers and swaps right here.',
    },
    settings: {
      title: 'Wallet Settings',
      subtitle: 'Manage security, PIN, keys, and wallet preferences without leaving this card.',
    },
    chance: {
      title: 'More Chance',
      subtitle: 'Choose an extra tap pack for the LAM earn loop without leaving the wallet surface.',
    },
  };

  const loadHistory = useCallback(async () => {
    if (!address || !isUnlocked) {
      setHistoryItems([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError('');

    try {
      const [evmTxHistory, cosmosTxHistory] = await Promise.all([
        getTxHistory(address, 20, currentNetworkMeta.chain).catch((error) => {
          console.error('Failed to fetch EVM transactions:', error);
          return [];
        }),
        (async () => {
          if (walletNetworkMode === 'testnet') {
            return [];
          }
          try {
            const cosmosAddress = getInjectiveAddress(address);
            return await getCosmosTxHistory(cosmosAddress, 20);
          } catch (error) {
            console.error('Failed to fetch Cosmos transactions:', error);
            return [];
          }
        })(),
      ]);

      const routerAddress = ROUTER_ADDRESS.toLowerCase();

      const evmTransactions: DashboardTransaction[] = evmTxHistory.map((tx) => {
        const isSwapTx = tx.to?.toLowerCase() === routerAddress;
        const isSent = tx.from.toLowerCase() === address.toLowerCase();
        const type: DashboardTransactionType = isSwapTx ? 'swap' : isSent ? 'send' : 'receive';
        const targetAddress = type === 'send' || type === 'swap' ? (tx.to || 'Contract Creation') : tx.from;

        return {
          id: `evm-${tx.hash}`,
          type,
          amount: (Number(tx.value) / 10 ** 18).toFixed(3),
          token: 'INJ',
          address: targetAddress.startsWith('0x') ? truncateMiddle(targetAddress) : targetAddress,
          timestamp: new Date(tx.timestamp * 1000),
          status: tx.status === 'success' ? 'completed' : tx.status === 'failed' ? 'failed' : 'pending',
          txHash: tx.hash,
          chainType: 'EVM',
        };
      });

      const cosmosAddress = getInjectiveAddress(address);
      const cosmosTransactions: DashboardTransaction[] = cosmosTxHistory.map((tx) => {
        const isSwapTx = (tx as { isSwap?: boolean }).isSwap === true;
        const isSent = tx.from.toLowerCase() === cosmosAddress.toLowerCase();
        const type: DashboardTransactionType = isSwapTx ? 'swap' : isSent ? 'send' : 'receive';
        const targetAddress = type === 'send' || type === 'swap' ? (tx.to || '') : tx.from;

        return {
          id: `cosmos-${tx.hash}`,
          type,
          amount: (Number(tx.value) / 10 ** 18).toFixed(3),
          token: 'INJ',
          address: targetAddress.startsWith('inj') ? truncateMiddle(targetAddress, 8, 6) : targetAddress,
          timestamp: new Date(tx.timestamp * 1000),
          status: tx.status === 'success' ? 'completed' : tx.status === 'failed' ? 'failed' : 'pending',
          txHash: tx.hash,
          chainType: 'Cosmos',
        };
      });

      const allTransactions = [...evmTransactions, ...cosmosTransactions].sort(
        (left, right) => right.timestamp.getTime() - left.timestamp.getTime()
      );

      setHistoryItems(allTransactions);
    } catch (error) {
      console.error('Failed to load history:', error);
      setHistoryError('Unable to load recent activity right now.');
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [address, currentNetworkMeta.chain, isUnlocked, walletNetworkMode]);

  const executeInlineSend = useCallback(async () => {
    const trimmedRecipient = sendRecipient.trim();
    const trimmedAmount = sendAmount.trim();
    const numericAmount = Number(trimmedAmount);
    const gasCost = sendGasEstimate ? Number(formatEther(sendGasEstimate.totalCost)) : 0;

    if (!trimmedRecipient || !trimmedAmount) {
      setSendError('Enter a recipient and amount.');
      return;
    }

    if (!isValidAddress(trimmedRecipient)) {
      setSendError('Enter a valid EVM or Injective address.');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setSendError('Enter a valid transfer amount.');
      return;
    }

    if (numericAmount + gasCost > sendBalanceValue) {
      setSendError('Amount plus gas exceeds your INJ balance.');
      return;
    }

    if (!privateKey) {
      setSendError('Signing key is not loaded. Verify with Passkey and try again.');
      return;
    }

    setSendSubmitting(true);
    setSendError('');

    try {
      const recipientAddress = getEvmAddress(trimmedRecipient);
      const hash = await sendTransaction(
        privateKey,
        recipientAddress,
        trimmedAmount,
        undefined,
        currentNetworkMeta.chain
      );

      setSendTxHash(hash);
      resetTxAuth();
      await loadData();
      await loadHistory();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send transaction');
    } finally {
      setSendSubmitting(false);
    }
  }, [currentNetworkMeta.chain, getEvmAddress, loadData, loadHistory, privateKey, resetTxAuth, sendAmount, sendBalanceValue, sendGasEstimate, sendRecipient]);

  const executeInlineSwap = useCallback(async () => {
    if (walletNetworkMode === 'testnet') {
      setSwapError('Swap is unavailable on testnet right now.');
      return;
    }

    const numericAmount = Number(swapAmount);
    const availableBalance = Number(swapFromMeta.balance || '0');

    if (swapFromToken === swapToToken) {
      setSwapError('Choose two different assets.');
      return;
    }

    if (!swapFromMeta.enabled || !swapToMeta.enabled) {
      setSwapError('LAM swap is coming soon.');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setSwapError('Enter a valid amount to swap.');
      return;
    }

    if (numericAmount > availableBalance) {
      setSwapError(`Insufficient ${swapFromToken} balance.`);
      return;
    }

    if (!privateKey || !address) {
      setSwapError('Signing key is not loaded. Verify with Passkey and try again.');
      return;
    }

    setSwapSubmitting(true);
    setSwapError('');

    try {
      const hash = await executeSwap({
        fromToken: swapFromToken,
        toToken: swapToToken,
        amountIn: swapAmount,
        slippage: Number(swapSlippage),
        userAddress: address as Address,
        privateKey: privateKeyToHex(privateKey),
      });

      setSwapTxHash(hash);
      resetTxAuth();
      await loadData();
      await loadHistory();
    } catch (error) {
      setSwapError(error instanceof Error ? error.message : 'Swap failed');
    } finally {
      setSwapSubmitting(false);
    }
  }, [address, loadData, loadHistory, privateKey, resetTxAuth, swapAmount, swapFromMeta.balance, swapFromMeta.enabled, swapFromToken, swapSlippage, swapToMeta.enabled, swapToToken, walletNetworkMode]);

  const handleSendAction = () => {
    if (isPinLocked || autoLockMinutes === 0 || !privateKey) {
      setPendingAuthAction('send');
      setShowInlineSendAuth(true);
      return;
    }

    void executeInlineSend();
  };

  const handleSwapAction = () => {
    if (isPinLocked || autoLockMinutes === 0 || !privateKey) {
      setPendingAuthAction('swap');
      setShowAuthModal(true);
      return;
    }

    void executeInlineSwap();
  };

  const executeChancePurchase = useCallback(async () => {
    if (!privateKey || !address) {
      setChanceError('Signing key is not loaded. Verify with Passkey and try again.');
      return;
    }

    const selectedPlan = MORE_CHANCE_PLANS.find((plan) => plan.id === selectedChancePlan);
    if (!selectedPlan) {
      setChanceError('Selected chance plan is invalid.');
      return;
    }

    setChanceSubmitting(true);
    setChanceError('');
    setChanceTxHash('');

    try {
      const chanceClient = createPublicClient({
        transport: http(CHANCE_NETWORK_META.chain.rpcUrl),
      });

      const [planOnChain, cooldownEndsAt] = await Promise.all([
        chanceClient.readContract({
          address: CHANCE_CONTRACT_ADDRESS,
          abi: CHANCE_MANAGER_ABI,
          functionName: 'plans',
          args: [selectedPlan.planId],
        }),
        chanceClient.readContract({
          address: CHANCE_CONTRACT_ADDRESS,
          abi: CHANCE_MANAGER_ABI,
          functionName: 'chanceCooldownEndsAt',
          args: [address as Address],
        }),
      ]);

      const [onChainPriceWei, , , onChainActive] = planOnChain;
      if (!onChainActive) {
        setChanceError('Selected chance plan is not active on-chain right now.');
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const safeCooldownEndsAt = Number(cooldownEndsAt);
      if (Number.isFinite(safeCooldownEndsAt) && safeCooldownEndsAt > nowSec) {
        const remainingSec = safeCooldownEndsAt - nowSec;
        setChanceError(`Chance is cooling down. Try again in ${remainingSec}s.`);
        return;
      }

      const clientRef = keccak256(stringToHex(`chance-${selectedPlan.id}-${Date.now()}`));
      const data = encodeFunctionData({
        abi: CHANCE_MANAGER_ABI,
        functionName: 'buyChance',
        args: [selectedPlan.planId, clientRef],
      });

      const hash = await sendTransaction(
        privateKey,
        CHANCE_CONTRACT_ADDRESS,
        formatEther(onChainPriceWei),
        data,
        CHANCE_NETWORK_META.chain,
      );

      setChanceTxHash(hash);
      resetTxAuth();

      // Wait for on-chain confirmation so downstream profile sync does not read stale chance data.
      await waitForTransaction(hash, CHANCE_NETWORK_META.chain, 1);

      // Give backend worker a short window to ingest ChancePurchased and update profile.
      await new Promise((resolve) => window.setTimeout(resolve, 1600));

      window.dispatchEvent(new CustomEvent(CHANCE_PURCHASE_SUBMITTED_EVENT, {
        detail: {
          txHash: hash,
          planId: selectedPlan.id,
          chances: selectedPlan.chances,
        },
      }));
    } catch (error) {
      setChanceError(error instanceof Error ? error.message : 'Failed to buy chance');
    } finally {
      setChanceSubmitting(false);
    }
  }, [address, privateKey, resetTxAuth, selectedChancePlan]);

  const handleChanceAction = () => {
    if (isPinLocked || autoLockMinutes === 0 || !privateKey) {
      setPendingAuthAction('chance');
      setShowAuthModal(true);
      return;
    }

    void executeChancePurchase();
  };

  const handleTransactionAuthSuccess = () => {
    setShowAuthModal(false);
    if (pendingAuthAction) {
      setPostAuthAction(pendingAuthAction);
      setPendingAuthAction(null);
    }
  };

  const handleInlineSendAuthClose = () => {
    setShowInlineSendAuth(false);
    if (pendingAuthAction === 'send') {
      setPendingAuthAction(null);
    }
  };

  const handleInlineSendAuthSuccess = () => {
    setShowInlineSendAuth(false);
    setPostAuthAction('send');
    setPendingAuthAction(null);
  };

  useEffect(() => {
    if (!postAuthAction || !privateKey) return;

    if (postAuthAction === 'send') {
      void executeInlineSend();
    } else if (postAuthAction === 'swap') {
      void executeInlineSwap();
    } else {
      void executeChancePurchase();
    }

    setPostAuthAction(null);
  }, [executeChancePurchase, executeInlineSend, executeInlineSwap, postAuthAction, privateKey]);

  useEffect(() => {
    if (walletPanel !== 'history') return;
    void loadHistory();
  }, [loadHistory, walletPanel]);

  useEffect(() => {
    if (walletPanel !== 'send' && showInlineSendAuth) {
      setShowInlineSendAuth(false);
      if (pendingAuthAction === 'send') {
        setPendingAuthAction(null);
      }
    }
  }, [pendingAuthAction, showInlineSendAuth, walletPanel]);

  useEffect(() => {
    if (walletPanel !== 'send') return;

    const trimmedRecipient = sendRecipient.trim();
    const trimmedAmount = sendAmount.trim();
    const parsedAmount = Number(trimmedAmount);
    const estimateRecipient = trimmedRecipient && isValidAddress(trimmedRecipient)
      ? getEvmAddress(trimmedRecipient)
      : '0x0000000000000000000000000000000000000000';
    const estimateAmount = trimmedAmount !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? trimmedAmount
      : '0.001';

    if (!address) {
      setSendGasEstimate(null);
      setSendEstimating(false);
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(async () => {
      try {
        setSendEstimating(true);
        const estimate = await estimateGas(
          address,
          estimateRecipient,
          estimateAmount,
          undefined,
          currentNetworkMeta.chain
        );

        if (!ignore) {
          setSendGasEstimate(estimate);
        }
      } catch (error) {
        if (!ignore) {
          console.error('Failed to estimate gas:', error);
          setSendGasEstimate(null);
        }
      } finally {
        if (!ignore) {
          setSendEstimating(false);
        }
      }
    }, 350);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [address, currentNetworkMeta.chain, getEvmAddress, sendAmount, sendRecipient, walletPanel]);

  useEffect(() => {
    if (walletPanel !== 'swap') return;

    if (walletNetworkMode === 'testnet') {
      setSwapQuoteAmount('');
      setSwapQuoteLoading(false);
      setSwapPriceImpact('0.00');
      return;
    }

    if (!swapAmount || Number(swapAmount) <= 0 || swapFromToken === swapToToken) {
      setSwapQuoteAmount('');
      setSwapQuoteLoading(false);
      setSwapPriceImpact('0.00');
      return;
    }

    if (!swapFromMeta.enabled || !swapToMeta.enabled) {
      setSwapQuoteAmount('');
      setSwapQuoteLoading(false);
      setSwapPriceImpact('0.00');
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(async () => {
      try {
        setSwapQuoteLoading(true);
        const quote = await getSwapQuote(
          swapFromToken,
          swapToToken,
          swapAmount,
          Number(swapSlippage)
        );

        if (!ignore) {
          setSwapQuoteAmount(quote.expectedOutput);
          setSwapPriceImpact(quote.priceImpact);
        }
      } catch (error) {
        if (!ignore) {
          console.error('Failed to get swap quote:', error);
          setSwapQuoteAmount('');
        }
      } finally {
        if (!ignore) {
          setSwapQuoteLoading(false);
        }
      }
    }, 400);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [swapAmount, swapFromMeta.enabled, swapFromToken, swapSlippage, swapToMeta.enabled, swapToToken, walletNetworkMode, walletPanel]);

  const assetTabOrder: AssetTab[] = ['tokens', 'nfts', 'defi', 'earn'];
  const assetTabIndex = assetTabOrder.indexOf(assetTab);

  // QR Scanner handlers
  const openQRScanner = async () => {
    try {
      console.log('[Dashboard] openQRScanner called');
      
      // Check camera support
      if (!isCameraSupported()) {
        console.error('[Dashboard] Camera not supported');
        alert('Camera is not supported on this device. Please use a device with a camera and grant permission.');
        return;
      }

      console.log('[Dashboard] Opening QR scanner modal');
      setShowQRScanner(true);
      setQrScanning(false);
      setQrSuccess(false);
      setQrError('');
      setScannedAddress('');
      setClosingQRScanner(false);
      setShowMyQR(false);

      // Start scanning after modal opens - directly request camera
      setTimeout(async () => {
        console.log('[Dashboard] Starting scanner...');
        setQrScanning(true);
        try {
          await startQRScanner(
            'qr-reader',
            (decodedText) => {
              console.log('[Dashboard] QR decoded:', decodedText);
              
              // Validate address
              if (isValidAddress(decodedText)) {
                setScannedAddress(decodedText);
                setQrSuccess(true);
                setQrScanning(false);
                
                // Stop scanner
                stopQRScanner();
                
                // Redirect to send page after 1 second
                setTimeout(() => {
                  closeQRScanner();
                  router.push(`/send?address=${decodedText}`);
                }, 1000);
              } else {
                setQrError('Invalid address format. Please scan a valid wallet address.');
                setQrScanning(false);
                stopQRScanner();
              }
            },
            (error) => {
              console.error('[Dashboard] Scanner error:', error);
              setQrError(error);
              setQrScanning(false);
            }
          );
        } catch (error) {
          console.error('[Dashboard] Failed to start QR scanner:', error);
          setQrError(error instanceof Error ? error.message : 'Failed to start camera');
          setQrScanning(false);
        }
      }, 300);
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      console.error('[Dashboard] Error in openQRScanner:', error);
    }
  };

  const closeQRScanner = () => {
    setClosingQRScanner(true);
    if (!showMyQR) {
      stopQRScanner();
    }
    setTimeout(() => {
      setShowQRScanner(false);
      setQrScanning(false);
      setQrSuccess(false);
      setQrError('');
      setScannedAddress('');
      setClosingQRScanner(false);
      setShowMyQR(false);
      clearQRScanner();
    }, 350);
  };

  const openCardPanel = () => {
    setCardPanelTab('pay');
    setCardScanData(null);
    setCardScanError('');
    setCardScanState('idle');
    toggleWalletPanel('card');
  };

  const openMoreChancePanel = () => {
    setWalletPanel('chance');
  };

  const openAiAssetSurface = () => {
    setFlippedTokenCard(null);
    setAssetSurfaceMode((current) => {
      if (current === 'ai') {
        setAssetTrendReplayKey((value) => value + 1);
        return 'assets';
      }

      return 'ai';
    });
  };

  const openFaucetAssetSurface = () => {
    setFlippedTokenCard(null);
    setFaucetError('');
    setAssetSurfaceMode((current) => {
      const nextMode = current === 'faucet' ? 'assets' : 'faucet';
      setWalletNetworkMode(nextMode === 'faucet' ? 'testnet' : 'mainnet');
      return nextMode;
    });
    setWalletSurfaceMotionKey((value) => value + 1);
    setAssetSurfaceMotionKey((value) => value + 1);
    setAssetTrendReplayKey((value) => value + 1);
  };

  const toggleWalletNetworkMode = () => {
    setFlippedTokenCard(null);
    setWalletNetworkMode((current) => {
      const next = current === 'mainnet' ? 'testnet' : 'mainnet';
      if (next === 'mainnet' && assetSurfaceMode === 'faucet') {
        setAssetSurfaceMode('assets');
      }
      return next;
    });
    setWalletSurfaceMotionKey((value) => value + 1);
    setAssetSurfaceMotionKey((value) => value + 1);
    setAssetTrendReplayKey((value) => value + 1);
  };

  const isDashboardReady = !isCheckingSession && !loading && isUnlocked && !!address;
  const dashboardLoadStatus = isCheckingSession
    ? 'Checking wallet session'
    : !isUnlocked || !address
      ? 'Restoring wallet identity'
      : loading
        ? 'Loading wallet surface'
        : 'Wallet surface ready';
  const safeInjPrice = injPrice > 0 ? injPrice : 25;
  const injBalanceValue = parseFloat(tokenBalances.INJ);
  const injUsdValue = Number.isFinite(injBalanceValue) ? injBalanceValue * safeInjPrice : 0;
  const usdtValue = Number.isFinite(parseFloat(tokenBalances.USDT)) ? parseFloat(tokenBalances.USDT) : 0;
  const usdcValue = Number.isFinite(parseFloat(tokenBalances.USDC)) ? parseFloat(tokenBalances.USDC) : 0;
  const lamBalanceValue = walletNetworkMode === 'mainnet' ? ninjaBalance : 0;
  const lamUsdValue = lamBalanceValue * LAM_USD_PRICE;
  const totalUsdNumeric = injUsdValue + usdtValue + usdcValue + lamUsdValue;
  const totalUsdValue = totalUsdNumeric.toFixed(2);
  const totalUsdChangeValue =
    injUsdValue * (injPriceChange24h / 100) +
    usdtValue * (usdtPriceChange24h / 100) +
    usdcValue * (usdcPriceChange24h / 100);
  const previousTotalUsdValue = totalUsdNumeric - totalUsdChangeValue;
  const portfolioChangePct = previousTotalUsdValue > 0
    ? (totalUsdChangeValue / previousTotalUsdValue) * 100
    : 0;
  const assetTrendSeries = buildPixelTrendSeries(totalUsdNumeric, portfolioChangePct);
  const isWalletOverview = walletPanel === 'overview';
  const isAiStage = assetSurfaceMode === 'ai';
  const isFaucetStage = assetSurfaceMode === 'faucet';
  const isCardPanel = walletPanel === 'card';
  const isTestnet = walletNetworkMode === 'testnet';
  const activeWalletPanelMeta = walletPanel !== 'overview' ? walletPanelMeta[walletPanel] : null;
  const formattedLamBalance = walletNetworkMode === 'mainnet' ? ninjaBalance.toFixed(2) : '0.00';
  const formatUnitNumber = (value: number, unit: BalanceDisplayUnit) => {
    const safeValue = Number.isFinite(value) ? value : 0;

    if (unit === 'USD') return safeValue.toFixed(2);
    return safeValue.toFixed(4);
  };
  const formatUnitValue = (usdValue: number, unit: BalanceDisplayUnit) => {
    if (unit === 'USD') return `$${formatUnitNumber(usdValue, 'USD')}`;
    return `${formatUnitNumber(usdValue / safeInjPrice, 'INJ')} INJ`;
  };
  const formatSignedChangeValue = (usdValue: number, unit: BalanceDisplayUnit) => {
    const sign = usdValue >= 0 ? '+' : '-';
    const absoluteValue = Math.abs(usdValue);

    if (unit === 'USD') {
      return `${sign}$${formatUnitNumber(absoluteValue, 'USD')}`;
    }

    return `${sign}${formatUnitNumber(absoluteValue / safeInjPrice, 'INJ')}`;
  };
  const totalBalanceValue =
    balanceDisplayUnit === 'USD'
      ? totalUsdNumeric
      : totalUsdNumeric / safeInjPrice;
  const formattedDisplayBalance = formatUnitNumber(totalBalanceValue, balanceDisplayUnit);
  const displaySecondaryBalance =
    balanceDisplayUnit === 'USD'
      ? `≈ ${formatUnitNumber(totalUsdNumeric / safeInjPrice, 'INJ')} INJ`
      : `≈ $${totalUsdValue} USD`;
  const displayChangeValue = formatSignedChangeValue(totalUsdChangeValue, balanceDisplayUnit);
  const overviewStageClassName = 'h-[438px] sm:h-[470px] md:h-[482px]';
  const detailStageClassName = 'h-[500px] sm:h-[528px] md:h-[520px]';
  const aiStageClassName = overviewStageClassName;
  const overviewSizedWalletPanels: WalletPanel[] = ['overview', 'send', 'receive', 'swap', 'history', 'chance', 'settings'];
  const walletStageClassName = isAiStage
    ? aiStageClassName
    : overviewSizedWalletPanels.includes(walletPanel)
      ? overviewStageClassName
      : detailStageClassName;
  const assetStageClassName = 'h-[392px] sm:h-[430px] md:h-[482px]';
  const currentNetworkLabel = currentNetworkMeta.label;
  const currentNetworkShortLabel = currentNetworkMeta.shortLabel;
  const currentTokenSet = currentNetworkMeta.tokenSet;
  const currentWinjAddress = currentTokenSet.WINJ?.address || TOKENS_MAINNET.WINJ.address;
  const currentUsdtAddress = currentTokenSet.USDT?.address || null;
  const currentUsdcAddress = currentTokenSet.USDC?.address || null;
  const swapUnavailableOnTestnet = walletNetworkMode === 'testnet';
  const activeBoundCards = boundCards.filter((card) => card.isActive);
  const recentBoundCards = boundCards.slice(0, 2);
  const faucetCards = FAUCET_NETWORKS.map((network) => ({
    id: network.id,
    label: network.isBase ? 'INJ' : network.name,
    amountLabel: `${network.amount} ${network.symbol}`,
    icon: FAUCET_ICON_BY_ID[network.id] || '/injswap.png',
    category: POPULAR_FAUCET_IDS.has(network.id) ? 'popular' as const : 'others' as const,
  }));
  const filteredFaucetCards = faucetCards.filter((token) => token.category === faucetCategory);
  const dashboardTokenCards = [
    {
      symbol: 'INJ',
      icon: '/injswap.png',
      balance: `${tokenBalances.INJ} INJ`,
      usdValue: formatUnitValue((parseFloat(tokenBalances.INJ) || 0) * safeInjPrice, balanceDisplayUnit),
      change: `${injPriceChange24h >= 0 ? '+' : ''}${injPriceChange24h.toFixed(2)}%`,
      changeClass: injPriceChange24h >= 0 ? 'text-green-400' : 'text-red-400',
      copyValue: currentWinjAddress,
      contractValue: truncateMiddle(currentWinjAddress, 8, 6),
    },
    {
      symbol: 'USDC',
      icon: '/USDC_Logo.png',
      balance: `${tokenBalances.USDC} USDC`,
      usdValue: formatUnitValue(parseFloat(tokenBalances.USDC) || 0, balanceDisplayUnit),
      change: `${usdcPriceChange24h >= 0 ? '+' : ''}${usdcPriceChange24h.toFixed(2)}%`,
      changeClass: usdcPriceChange24h >= 0 ? 'text-green-400' : 'text-red-400',
      copyValue: currentUsdcAddress,
      contractValue: currentUsdcAddress ? truncateMiddle(currentUsdcAddress, 8, 6) : 'No contract yet',
    },
    {
      symbol: 'LAM',
      icon: '/lam-logo.png',
      balance: `${formattedLamBalance} LAM`,
      usdValue: formatUnitValue(lamUsdValue, balanceDisplayUnit),
      change: '+0.00%',
      changeClass: 'text-gray-500',
      copyValue: null,
      contractValue: 'No contract yet',
    },
    {
      symbol: 'USDT',
      icon: '/USDT_Logo.png',
      balance: `${tokenBalances.USDT} USDT`,
      usdValue: formatUnitValue(parseFloat(tokenBalances.USDT) || 0, balanceDisplayUnit),
      change: `${usdtPriceChange24h >= 0 ? '+' : ''}${usdtPriceChange24h.toFixed(2)}%`,
      changeClass: usdtPriceChange24h >= 0 ? 'text-green-400' : 'text-red-400',
      copyValue: currentUsdtAddress,
      contractValue: currentUsdtAddress ? truncateMiddle(currentUsdtAddress, 8, 6) : 'No contract yet',
    },
    {
      symbol: 'XAUT',
      icon: '/tether_logo.png',
      balance: '0.00 XAUT',
      usdValue: formatUnitValue(0, balanceDisplayUnit),
      change: '+0.00%',
      changeClass: 'text-gray-500',
      copyValue: null,
      contractValue: 'UI only',
    },
  ] as const;
  const compactAssetCardHeight = 64;
  const compactAssetCardGap = 6;
  const renderCompactAssetSurface = (surface: 'left' | 'right') => {
    const shouldPromoteNinja = surface === 'left' && isAiStage && aiCompactNinjaPromoted;
    const compactDisplayOrder = shouldPromoteNinja
      ? ['LAM', 'INJ', 'USDC', 'USDT', 'XAUT']
      : dashboardTokenCards.map((token) => token.symbol);
    const compactListHeight = dashboardTokenCards.length * compactAssetCardHeight + (dashboardTokenCards.length - 1) * compactAssetCardGap;

    return (
    <div
      key={`compact-assets-${surface}-${walletNetworkMode}-${assetSurfaceMotionKey}`}
      className="dashboard-surface-enter relative flex min-h-0 flex-1 flex-col"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Assets</div>
        {isTestnet && (
          <div className="rounded-full border border-[#5d7690] bg-[#1d2432] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-100">
            {currentNetworkShortLabel}
          </div>
        )}
      </div>

      <div className="relative" style={{ height: `${compactListHeight}px` }}>
        {dashboardTokenCards.map((token) => (
          <div
            key={`${surface}-compact-${token.symbol}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('application/x-injpass-asset', token.symbol);
              event.dataTransfer.setData('text/plain', `$${token.symbol}`);
            }}
            className={`absolute left-0 right-0 flex h-16 cursor-grab items-center gap-3 rounded-2xl border px-4 py-3 transition-[top,transform,border-color,box-shadow,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/[0.08] active:cursor-grabbing ${
              shouldPromoteNinja && token.symbol === 'LAM'
                ? isLight
                  ? 'border-black/45 bg-white/[0.05] shadow-[0_0_0_1px_rgba(0,0,0,0.18)]'
                  : 'border-black/75 bg-white/[0.06] shadow-[0_0_0_1px_rgba(0,0,0,0.48)]'
                : 'border-white/10 bg-white/[0.04]'
            }`}
            style={{
              top: `${compactDisplayOrder.indexOf(token.symbol) * (compactAssetCardHeight + compactAssetCardGap)}px`,
              transform: shouldPromoteNinja && token.symbol === 'LAM' ? 'translateY(-3px)' : 'translateY(0)',
              zIndex: shouldPromoteNinja && token.symbol === 'LAM' ? 2 : 1,
            }}
          >
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/[0.04]">
              <Image
                src={token.icon}
                alt={token.symbol}
                width={40}
                height={40}
                className={token.symbol === 'LAM' ? 'h-full w-full rounded-full object-cover object-center' : 'h-full w-full object-contain'}
              />
            </div>
            <div className="min-w-0 flex-1 text-[13px] font-mono text-gray-300">{token.balance}</div>
          </div>
        ))}
      </div>
    </div>
    );
  };

  if (!isDashboardReady) {
    return <DashboardSkeleton isLight={isLight} statusLabel={dashboardLoadStatus} />;
  }

  return (
        <>
        <div className="min-h-screen bg-black">
          <div className="px-4 pt-4">
            <LegacyWalletBanner />
          </div>
          <div>
            {/* Modern Dashboard Header */}
            <div className="bg-gradient-to-b from-white/5 to-transparent border-b border-white/5 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header Top */}
          <div className="mb-5 flex flex-col gap-4 md:mb-6 md:flex-row md:items-start md:justify-between">
            <EditableAccountIdentity key={address || 'default'} address={address || undefined} />

            {/* Scan QR Code Button */}
            <div className="flex w-full flex-wrap items-center justify-end gap-1.5 md:w-auto md:flex-nowrap md:gap-2">
              <WelcomeThemeIconButton />
              <button
                onClick={openAiAssetSurface}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-all sm:px-3 sm:py-2 sm:text-[11px] sm:tracking-[0.22em] ${
                  !isAiStage
                    ? 'border-white/10 bg-white/5 text-gray-300 hover:border-violet-500/40 hover:bg-violet-600/15 hover:text-white'
                    : 'border-fuchsia-400/35 bg-[linear-gradient(135deg,rgba(139,92,246,0.24),rgba(59,130,246,0.14))] text-white shadow-[0_10px_30px_rgba(99,102,241,0.22)]'
                }`}
                title="Open AI workspace"
              >
                AI
              </button>
              <button
                onClick={openFaucetAssetSurface}
                className={`rounded-lg border p-2 transition-all group sm:p-2.5 ${
                  isFaucetStage
                    ? 'border-violet-400/35 bg-[linear-gradient(135deg,rgba(124,58,237,0.20),rgba(59,130,246,0.14))] shadow-[0_10px_28px_rgba(99,102,241,0.16)]'
                    : 'border-white/10 bg-white/5 hover:border-violet-500/40 hover:bg-violet-600/20'
                }`}
                title="Testnet Faucet"
              >
                <svg
                  className={`h-4 w-4 transition-colors sm:h-[18px] sm:w-[18px] ${isFaucetStage ? 'text-violet-200' : 'text-gray-400 group-hover:text-violet-300'}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12h7" />
                  <path d="M9 9h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H9V9z" />
                  <path d="M10 9V7M13 9V7" />
                  <path d="M15 10h2.5a3.5 3.5 0 1 1 0 7H15" />
                  <path d="M18 17.5a2.5 2.5 0 1 1-5 0c0-1.1 1.2-2.4 2.1-3.4.5-.5.8-.9.9-1.1.1.2.5.6.9 1.1.9 1 2.1 2.3 2.1 3.4Z" />
                </svg>
              </button>
              <button
                onClick={openCardPanel}
                className={`rounded-lg border p-2 transition-all sm:p-2.5 ${
                  isCardPanel
                    ? 'border-amber-300/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(234,88,12,0.12))] shadow-[0_10px_28px_rgba(245,158,11,0.12)]'
                    : 'border-white/10 bg-white/5 hover:border-amber-500/35 hover:bg-amber-500/10'
                }`}
                title="Open Card Pay"
              >
                <svg className={`h-4 w-4 sm:h-[18px] sm:w-[18px] ${isCardPanel ? 'text-amber-100' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h5M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
                </svg>
              </button>
              <button 
                onClick={openQRScanner}
                className="rounded-lg border border-white/10 bg-white/5 p-2 transition-all hover:bg-white/10 sm:p-2.5"
                title="Scan QR Code"
              >
                <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  {/* Top-left corner */}
                  <path d="M3 9V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Top-right corner */}
                  <path d="M21 9V5a2 2 0 0 0-2-2h-4" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Bottom-left corner */}
                  <path d="M3 15v4a2 2 0 0 0 2 2h4" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Bottom-right corner */}
                  <path d="M21 15v4a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div
            className="grid gap-4 transition-[grid-template-columns] duration-500 md:gap-5 xl:[grid-template-columns:var(--dashboard-columns)]"
            style={{
              ['--dashboard-columns' as string]: isAiStage
                ? 'minmax(232px,0.38fr) minmax(0,1.62fr)'
                : isCardPanel
                  ? 'minmax(0,1.42fr) minmax(320px,0.58fr)'
                : 'minmax(0,1.18fr) minmax(360px,0.82fr)',
            }}
          >
            <div className={`relative ${walletStageClassName}`}>
              <div
                className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isAiStage
                    ? 'pointer-events-none -translate-x-6 scale-[0.96] opacity-0'
                    : 'translate-x-0 scale-100 opacity-100'
                }`}
              >
            {/* Total Balance Card - OKX Style */}
            <div className="bg-black rounded-2xl border border-white/10 relative overflow-hidden flex h-full flex-col p-4 sm:p-5 md:p-6">
              {/* Subtle gradient accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/5 to-transparent rounded-full blur-2xl"></div>
              
              <div className="relative flex flex-1 flex-col">
                {/* Header with Balance Label */}
                {isWalletOverview && (
                  <div className="mb-1 flex items-start justify-between gap-3 sm:mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Balance</span>
                      {isTestnet && (
                        <span className="rounded-full border border-[#5d7690] bg-[#1d2432] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                          {currentNetworkShortLabel}
                        </span>
                      )}
                      <button 
                        onClick={() => setBalanceVisible(!balanceVisible)}
                        className="p-1 rounded hover:bg-white/5 transition-colors"
                      >
                        {balanceVisible ? (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={toggleWalletNetworkMode}
                        disabled={networkSwitching}
                        className={`flex h-6 w-6 items-center justify-center rounded p-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all ${
                          walletNetworkMode === 'testnet'
                            ? 'border border-[#5c7899] bg-[linear-gradient(135deg,#1b2230,#2b435e)] text-slate-100 shadow-[0_8px_20px_rgba(35,74,118,0.18)]'
                            : 'border border-white/10 bg-white/5 text-gray-300 hover:border-cyan-500/40 hover:bg-cyan-500/12 hover:text-white'
                        } ${networkSwitching ? 'cursor-wait opacity-80' : ''}`}
                        title={walletNetworkMode === 'testnet' ? 'Switch to mainnet wallet' : 'Switch to testnet wallet'}
                      >
                        {networkSwitching ? '...' : 'T'}
                      </button>
                      <button 
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <svg className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleWalletPanel('settings')}
                        className="rounded p-1 transition-colors hover:bg-white/5"
                        title="Open settings"
                      >
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative flex-1 min-h-0">
                  <div
                    className={`absolute inset-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isWalletOverview
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-5 pointer-events-none'
                    }`}
                  >
                    <div key={`wallet-overview-${walletNetworkMode}-${walletSurfaceMotionKey}`} className="dashboard-surface-enter flex h-full flex-col justify-center">
                      <div className="flex h-full flex-row items-center gap-3 sm:gap-4 md:gap-6 xl:flex-row xl:items-center">
                          <div className="min-w-0 flex-1 translate-y-[28px] sm:translate-y-[24px] md:translate-y-[16px]">
                          <div className="pl-1 sm:pl-3 md:pl-4">
                            <div className="flex flex-wrap items-end gap-2.5 sm:gap-3 md:gap-4">
                              <span className="text-[2rem] font-bold leading-none text-white font-mono tracking-tight sm:text-4xl md:text-5xl">
                                {balanceVisible ? <RollingBalanceNumber value={formattedDisplayBalance} /> : '••••••'}
                              </span>
                              <div
                                className="relative"
                                onMouseEnter={() => {
                                  if (balanceUnitMenuTimerRef.current) {
                                    window.clearTimeout(balanceUnitMenuTimerRef.current);
                                    balanceUnitMenuTimerRef.current = null;
                                  }
                                  setBalanceUnitMenuOpen(true);
                                }}
                                onMouseLeave={() => {
                                  if (balanceUnitMenuTimerRef.current) {
                                    window.clearTimeout(balanceUnitMenuTimerRef.current);
                                  }
                                  balanceUnitMenuTimerRef.current = window.setTimeout(() => {
                                    setBalanceUnitMenuOpen(false);
                                    balanceUnitMenuTimerRef.current = null;
                                  }, 750);
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (balanceUnitMenuTimerRef.current) {
                                      window.clearTimeout(balanceUnitMenuTimerRef.current);
                                      balanceUnitMenuTimerRef.current = null;
                                    }
                                    setBalanceUnitMenuOpen((current) => !current);
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-lg font-semibold transition-colors sm:text-xl ${
                                    isLight
                                      ? 'text-slate-500 hover:text-slate-900'
                                      : 'text-gray-400 hover:text-white'
                                  }`}
                                >
                                  <span>{balanceDisplayUnit}</span>
                                  <svg className={`h-3.5 w-3.5 transition-transform ${balanceUnitMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                                  </svg>
                                </button>
                                <div
                                  className={`absolute left-0 top-full z-20 mt-2 min-w-[92px] rounded-xl border p-1.5 backdrop-blur transition-all duration-200 ${
                                    isLight
                                      ? 'border-slate-200/80 bg-white/92 shadow-[0_16px_40px_rgba(148,163,184,0.18)]'
                                      : 'border-white/10 bg-black/90 shadow-[0_16px_40px_rgba(0,0,0,0.35)]'
                                  } ${
                                    balanceUnitMenuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
                                  }`}
                                >
                                  {(['INJ', 'USD'] as const).map((unit) => (
                                    <button
                                      key={unit}
                                      type="button"
                                      onClick={() => {
                                        if (balanceUnitMenuTimerRef.current) {
                                          window.clearTimeout(balanceUnitMenuTimerRef.current);
                                          balanceUnitMenuTimerRef.current = null;
                                        }
                                        setBalanceDisplayUnit(unit);
                                        setBalanceUnitMenuOpen(false);
                                      }}
                                      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                                        balanceDisplayUnit === unit
                                          ? isLight
                                            ? 'bg-slate-900/[0.06] text-slate-900'
                                            : 'bg-white/10 text-white'
                                          : isLight
                                            ? 'text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-900'
                                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                      }`}
                                    >
                                      {unit}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2.5 sm:gap-4">
                              <div className="text-sm text-gray-400 font-mono sm:text-base">
                                {balanceVisible ? displaySecondaryBalance : '••••••'}
                              </div>
                              {balanceVisible && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-xs font-semibold sm:text-sm ${totalUsdChangeValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {displayChangeValue}
                                  </span>
                                  <span className={`text-xs sm:text-sm ${portfolioChangePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {portfolioChangePct >= 0 ? '+' : ''}{portfolioChangePct.toFixed(2)}%
                                  </span>
                                  <span className="text-gray-500 text-xs">24h</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="w-[42%] min-w-[132px] max-w-[168px] translate-y-[30px] flex-shrink-0 sm:w-[38%] sm:max-w-[196px] md:w-[320px] md:max-w-none xl:w-[320px] xl:flex-shrink-0">
                          <PixelTrendChart
                            values={assetTrendSeries}
                            hidden={!balanceVisible}
                            changePct={portfolioChangePct}
                            currentValueLabel={totalUsdValue}
                            networkMode={walletNetworkMode}
                            replayKey={assetTrendReplayKey}
                          />
                        </div>
                      </div>

                      <div className="pointer-events-none relative hidden items-center justify-center md:flex md:min-h-[56px] md:flex-[0.62]">
                        <div className="absolute inset-x-12 top-1/2 h-40 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07),transparent_70%)] blur-3xl" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`absolute inset-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isWalletOverview
                        ? 'opacity-0 translate-y-5 pointer-events-none'
                        : 'opacity-100 translate-y-0'
                    }`}
                  >
                    <div className="relative h-full">
                    <div className={`h-full flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      walletPanel === 'send' && showInlineSendAuth
                        ? 'scale-[0.985] blur-[10px] opacity-25'
                        : 'scale-100 blur-0 opacity-100'
                    }`}>
                      <div className="flex items-start justify-between gap-4 border-b border-white/6 pb-4">
                        <div>
                          <div className="text-sm font-bold text-white">{activeWalletPanelMeta?.title}</div>
                          <div className="mt-1 text-xs text-gray-400">{activeWalletPanelMeta?.subtitle}</div>
                        </div>
                        <button
                          onClick={() => setWalletPanel('overview')}
                          className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all"
                          title="Close panel"
                        >
                          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className={`min-h-0 flex-1 ${
                        walletPanel === 'settings'
                          ? 'overflow-hidden pr-0 pt-3'
                          : walletPanel === 'send' || walletPanel === 'receive' || walletPanel === 'swap' || walletPanel === 'history'
                            ? 'overflow-y-auto scrollbar-hide pr-1 pt-3 sm:pr-1'
                            : walletPanel === 'card' || walletPanel === 'chance'
                              ? 'overflow-y-auto scrollbar-hide pr-1 pt-4 sm:overflow-hidden sm:pr-0'
                            : 'overflow-y-auto pt-4 pr-1'
                      }`}>
                        {walletPanel === 'send' && (
                          <div className="grid h-full gap-4 md:grid-cols-[minmax(0,1.12fr)_280px]">
                            <div className="flex min-h-0 flex-col gap-4">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Recipient</span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const text = await navigator.clipboard.readText();
                                        setSendRecipient(text);
                                        setSendError('');
                                      } catch (error) {
                                        console.error('Failed to read clipboard:', error);
                                      }
                                    }}
                                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white"
                                  >
                                    Paste
                                  </button>
                                </div>
                                <input
                                  value={sendRecipient}
                                  onChange={(event) => {
                                    setSendRecipient(event.target.value);
                                    setSendError('');
                                  }}
                                  placeholder="0x... or inj1..."
                                  className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 outline-none font-mono"
                                />
                              </div>

                              <div className="flex-1 rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Amount</span>
                                  <button
                                    onClick={() => {
                                      setSendAmount(tokenBalances.INJ);
                                      setSendError('');
                                    }}
                                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white"
                                  >
                                    Max
                                  </button>
                                </div>
                                <div className="flex h-full flex-col">
                                  <div className={`flex items-end gap-3 ${sendAmountAlertActive ? 'animate-send-amount-shake' : ''}`}>
                                    <input
                                      type="text"
                                      autoComplete="off"
                                      spellCheck={false}
                                      value={sendAmount}
                                      onChange={(event) => {
                                        const nextValue = sanitizeDecimalInput(event.target.value);
                                        setSendAmount(nextValue);
                                        setSendError('');
                                        const nextNumeric = Number(nextValue);
                                        if (nextValue.trim() !== '' && Number.isFinite(nextNumeric) && nextNumeric > sendBalanceValue) {
                                          triggerSendAmountAlert();
                                        }
                                      }}
                                      inputMode="decimal"
                                      placeholder="0.0000"
                                      className={`w-full appearance-none bg-transparent text-3xl font-mono outline-none transition-colors duration-200 selection:bg-transparent selection:text-current [-webkit-text-fill-color:currentColor] md:text-[2.35rem] ${
                                        sendAmountExceedsBalance
                                          ? 'text-[#ff5a6b] placeholder:text-[#ff5a6b]/30'
                                          : 'text-white placeholder:text-gray-600'
                                      }`}
                                    />
                                    <span className={`pb-1.5 text-sm font-semibold transition-colors duration-200 ${
                                      sendAmountExceedsBalance ? 'text-[#ff5a6b]' : 'text-gray-400'
                                    }`}>INJ</span>
                                  </div>

                                  <div className="mt-auto pt-3">
                                    <div className="flex items-center gap-2 text-sm">
                                      <span className="text-gray-500">Available</span>
                                      <span className="font-mono text-white">{tokenBalances.INJ} INJ</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="min-h-[56px]">
                                {sendError ? (
                                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                    {sendError}
                                  </div>
                                ) : sendTxHash ? (
                                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Latest Transfer</div>
                                    <div className="mt-2 text-sm font-mono text-white">{truncateMiddle(sendTxHash, 10, 8)}</div>
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-gray-500">
                                    Review the destination and amount, then confirm the transfer from this card.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/15 p-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Summary</div>
                              <div className="mt-4 space-y-3">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-400">To</span>
                                  <span className="font-mono text-right text-white">{sendRecipient ? truncateMiddle(sendRecipient, 8, 6) : 'Not set'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-400">Amount</span>
                                  <span className="font-mono text-white">{sendAmount || '0.0000'} INJ</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-400">Network</span>
                                  <span className="text-white">{currentNetworkLabel}</span>
                                </div>
                              </div>

                                  <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Gas</div>
                                <div className="mt-3 space-y-3">
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-500">Gas Limit</span>
                                    <span className="font-mono text-white">{sendEstimating && !sendGasEstimate ? 'Estimating...' : sendGasLimitLabel}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-500">Estimated Cost</span>
                                    <span className="font-mono text-white">{sendEstimating && !sendGasEstimate ? 'Estimating...' : sendEstimatedGasLabel}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-auto pt-4">
                                <button
                                  onClick={handleSendAction}
                                  disabled={sendSubmitting || !sendRecipient || !sendAmount}
                                  className="w-full rounded-2xl bg-white py-3.5 font-bold text-black transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {sendSubmitting ? 'Sending...' : 'Send INJ'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {walletPanel === 'receive' && (
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-stretch">
                              <div className="flex h-full items-center justify-center">
                                <div className="rounded-[2rem] bg-white p-4 shadow-2xl">
                                  <QRCodeSVG
                                    value={receiveDisplayAddress || address || ''}
                                    size={180}
                                    level="H"
                                    bgColor="#FFFFFF"
                                    fgColor="#000000"
                                    includeMargin={false}
                                  />
                                </div>
                              </div>

                              <div className="flex h-full min-h-0 flex-col justify-between">
                                <div className="relative p-1 bg-white/5 rounded-2xl border border-white/10">
                                  <div
                                    className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-[0.85rem] bg-white transition-all duration-300 ${
                                      receiveAddressType === 'evm' ? 'left-1' : 'left-[calc(50%+0rem)]'
                                    }`}
                                  />
                                  <div className="relative grid grid-cols-2 gap-2">
                                    <button
                                      onClick={() => setReceiveAddressType('evm')}
                                      className={`rounded-[0.85rem] px-3 py-2.5 text-sm font-bold transition-all ${receiveAddressType === 'evm' ? 'text-black' : 'text-gray-400 hover:text-white'}`}
                                    >
                                      EVM
                                    </button>
                                    <button
                                      onClick={() => setReceiveAddressType('cosmos')}
                                      className={`rounded-[0.85rem] px-3 py-2.5 text-sm font-bold transition-all ${receiveAddressType === 'cosmos' ? 'text-black' : 'text-gray-400 hover:text-white'}`}
                                    >
                                      Cosmos
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Wallet Address</div>
                                  <div className="mt-3 flex items-center gap-3">
                                    <div className="flex-1 overflow-x-auto scrollbar-hide font-mono text-sm text-white whitespace-nowrap">
                                      {receiveDisplayAddress}
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (!receiveDisplayAddress) return;
                                        navigator.clipboard.writeText(receiveDisplayAddress);
                                        setReceiveCopied(true);
                                        setTimeout(() => setReceiveCopied(false), 2000);
                                      }}
                                      className={`flex-shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                                        receiveCopied
                                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                          : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                                      }`}
                                    >
                                      {receiveCopied ? 'Copied' : 'Copy'}
                                    </button>
                                  </div>
                                </div>

                                <div className="grid gap-3 pt-0 sm:grid-cols-2">
                                  <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 text-sm text-gray-300">
                                    Use <span className="text-white">{receiveAddressType === 'evm' ? 'EVM' : 'Cosmos'}</span> format depending on the sender you are receiving from.
                                  </div>
                                  <div className="rounded-2xl border border-yellow-500/15 bg-yellow-500/5 px-4 py-3 text-sm text-gray-300">
                                    Double-check the network before sending assets in. Wrong network deposits may not be recoverable.
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {walletPanel === 'swap' && (
                          <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                            <div className="grid h-full min-h-0 gap-4 md:grid-rows-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
                              <div className="h-full rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Pair</div>
                                <div className="grid h-[calc(100%-1.75rem)] gap-3 md:grid-cols-2">
                                  <div className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">From</div>
                                    <select
                                      value={swapFromToken}
                                      onChange={(event) => {
                                        const nextToken = event.target.value as SwapToken;
                                        setSwapFromToken(nextToken);
                                        if (nextToken === swapToToken) {
                                          setSwapToToken(getAlternateSwapToken(nextToken));
                                        }
                                        setSwapError('');
                                      }}
                                      className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                                    >
                                      {swapTokenOptions.map((token) => (
                                        <option key={`from-${token.symbol}`} value={token.symbol} className="bg-[#0b0b0f] text-white">
                                          {token.symbol} · {token.name}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className="relative h-9 w-9 overflow-hidden rounded-full border border-white/10 bg-white/5">
                                          <Image src={swapFromMeta.icon} alt={swapFromMeta.symbol} fill className={swapFromMeta.symbol === 'LAM' ? 'object-cover object-center' : 'object-contain'} />
                                        </div>
                                        <div>
                                          <div className="text-sm font-semibold text-white">{swapFromMeta.symbol}</div>
                                          <div className="text-xs text-gray-400">{swapFromMeta.name}</div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-sm font-mono text-white">{swapFromMeta.balance}</div>
                                        <div className="text-[11px] text-gray-500">Available</div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">To</div>
                                    <select
                                      value={swapToToken}
                                      onChange={(event) => {
                                        const nextToken = event.target.value as SwapToken;
                                        setSwapToToken(nextToken);
                                        if (nextToken === swapFromToken) {
                                          setSwapFromToken(getAlternateSwapToken(nextToken));
                                        }
                                        setSwapError('');
                                      }}
                                      className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                                    >
                                      {swapTokenOptions.map((token) => (
                                        <option key={`to-${token.symbol}`} value={token.symbol} className="bg-[#0b0b0f] text-white">
                                          {token.symbol} · {token.name}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className="relative h-9 w-9 overflow-hidden rounded-full border border-white/10 bg-white/5">
                                          <Image src={swapToMeta.icon} alt={swapToMeta.symbol} fill className={swapToMeta.symbol === 'LAM' ? 'object-cover object-center' : 'object-contain'} />
                                        </div>
                                        <div>
                                          <div className="text-sm font-semibold text-white">{swapToMeta.symbol}</div>
                                          <div className="text-xs text-gray-400">{swapToMeta.name}</div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-sm font-mono text-white">{swapToMeta.balance}</div>
                                        <div className="text-[11px] text-gray-500">Wallet</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Swap Amount</span>
                                  <button
                                    onClick={() => {
                                      setSwapAmount(swapFromMeta.balance);
                                      setSwapError('');
                                    }}
                                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white"
                                  >
                                    Max
                                  </button>
                                </div>
                                <div className="flex h-full flex-1 flex-col justify-between">
                                  <div className="flex items-end gap-3">
                                    <input
                                      value={swapAmount}
                                      onChange={(event) => {
                                        setSwapAmount(event.target.value);
                                        setSwapError('');
                                      }}
                                      inputMode="decimal"
                                      placeholder="0.0000"
                                      className="w-full bg-transparent text-4xl font-mono text-white placeholder:text-gray-600 outline-none md:text-[2.7rem]"
                                    />
                                    <span className="pb-1.5 text-sm font-semibold text-gray-400">{swapFromToken}</span>
                                  </div>

                                  <div className="pt-4">
                                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Slippage</div>
                                    <div className="flex flex-wrap gap-2">
                                      {['0.5', '1.0', '2.0'].map((value) => (
                                        <button
                                          key={value}
                                          onClick={() => setSwapSlippage(value)}
                                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                                            swapSlippage === value
                                              ? 'bg-white text-black'
                                              : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                          }`}
                                        >
                                          {value}% Slippage
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-black/25 p-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Quote</div>
                              <div className="mt-4 flex h-full flex-1 flex-col">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-400">From</span>
                                    <span className="font-mono text-white">{swapAmount || '0.0000'} {swapFromToken}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-400">Expected Out</span>
                                    <span className="font-mono text-white">
                                      {swapUnavailableOnTestnet
                                        ? 'Unavailable on testnet'
                                        : !swapFromMeta.enabled || !swapToMeta.enabled
                                        ? 'Coming soon'
                                        : swapQuoteLoading
                                          ? 'Quoting...'
                                          : swapQuoteAmount
                                            ? `${Number(swapQuoteAmount).toFixed(4)} ${swapToToken}`
                                            : 'Awaiting input'}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-400">Price Impact</span>
                                    <span className="text-white">{swapPriceImpact}%</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-400">Available</span>
                                    <span className="font-mono text-white">{swapFromMeta.balance} {swapFromToken}</span>
                                  </div>
                                </div>

                                <div className="mt-auto min-h-[88px]">
                                  {swapError ? (
                                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                      {swapError}
                                    </div>
                                  ) : swapTxHash ? (
                                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Latest Swap</div>
                                      <div className="mt-2 text-sm font-mono text-white">{truncateMiddle(swapTxHash, 10, 8)}</div>
                                    </div>
                                  ) : (
                                    <div className="min-h-[88px]" />
                                  )}
                                </div>
                              </div>

                              <div className="mt-auto pt-4">
                                <button
                                  onClick={handleSwapAction}
                                  disabled={swapUnavailableOnTestnet || swapSubmitting || !swapAmount || swapFromToken === swapToToken || !swapFromMeta.enabled || !swapToMeta.enabled}
                                  className="w-full rounded-2xl bg-white py-3.5 font-bold text-black transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {swapUnavailableOnTestnet
                                    ? 'Swap Unavailable on Testnet'
                                    : swapSubmitting
                                      ? 'Swapping...'
                                      : !swapFromMeta.enabled || !swapToMeta.enabled
                                        ? 'LAM Swap Coming Soon'
                                        : `Swap to ${swapToMeta.symbol}`}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {walletPanel === 'history' && (
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="flex flex-wrap gap-2">
                              {(['all', 'send', 'receive', 'swap'] as DashboardHistoryFilter[]).map((filter) => (
                                <button
                                  key={filter}
                                  onClick={() => setHistoryFilter(filter)}
                                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                                    historyFilter === filter
                                      ? 'bg-white text-black'
                                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                  }`}
                                >
                                  {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </button>
                              ))}
                            </div>

                            {historyError && (
                              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                {historyError}
                              </div>
                            )}

                            <div className="mt-5 flex min-h-0 flex-1 flex-col">
                              {historyLoading ? (
                                <div className="flex flex-1 items-center justify-center">
                                  <div className="w-10 h-10 rounded-full border-4 border-white/10 border-t-white animate-spin" />
                                </div>
                              ) : filteredHistoryItems.length === 0 ? (
                                <div className="flex flex-1 items-center justify-center text-center text-sm text-gray-400">
                                  No transactions yet. Your recent wallet activity will appear here.
                                </div>
                              ) : (
                                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-hide">
                                  {filteredHistoryItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white capitalize">{item.type}</span>
                                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                                              {item.chainType}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-sm text-gray-400">{item.address}</div>
                                          <div className="mt-2 text-xs text-gray-500">{formatDashboardTimestamp(item.timestamp)}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-sm font-mono text-white">{item.amount} {item.token}</div>
                                          <div className={`mt-1 text-xs font-semibold ${
                                            item.status === 'completed'
                                              ? 'text-emerald-300'
                                              : item.status === 'failed'
                                                ? 'text-red-300'
                                                : 'text-amber-300'
                                          }`}>
                                            {item.status}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {walletPanel === 'card' && (
                          <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(0,1.1fr)_280px]">
                            <div className="flex min-h-0 flex-col gap-4">
                              <div className="relative rounded-2xl border border-white/10 bg-white/5 p-1">
                                <div
                                  className={`absolute bottom-1 top-1 w-[calc(50%-0.25rem)] rounded-[0.85rem] bg-white transition-all duration-300 ${
                                    cardPanelTab === 'pay' ? 'left-1' : 'left-[calc(50%+0rem)]'
                                  }`}
                                />
                                <div className="relative grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => {
                                      setCardPanelTab('pay');
                                      setCardScanData(null);
                                      setCardScanError('');
                                      setCardScanState('idle');
                                    }}
                                    className={`rounded-[0.85rem] px-3 py-2.5 text-sm font-bold transition-all ${
                                      cardPanelTab === 'pay' ? 'text-black' : 'text-gray-400 hover:text-white'
                                    }`}
                                  >
                                    Pay
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCardPanelTab('cards');
                                      loadBoundCards();
                                    }}
                                    className={`rounded-[0.85rem] px-3 py-2.5 text-sm font-bold transition-all ${
                                      cardPanelTab === 'cards' ? 'text-black' : 'text-gray-400 hover:text-white'
                                    }`}
                                  >
                                    Cards
                                  </button>
                                </div>
                              </div>

                              {cardPanelTab === 'pay' ? (
                                <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/25 p-5">
                                  <div className="flex h-full flex-col items-center justify-center text-center">
                                    <div className="mb-6 flex items-center justify-center gap-6">
                                      <div className="relative">
                                        <div className="flex h-36 w-56 items-center justify-between rounded-[1.75rem] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
                                          <div className="flex h-full flex-col justify-between text-left">
                                            <div className="h-10 w-12 rounded bg-gradient-to-br from-cyan-300/20 to-blue-500/10" />
                                            <div>
                                              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Pass Card</div>
                                              <div className="mt-2 h-3 w-24 rounded bg-white/8" />
                                              <div className="mt-2 h-2.5 w-16 rounded bg-white/6" />
                                            </div>
                                          </div>
                                          <svg className="h-8 w-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0" />
                                          </svg>
                                        </div>
                                      </div>
                                      {cardScanState === 'scanning' && (
                                        <div className="flex flex-col gap-3">
                                          <span className="h-2.5 w-2.5 rounded-full bg-white/90 animate-pulse" />
                                          <span className="h-2.5 w-2.5 rounded-full bg-white/70 animate-pulse [animation-delay:160ms]" />
                                          <span className="h-2.5 w-2.5 rounded-full bg-white/50 animate-pulse [animation-delay:320ms]" />
                                        </div>
                                      )}
                                    </div>

                                    {cardScanState === 'success' ? (
                                      <>
                                        <h4 className="text-lg font-bold text-white">Card Ready</h4>
                                        <p className="mt-2 max-w-md text-sm text-gray-400">
                                          Card address detected. You can inject it straight into the dashboard send flow.
                                        </p>

                                        <div className="mt-5 w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left">
                                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Card Address</div>
                                          <div className="mt-2 break-all font-mono text-sm text-white">{cardScanData?.address}</div>
                                          {cardScanData?.uid && (
                                            <div className="mt-4 border-t border-white/6 pt-3">
                                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Card UID</div>
                                              <div className="mt-2 font-mono text-xs text-gray-400">{cardScanData.uid}</div>
                                            </div>
                                          )}
                                        </div>

                                        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                                          <button
                                            onClick={() => {
                                              if (!cardScanData?.address) return;
                                              setSendRecipient(cardScanData.address);
                                              setSendError('');
                                              setWalletPanel('send');
                                            }}
                                            className="rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition-all hover:bg-gray-100"
                                          >
                                            Send to This Card
                                          </button>
                                          <button
                                            onClick={() => {
                                              setCardScanData(null);
                                              setCardScanError('');
                                              setCardScanState('idle');
                                            }}
                                            className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-200 transition-all hover:bg-white/10 hover:text-white"
                                          >
                                            Scan Another
                                          </button>
                                          <button
                                            onClick={() => {
                                              setCardPanelTab('cards');
                                              loadBoundCards();
                                            }}
                                            className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-200 transition-all hover:bg-white/10 hover:text-white"
                                          >
                                            Manage Cards
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <h4 className="text-lg font-bold text-white">
                                          {cardScanState === 'scanning' ? 'Scanning...' : cardScanState === 'error' ? 'Scan Interrupted' : 'Ready to Scan'}
                                        </h4>
                                        <p className="mt-2 max-w-md text-sm text-gray-400">
                                          {cardScanState === 'error'
                                            ? cardScanError
                                            : cardScanState === 'scanning'
                                              ? 'Hold your phone steady near the card. Once the scan completes, its address can be injected directly into Send.'
                                              : 'Tap a bound NFC card to your device to start a direct card-pay flow.'}
                                        </p>

                                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                                          <button
                                            onClick={() => {
                                              setCardScanData(null);
                                              setCardScanError('');
                                              setCardScanState('idle');
                                            }}
                                            className="rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition-all hover:bg-gray-100"
                                          >
                                            {cardScanState === 'error' ? 'Retry Scan' : cardScanState === 'scanning' ? 'Restart Scan' : 'Start Scan'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setCardPanelTab('cards');
                                              loadBoundCards();
                                            }}
                                            className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-200 transition-all hover:bg-white/10 hover:text-white"
                                          >
                                            Open Cards
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-2">
                                  <div className="h-full overflow-hidden rounded-[1.35rem] border border-white/8 bg-black">
                                    <DashboardSurfaceFrame
                                      src="/cards?embed=1&entry=dashboard-card"
                                      title="Embedded cards manager"
                                      loadingStrategy="eager"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex min-h-0 flex-col gap-4">
                              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Cards</div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Bound</div>
                                    <div className="mt-2 text-2xl font-bold text-white">{boundCards.length}</div>
                                  </div>
                                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Active</div>
                                    <div className="mt-2 text-2xl font-bold text-white">{activeBoundCards.length}</div>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Flow</div>
                                <div className="mt-3 space-y-2 text-sm text-gray-300">
                                  <p>1. Scan a card with NFC.</p>
                                  <p>2. Inject its address into Send.</p>
                                  <p>3. Manage or bind cards in the Cards view.</p>
                                </div>
                              </div>

                              <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/25 p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Recent Cards</div>
                                  <button
                                    onClick={loadBoundCards}
                                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white"
                                  >
                                    Refresh
                                  </button>
                                </div>

                                <div className="mt-4 flex-1 space-y-3">
                                  {recentBoundCards.length === 0 ? (
                                    <div className="flex h-full items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-center text-sm text-gray-500">
                                      No bound cards yet. Open Cards to bind and manage your NFC set.
                                    </div>
                                  ) : (
                                    recentBoundCards.map((card) => (
                                      <div key={card.uid} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <div className="truncate text-sm font-bold text-white">{card.name}</div>
                                            <div className="mt-1 text-xs font-mono text-gray-400">{card.cardNumber}</div>
                                          </div>
                                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                            card.isActive ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border border-white/10 bg-white/[0.04] text-gray-400'
                                          }`}>
                                            {card.isActive ? 'Active' : 'Frozen'}
                                          </span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>

                                <div className="mt-4 space-y-3">
                                  <button
                                    onClick={() => setCardPanelTab('cards')}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10"
                                  >
                                    Manage Cards
                                  </button>
                                  {cardScanData?.address && (
                                    <button
                                      onClick={() => {
                                        setSendRecipient(cardScanData.address || '');
                                        setSendError('');
                                        setWalletPanel('send');
                                      }}
                                      className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-black transition-all hover:bg-gray-100"
                                    >
                                      Send to Latest Card
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {walletPanel === 'chance' && (
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="grid flex-1 gap-4 md:grid-cols-3">
                              {MORE_CHANCE_PLANS.map((plan) => {
                                const isSelected = selectedChancePlan === plan.id;

                                return (
                                  <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => setSelectedChancePlan(plan.id)}
                                    className={`flex h-full min-h-[220px] flex-col rounded-[1.65rem] border px-5 py-5 text-left transition-all ${
                                      isSelected
                                        ? `${plan.surfaceClass} shadow-[0_18px_44px_rgba(15,23,42,0.18)]`
                                        : 'border-white/10 bg-black/20 hover:bg-white/[0.04]'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${isSelected ? plan.accentClass : 'text-gray-500'}`}>
                                          {plan.name}
                                        </div>
                                        <div className="mt-3 text-4xl font-bold text-white">{plan.chances}</div>
                                        <div className="mt-1 text-sm text-gray-400">extra chances</div>
                                      </div>
                                      <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                        isSelected ? 'border-white/12 bg-white/10 text-white' : 'border-white/8 bg-white/[0.03] text-gray-400'
                                      }`}>
                                        {isSelected ? 'Selected' : 'Choose'}
                                      </div>
                                    </div>

                                    <p className="mt-auto pt-8 text-sm leading-6 text-gray-400">
                                      {plan.blurb}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Selected Pack</div>
                                  <div className="mt-2 text-lg font-bold text-white">
                                    {MORE_CHANCE_PLANS.find((plan) => plan.id === selectedChancePlan)?.name} · {MORE_CHANCE_PLANS.find((plan) => plan.id === selectedChancePlan)?.chances} chances
                                  </div>
                                  <div className="mt-1 text-sm text-gray-400">
                                    Price: {formatEther(MORE_CHANCE_PLANS.find((plan) => plan.id === selectedChancePlan)?.priceWei ?? BigInt(0))} INJ
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleChanceAction}
                                  disabled={chanceSubmitting}
                                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {chanceSubmitting ? 'Submitting...' : 'Continue'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push('/cat-mint')}
                                  className="rounded-2xl border border-orange-300/20 bg-orange-300/10 px-5 py-3 text-sm font-semibold text-orange-100 transition-all hover:bg-orange-300/20"
                                >
                                  Mint NFT
                                </button>
                              </div>
                              {chanceError && (
                                <div className="mt-3 text-sm text-rose-300">{chanceError}</div>
                              )}
                              {chanceTxHash && (
                                <a
                                  href={`${currentNetworkMeta.chain.explorerUrl}/tx/${chanceTxHash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300 hover:text-emerald-200"
                                >
                                  View purchase tx
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {walletPanel === 'settings' && (
                          <SettingsPage embeddedOverride />
                        )}
                      </div>
                    </div>

                    {walletPanel === 'send' && (
                      <TransactionAuthModal
                        isOpen={showInlineSendAuth}
                        onClose={handleInlineSendAuthClose}
                        onSuccess={handleInlineSendAuthSuccess}
                        transactionType="send"
                        variant="inline"
                      />
                    )}
                    </div>
                  </div>
                </div>

                {isWalletOverview && (
                <div className="mt-auto grid grid-cols-4 gap-2 pt-4 sm:gap-3">
                  {/* Send Button */}
                  <button 
                    onClick={() => toggleWalletPanel('send')}
                    className="flex flex-col items-center gap-1 group sm:gap-2"
                  >
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-white shadow-lg transition-all hover:bg-gray-100 group-hover:scale-105 sm:h-14 sm:w-14">
                      <svg className="h-3.5 w-3.5 text-black sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <line x1="12" y1="19" x2="12" y2="5" strokeWidth={2.5} strokeLinecap="round" />
                        <polyline points="5 12 12 5 19 12" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-300 transition-colors group-hover:text-white">Send</span>
                  </button>

                  {/* Receive Button */}
                  <button 
                    onClick={() => toggleWalletPanel('receive')}
                    className="flex flex-col items-center gap-1 group sm:gap-2"
                  >
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-white shadow-lg transition-all hover:bg-gray-100 group-hover:scale-105 sm:h-14 sm:w-14">
                      <svg className="h-3.5 w-3.5 text-black sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <line x1="12" y1="5" x2="12" y2="19" strokeWidth={2.5} strokeLinecap="round" />
                        <polyline points="19 12 12 19 5 12" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-300 transition-colors group-hover:text-white">Receive</span>
                  </button>

                  {/* Swap Button */}
                  <button 
                    onClick={() => toggleWalletPanel('swap')}
                    className="flex flex-col items-center gap-1 group sm:gap-2"
                  >
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-white shadow-lg transition-all hover:bg-gray-100 group-hover:scale-105 sm:h-14 sm:w-14">
                      <svg className="h-3.5 w-3.5 text-black sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <polyline points="16 3 21 3 21 8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="4" y1="20" x2="21" y2="3" strokeWidth={2.5} strokeLinecap="round" />
                        <polyline points="21 16 21 21 16 21" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="15" y1="15" x2="21" y2="21" strokeWidth={2.5} strokeLinecap="round" />
                        <line x1="4" y1="4" x2="9" y2="9" strokeWidth={2.5} strokeLinecap="round" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-300 transition-colors group-hover:text-white">Swap</span>
                  </button>

                  {/* History Button */}
                  <button 
                    onClick={() => toggleWalletPanel('history')}
                    className="flex flex-col items-center gap-1 group sm:gap-2"
                  >
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-white shadow-lg transition-all hover:bg-gray-100 group-hover:scale-105 sm:h-14 sm:w-14">
                      <svg className="h-3.5 w-3.5 text-black sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth={2.5} strokeLinecap="round" />
                        <polyline points="12 6 12 12 16 14" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-300 transition-colors group-hover:text-white">History</span>
                  </button>
                </div>
                )}
              </div>
            </div>
              </div>

              <div
                className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isAiStage
                    ? 'translate-x-0 scale-100 opacity-100'
                    : 'pointer-events-none translate-x-[calc(100%+1.25rem)] scale-[0.94] opacity-0'
                }`}
              >
                <div className="bg-black rounded-2xl border border-white/10 relative overflow-hidden p-3 sm:p-4 md:p-5 h-full flex flex-col">
                  <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-gradient-to-tr from-cyan-500/5 to-transparent blur-2xl" />
                  {renderCompactAssetSurface('left')}
                </div>
              </div>
            </div>

            <div className={`relative ${assetStageClassName}`}>
              <div
                className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isAiStage || isFaucetStage
                    ? 'pointer-events-none translate-x-10 scale-[0.96] opacity-0'
                    : isCardPanel
                      ? 'translate-x-6 scale-[0.97] opacity-100'
                    : 'translate-x-0 scale-100 opacity-100'
                }`}
              >
            <div className="bg-black rounded-2xl border border-white/10 relative overflow-hidden p-3 sm:p-4 md:p-5 h-full flex flex-col">
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-cyan-500/5 to-transparent rounded-full blur-2xl"></div>
              {isCardPanel ? (
                renderCompactAssetSurface('right')
              ) : (
              <div key={`asset-surface-${walletNetworkMode}-${assetSurfaceMotionKey}`} className="dashboard-surface-enter relative flex min-h-0 flex-1 flex-col">
        {/* Asset Tabs - Smooth Sliding Background */}
        <div className="relative mb-3 rounded-xl bg-white/5 p-1 sm:mb-4">
          {/* Sliding Background */}
          <div 
            className="absolute top-1 bottom-1 bg-white rounded-lg transition-all duration-300 ease-out shadow-lg"
            style={{
              width: 'calc((100% - 1.5rem) / 4)',
              left: `calc(0.25rem + ${assetTabIndex} * ((100% - 1.5rem) / 4 + 0.5rem))`,
            }}
          />
          
          {/* Tab Buttons */}
          <div className="relative flex gap-2">
            <button 
              onClick={() => setAssetTab('tokens')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 px-1.5 rounded-lg font-bold text-[11px] transition-all duration-300 sm:gap-1.5 sm:px-4 sm:py-3 sm:text-sm ${
                assetTab === 'tokens' 
                  ? 'text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth={2} />
                <path d="M12 6v12M6 12h12" strokeWidth={2} strokeLinecap="round" />
              </svg>
              <span>Tokens</span>
            </button>
            <button 
              onClick={() => setAssetTab('nfts')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 px-1.5 rounded-lg font-bold text-[11px] transition-all duration-300 sm:gap-1.5 sm:px-4 sm:py-3 sm:text-sm ${
                assetTab === 'nfts' 
                  ? 'text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" strokeWidth={2} />
                <path d="M9 3v18M3 9h18" strokeWidth={2} strokeLinecap="round" />
              </svg>
              <span>NFTs</span>
            </button>
            <button 
              onClick={() => setAssetTab('defi')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 px-1.5 rounded-lg font-bold text-[11px] transition-all duration-300 sm:gap-1.5 sm:px-4 sm:py-3 sm:text-sm ${
                assetTab === 'defi' 
                  ? 'text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>DeFi</span>
            </button>
            <button 
              onClick={() => setAssetTab('earn')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 px-1.5 rounded-lg font-bold text-[11px] transition-all duration-300 sm:gap-1.5 sm:px-4 sm:py-3 sm:text-sm ${
                assetTab === 'earn' 
                  ? 'text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18M7.5 7.5h5.25a2.75 2.75 0 010 5.5h-1.5a2.75 2.75 0 000 5.5H17" />
              </svg>
              <span>Earn</span>
            </button>
          </div>
        </div>

        {/* Asset List */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-0 sm:pr-1">
          {assetTab === 'tokens' && (
            <div className="space-y-3 pb-4">
              {dashboardTokenCards.map((token) => (
                <div key={token.symbol} className="relative" style={{ perspective: '1400px' }}>
                  <div
                    onClick={() => setFlippedTokenCard((current) => (current === token.symbol ? null : token.symbol))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setFlippedTokenCard((current) => (current === token.symbol ? null : token.symbol));
                      }
                    }}
                    className="relative h-[76px] w-full cursor-pointer text-left sm:h-[84px]"
                    role="button"
                    tabIndex={0}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <div
                      className={`absolute inset-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 transition-all duration-500 [backface-visibility:hidden] sm:px-4 sm:py-3 ${
                        flippedTokenCard === token.symbol ? 'pointer-events-none invisible z-0 opacity-0' : 'visible z-10 opacity-100'
                      }`}
                      style={{
                        transform: flippedTokenCard === token.symbol ? 'rotateY(180deg)' : 'rotateY(0deg)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                      }}
                    >
                      <div className="flex h-full items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full sm:h-10 sm:w-10">
                          <Image
                            src={token.icon}
                            alt={token.symbol}
                            width={40}
                            height={40}
                            className={token.symbol === 'LAM' ? 'h-full w-full rounded-full object-cover object-center' : 'h-full w-full object-contain'}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-1.5">
                            <div className="text-sm font-bold sm:text-base">{token.symbol}</div>
                          </div>
                          <div className="text-[12px] text-gray-400 sm:text-[13px]">{token.balance}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold font-mono text-[12px] sm:text-[13px]">{token.usdValue}</div>
                          <div className={`text-[12px] sm:text-[13px] ${token.changeClass}`}>{token.change}</div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`absolute inset-0 rounded-2xl border px-3 py-2.5 transition-all duration-500 sm:px-4 sm:py-3 ${
                        isLight
                          ? 'border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,255,0.92))] shadow-[0_12px_26px_rgba(148,163,184,0.12)]'
                          : 'border-white/10 bg-[linear-gradient(180deg,rgba(8,10,18,0.98),rgba(10,13,20,0.96))]'
                      } ${
                        flippedTokenCard === token.symbol ? 'visible z-20 opacity-100' : 'pointer-events-none invisible z-0 opacity-0'
                      }`}
                      style={{
                        transform: flippedTokenCard === token.symbol ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                        transformStyle: 'preserve-3d',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                      }}
                    >
                      <div className="flex h-full items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full sm:h-10 sm:w-10">
                          <Image
                            src={token.icon}
                            alt={token.symbol}
                            width={40}
                            height={40}
                            className={token.symbol === 'LAM' ? 'h-full w-full rounded-full object-cover object-center' : 'h-full w-full object-contain'}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`mb-0.5 text-sm font-bold sm:text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>{token.symbol}</div>
                          <div className={`mb-0.5 text-[9px] uppercase tracking-[0.14em] ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>Contract</div>
                          <div className={`truncate font-mono text-[12px] sm:text-[13px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {token.contractValue}
                          </div>
                        </div>
                          {token.copyValue ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!token.copyValue) return;
                                navigator.clipboard.writeText(token.copyValue);
                                setCopiedTokenInfo(token.symbol);
                                setTimeout(() => {
                                  setCopiedTokenInfo((current) => (current === token.symbol ? null : current));
                                }, 1600);
                              }}
                              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all ${
                                copiedTokenInfo === token.symbol
                                  ? isLight
                                    ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700'
                                    : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                  : isLight
                                    ? 'border-slate-200/80 bg-slate-900/[0.03] text-slate-700 hover:bg-slate-900/[0.06]'
                                    : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                              }`}
                            >
                              {copiedTokenInfo === token.symbol ? 'Copied' : 'Copy'}
                            </button>
                          ) : token.symbol === 'LAM' ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setFlippedTokenCard(null);
                                openMoreChancePanel();
                              }}
                              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all ${
                                isLight
                                  ? 'border-slate-200/80 bg-slate-900/[0.03] text-slate-700 hover:bg-slate-900/[0.06]'
                                  : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                              }`}
                            >
                              Buy
                            </button>
                          ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {assetTab === 'nfts' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => router.push('/cat-mint')}
                className="flex w-full items-center gap-3 rounded-2xl border border-orange-300/20 bg-orange-300/[0.08] p-3 text-left transition-all hover:bg-orange-300/[0.14] sm:p-4"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-orange-300 to-amber-400 text-xl shadow-lg shadow-orange-500/10">
                  😺
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white">Mint Scribble Cyber Cat</div>
                  <div className="mt-0.5 text-xs text-orange-100/65">Use one mint credit from LAM chance purchases</div>
                </div>
                <svg className="h-5 w-5 shrink-0 text-orange-100/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {nftsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
              ) : nfts.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" strokeWidth={2} />
                      <path d="M9 3v18M3 9h18" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold mb-1">No NFTs found</p>
                  <p className="text-xs text-gray-500">You don&apos;t own any N1NJ4 NFTs yet</p>
                  <button
                    onClick={() => router.push('/cat-mint')}
                    className="mt-5 inline-flex items-center justify-center rounded-full border border-orange-300/20 bg-orange-300/10 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-300/20"
                  >
                    Open Cat Mint
                  </button>
                </div>
              ) : (
                <>
                  {nfts.map((nft) => (
                    <div 
                      key={`${nft.contractAddress}-${nft.tokenId}`}
                      onClick={() => setSelectedNFT(nft)}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition-all cursor-pointer hover:bg-white/10 sm:gap-4 sm:p-4"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg">
                        {nft.image ? (
                          <Image 
                            src={nft.image} 
                            alt={nft.name} 
                            width={48} 
                            height={48}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" strokeWidth={2} />
                            <path d="M9 3v18M3 9h18" strokeWidth={2} strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold mb-1">{nft.name}</div>
                        <div className="text-sm text-gray-400">#{nft.tokenId}</div>
                      </div>
                      <div className="text-right">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {assetTab === 'defi' && (
            <div className="space-y-3">
              {stakingLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
              ) : stakingInfo && parseFloat(stakingInfo.totalStaked) > 0 ? (
                <>
                  {/* Staking Position */}
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition-all cursor-pointer hover:bg-white/10 sm:gap-4 sm:p-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden">
                      <Image
                        src="/injswap.png"
                        alt="INJ"
                        width={48}
                        height={48}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold mb-1">Staking</div>
                      <div className="text-sm text-gray-400">{stakingInfo.totalStaked} INJ</div>
                      <div className="text-xs text-gray-500 mt-1">APR: {stakingInfo.stakingApr}%</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold font-mono">${stakingInfo.totalStakedUsd}</div>
                      <div className={`text-sm ${injPriceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {injPriceChange24h >= 0 ? '+' : ''}{injPriceChange24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Staking Rewards */}
                  {parseFloat(stakingInfo.rewards) > 0 && (
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition-all cursor-pointer hover:bg-white/10 sm:gap-4 sm:p-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-2xl shadow-lg">
                        💰
                      </div>
                      <div className="flex-1">
                        <div className="font-bold mb-1">Staking Rewards</div>
                        <div className="text-sm text-gray-400">{stakingInfo.rewards} INJ</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold font-mono">${stakingInfo.rewardsUsd}</div>
                        <div className="text-sm text-green-400">Claimable</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 text-gray-500">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold mb-1">No DeFi Positions</p>
                  <p className="text-xs text-gray-500">Your DeFi positions and activities will appear here</p>
                </div>
              )}
            </div>
          )}

          {assetTab === 'earn' && (
            <div className="flex h-full items-start justify-center">
              <div className="h-full w-full max-w-[760px]">
                <NinjaMinerGame walletAddress={address} onOpenMoreChance={openMoreChancePanel} />
              </div>
            </div>
          )}
        </div>
      </div>
              )}
            </div>
              </div>

              <div
                className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isFaucetStage
                    ? 'translate-x-0 scale-100 opacity-100'
                    : 'pointer-events-none translate-x-10 scale-[0.98] opacity-0'
                }`}
              >
                <div className="bg-black rounded-2xl border border-white/10 relative overflow-hidden h-full flex flex-col p-4 sm:p-5">
                  <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-gradient-to-tr from-cyan-500/8 to-transparent blur-2xl" />
                  <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-gradient-to-bl from-violet-500/8 to-transparent blur-2xl" />
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    <div className="relative mb-4 rounded-xl bg-white/5 p-1">
                      <div
                        className="absolute h-[calc(100%-0.5rem)] rounded-lg bg-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{
                          width: 'calc((100% - 0.5rem) / 2)',
                          left: faucetCategory === 'popular'
                            ? '0.25rem'
                            : 'calc(0.25rem + (100% - 0.5rem) / 2)',
                        }}
                      />
                      <div className="relative flex gap-2">
                        <button
                          onClick={() => setFaucetCategory('popular')}
                          className={`flex-1 rounded-lg px-3 py-3 text-xs font-bold transition-all duration-300 sm:text-sm ${
                            faucetCategory === 'popular' ? 'text-black' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Popular
                        </button>
                        <button
                          onClick={() => setFaucetCategory('others')}
                          className={`flex-1 rounded-lg px-3 py-3 text-xs font-bold transition-all duration-300 sm:text-sm ${
                            faucetCategory === 'others' ? 'text-black' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Others
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2.5">
                      {filteredFaucetCards.map((token) => {
                        const isClaiming = faucetClaimingId === token.id;
                        const isClaimed = faucetClaimLocked && faucetClaimedId === token.id;
                        const isLocked = faucetClaimLocked && faucetClaimedId !== token.id;

                        return (
                          <button
                            key={token.id}
                            onClick={() => void handleFaucetTokenClaim(token.id)}
                            disabled={isClaiming || faucetClaimLocked || !address}
                            className={`flex h-[76px] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all sm:h-[84px] sm:px-4 sm:py-3 ${
                              isClaimed
                                ? 'border-slate-500/20 bg-slate-500/10 text-gray-400'
                                : isLocked
                                  ? 'border-white/6 bg-white/[0.02] text-gray-500 opacity-45 grayscale'
                                  : isClaiming
                                    ? 'border-cyan-400/20 bg-cyan-500/10 text-white'
                                    : 'border-white/10 bg-white/5 text-white hover:bg-white/[0.08] hover:border-white/18'
                            } ${!address ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full sm:h-10 sm:w-10">
                              <Image
                                src={token.icon}
                                alt={token.label}
                                width={40}
                                height={40}
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 text-sm font-bold sm:text-base">{token.label}</div>
                              <div className={`${isClaimed || isLocked ? 'text-gray-500' : 'text-gray-400'} text-[12px] sm:text-[13px]`}>
                                {token.amountLabel}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-bold font-mono text-[12px] sm:text-[13px] ${
                                isClaimed || isLocked ? 'text-gray-500' : 'text-white'
                              }`}>
                                {isClaiming ? '...' : isClaimed ? 'Claimed' : isLocked ? 'Locked' : 'Claim'}
                              </div>
                              <div className={`text-[12px] sm:text-[13px] ${
                                isClaimed
                                  ? 'text-gray-500'
                                  : isLocked
                                    ? 'text-gray-600'
                                    : isClaiming
                                      ? 'text-cyan-300'
                                      : 'text-green-400'
                              }`}>
                                {isClaiming ? 'Processing' : isClaimed ? 'Done' : isLocked ? 'Unavailable' : 'Ready'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {faucetError && (
                      <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {faucetError}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isAiStage
                    ? 'translate-x-0 scale-100 opacity-100'
                    : 'pointer-events-none translate-x-10 scale-[0.98] opacity-0'
                }`}
              >
                <div className="bg-black rounded-2xl relative overflow-hidden h-full">
                  <div className="relative h-full overflow-hidden">
                    <DashboardSurfaceFrame
                      src="/agents?embed=1&compact=1"
                      title="Embedded asset agent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black p-4 sm:p-5">
              <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-gradient-to-tr from-cyan-500/5 to-transparent blur-2xl" />
              <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-gradient-to-bl from-violet-500/5 to-transparent blur-2xl" />

              <div className="relative">
                <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
                  <div className="relative h-[248px] overflow-hidden rounded-[1.35rem] bg-black sm:h-[228px] lg:h-[210px]">
                    <div
                      className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isAiStage
                          ? 'pointer-events-none -translate-x-10 scale-[0.98] opacity-0'
                          : 'translate-x-0 scale-100 opacity-100'
                      }`}
                    >
                      <DashboardSurfaceFrame
                        src="/discover?embed=1"
                        title="Embedded discover"
                        className="bg-black"
                        loadingStrategy="eager"
                      />
                    </div>

                    <div
                      className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isAiStage
                          ? 'translate-x-0 scale-100 opacity-100'
                          : 'pointer-events-none translate-x-10 scale-[0.98] opacity-0'
                      }`}
                    >
                      <DashboardSurfaceFrame
                        src="/discover?embed=1&mode=ai"
                        title="Embedded AI discover"
                        className="bg-black"
                        loadingStrategy="eager"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>

      <TransactionAuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setPendingAuthAction(null);
          setPostAuthAction(null);
        }}
        onSuccess={handleTransactionAuthSuccess}
        transactionType={pendingAuthAction ?? 'send'}
      />

      {/* NFT Detail Modal */}
      {selectedNFT && (
        <NFTDetailModal 
          nft={selectedNFT} 
          onClose={() => setSelectedNFT(null)} 
        />
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div 
          className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-200 px-4 ${closingQRScanner ? 'opacity-0' : 'opacity-100'}`}
          onClick={closeQRScanner}
        >
          <div 
            className={`bg-black border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden ${
              closingQRScanner ? 'slide-down' : 'slide-up'
            }`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '85vh' }}
          >
            {/* Header - Compact */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Scan QR Code</h3>
                  <p className="text-gray-400 text-xs">Point camera at wallet address</p>
                </div>
                <button
                  onClick={closeQRScanner}
                  className="p-2 rounded-xl hover:bg-white/10 transition-all"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Scanner Body - Compact */}
            <div className="p-4 flex flex-col items-center justify-center" style={{ minHeight: '320px' }}>
              {showMyQR ? (
                <>
                  {/* Show My QR Code - Compact */}
                  <div className="text-center mb-3">
                    <h4 className="text-sm font-bold text-white mb-1">My Wallet Address</h4>
                    <p className="text-gray-400 text-xs">Let others scan this code</p>
                  </div>

                  {/* QR Code - Smaller */}
                  <div className="bg-white p-4 rounded-xl mb-3">
                    <QRCodeSVG 
                      value={address || ''} 
                      size={200}
                      level="H"
                      includeMargin={true}
                    />
                  </div>

                  {/* Address Display - Compact */}
                  <div className="w-full">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                      <span className="text-xs font-mono text-white truncate mr-2">
                        {address?.slice(0, 10)}...{address?.slice(-8)}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(address || '');
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-all flex-shrink-0"
                      >
                        {copied ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                            <rect width="11" height="11" x="4" y="4" rx="1" ry="1" strokeWidth="1.5" />
                            <path d="M2 10c-0.8 0-1.5-0.7-1.5-1.5V2c0-0.8 0.7-1.5 1.5-1.5h8.5c0.8 0 1.5 0.7 1.5 1.5" strokeWidth="1.5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : !qrSuccess && !qrError ? (
                <>
                  {/* QR Scanner Video - Compact */}
                  <div className="relative w-full mb-4">
                    <div 
                      id="qr-reader" 
                      className="rounded-xl overflow-hidden border-2 border-white/20"
                      style={{ width: '100%' }}
                    />
                    
                    {/* Scanning overlay */}
                    {qrScanning && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-white/50 rounded-xl animate-pulse" />
                      </div>
                    )}
                  </div>
                  
                  <h4 className="text-sm font-bold text-white mb-1">
                    {qrScanning ? 'Scanning...' : 'Initializing Camera...'}
                  </h4>
                  <p className="text-gray-400 text-xs text-center">
                    {qrScanning ? 'Point camera at QR code' : 'Please allow camera access'}
                  </p>
                </>
              ) : qrSuccess ? (
                <>
                  {/* Success Animation - Compact */}
                  <div className="relative mb-4 flex items-center justify-center w-32 h-32">
                    {/* Glow rings - Smaller */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-32 h-32 rounded-full border-2 border-white/30 animate-ping"></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-28 h-28 rounded-full border-2 border-white/40 animate-ping" style={{ animationDelay: '0.15s' }}></div>
                    </div>
                    
                    {/* Success circle - Smaller */}
                    <div className="relative w-20 h-20 rounded-full bg-white flex items-center justify-center success-bounce shadow-2xl">
                      <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-bold text-white mb-1">QR Code Scanned!</h4>
                  <p className="text-gray-400 text-xs text-center mb-3">Redirecting to send page...</p>
                  <div className="text-xs font-mono text-gray-500 bg-white/5 px-3 py-2 rounded-lg">
                    {scannedAddress.slice(0, 8)}...{scannedAddress.slice(-6)}
                  </div>
                </>
              ) : (
                <>
                  {/* Error State - Compact */}
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Scan Failed</h4>
                  <p className="text-red-400 text-xs text-center mb-4">{qrError}</p>
                  <button
                    onClick={() => {
                      setQrError('');
                      openQRScanner();
                    }}
                    className="px-6 py-2.5 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all shadow-lg text-sm"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>

            {/* Bottom Action - Toggle to My QR - Compact */}
            <div className="p-3 border-t border-white/5">
              <button
                onClick={() => {
                  if (showMyQR) {
                    // Switch back to scanner
                    setShowMyQR(false);
                    // Restart scanner
                    setTimeout(() => {
                      openQRScanner();
                    }, 100);
                  } else {
                    // Switch to my QR
                    setShowMyQR(true);
                    // Stop scanner
                    stopQRScanner();
                    setQrScanning(false);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm"
              >
                {showMyQR ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Scan QR Code
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path d="M3 9V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 9V5a2 2 0 0 0-2-2h-4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 15v4a2 2 0 0 0 2 2h4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 15v4a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Show My QR Code
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        </>
  );
}
