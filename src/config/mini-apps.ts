import type { Address } from 'viem';

import { NETWORK_CONFIG } from '@/config/network';

export type MiniAppPermission = 'accounts' | 'read' | 'sign' | 'transactions';

export interface MiniAppManifest {
  appId: string;
  slug: string;
  name: string;
  sameOrigin?: boolean;
  developmentUrl?: string;
  productionUrl: string;
  entryPath?: string;
  networkName: string;
  chainId: number;
  rpcUrl: string;
  permissions: readonly MiniAppPermission[];
  allowedContracts?: readonly Address[];
}

const ERIC_MFER_CONTRACT = (
  process.env.NEXT_PUBLIC_CATNFT_CONTRACT_ADDRESS
  || '0x1424f9e885d5C2681D600b984062E3bffdb80310'
) as Address;

/**
 * Mini apps are registered explicitly. Each production app receives one HTTPS
 * subdomain and one exact origin; wildcard origins are intentionally unsupported.
 */
export const MINI_APP_MANIFESTS: readonly MiniAppManifest[] = [
  {
    appId: 'ai-token-lottery',
    slug: 'ai-token-lottery',
    name: 'AI Token Lucky Draw',
    sameOrigin: true,
    developmentUrl: process.env.NEXT_PUBLIC_INJ_PASS_APP_URL || 'http://localhost:3000',
    productionUrl: 'https://injpass.com',
    entryPath: '/mini-apps/ai-token-lottery',
    networkName: NETWORK_CONFIG.mainnet.name,
    chainId: NETWORK_CONFIG.mainnet.chainId,
    rpcUrl: NETWORK_CONFIG.mainnet.rpcUrl,
    permissions: ['accounts', 'read'],
  },
  {
    appId: 'eric-mfer',
    slug: 'eric-mfer',
    name: 'eric mfer',
    sameOrigin: true,
    developmentUrl: process.env.NEXT_PUBLIC_INJ_PASS_APP_URL || 'http://localhost:3000',
    productionUrl: 'https://injpass.com',
    entryPath: '/mini-apps/eric-mfer',
    networkName: NETWORK_CONFIG.mainnet.name,
    chainId: NETWORK_CONFIG.mainnet.chainId,
    rpcUrl: NETWORK_CONFIG.mainnet.rpcUrl,
    permissions: ['accounts', 'read', 'sign', 'transactions'],
    allowedContracts: [ERIC_MFER_CONTRACT],
  },
  {
    appId: 'bankrupt-elon-musk',
    slug: 'bankrupt-elon-musk',
    name: 'Bankrupt Elon Musk',
    developmentUrl: process.env.NEXT_PUBLIC_BANKRUPT_ELON_APP_URL || 'http://localhost:3003',
    productionUrl: process.env.NEXT_PUBLIC_BANKRUPT_ELON_APP_URL || 'https://bankrupt-elon-musk.vercel.app',
    networkName: NETWORK_CONFIG.mainnet.name,
    chainId: NETWORK_CONFIG.mainnet.chainId,
    rpcUrl: NETWORK_CONFIG.mainnet.rpcUrl,
    permissions: ['accounts', 'read', 'sign'],
  },
];

export function getMiniAppManifest(appId: string): MiniAppManifest | null {
  return MINI_APP_MANIFESTS.find((manifest) => manifest.appId === appId) || null;
}

function isValidHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function getBrowserOrigin(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

/**
 * The base URL used to embed the mini app. Registered apps use their local
 * development origin while INJ Pass is running in development, so connector
 * changes can be tested end to end. Production follows the dApp directory URL
 * when present and otherwise uses the manifest fallback.
 */
export function resolveMiniAppBase(manifest: MiniAppManifest, baseOverride?: string): string {
  const browserOrigin = getBrowserOrigin();
  if (manifest.sameOrigin && browserOrigin) {
    return browserOrigin;
  }
  if (process.env.NODE_ENV === 'development' && manifest.developmentUrl) {
    return manifest.developmentUrl;
  }
  if (isValidHttpUrl(baseOverride)) return baseOverride;
  return manifest.productionUrl;
}

export function resolveMiniAppUrl(manifest: MiniAppManifest, path?: string, baseOverride?: string): string {
  const base = resolveMiniAppBase(manifest, baseOverride);
  const url = new URL(path ?? manifest.entryPath ?? '/', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('injpass_miniapp', '1');
  if (typeof window !== 'undefined') {
    url.searchParams.set('injpass_host_origin', window.location.origin);
  }
  return url.toString();
}

export function resolveMiniAppAgentUrl(
  manifest: MiniAppManifest,
  registeredApps: Array<{ id: string; url?: string | null }>,
): { src: string; baseOverride?: string } {
  const registeredUrl = registeredApps.find((app) => app.id === manifest.appId)?.url;
  const baseOverride = isValidHttpUrl(registeredUrl) ? registeredUrl : undefined;
  return {
    src: resolveMiniAppUrl(manifest, undefined, baseOverride),
    baseOverride,
  };
}

export function isAllowedMiniAppOrigin(
  manifest: MiniAppManifest,
  origin: string,
  baseOverride?: string,
): boolean {
  const browserOrigin = getBrowserOrigin();
  const allowed = [
    manifest.sameOrigin ? browserOrigin : undefined,
    isValidHttpUrl(baseOverride) ? baseOverride : undefined,
    manifest.productionUrl,
    manifest.developmentUrl,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
  return allowed.includes(origin);
}
