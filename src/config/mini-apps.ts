import type { Address } from 'viem';

import { NETWORK_CONFIG } from '@/config/network';

export type MiniAppPermission = 'accounts' | 'read' | 'sign' | 'transactions';

export interface MiniAppManifest {
  appId: string;
  slug: string;
  name: string;
  developmentUrl?: string;
  productionUrl: string;
  networkName: string;
  chainId: number;
  rpcUrl: string;
  permissions: readonly MiniAppPermission[];
  allowedContracts?: readonly Address[];
}

const INJ_GIFT_CONTRACT = (
  process.env.NEXT_PUBLIC_INJ_GIFT_CONTRACT_ADDRESS
  || '0xfF2750Ac6f03d4fD4AA19D49a17DC4459cf2d6Ed'
) as Address;

/**
 * Mini apps are registered explicitly. Each production app receives one HTTPS
 * subdomain and one exact origin; wildcard origins are intentionally unsupported.
 */
export const MINI_APP_MANIFESTS: readonly MiniAppManifest[] = [
  {
    appId: 'inj-gift',
    slug: 'gift',
    name: 'INJ Gift',
    developmentUrl: process.env.NEXT_PUBLIC_INJ_GIFT_APP_URL || 'http://localhost:3002',
    productionUrl: 'https://gift.injpass.com',
    networkName: NETWORK_CONFIG.testnet.name,
    chainId: NETWORK_CONFIG.testnet.chainId,
    rpcUrl: NETWORK_CONFIG.testnet.rpcUrl,
    permissions: ['accounts', 'read', 'sign', 'transactions'],
    allowedContracts: [INJ_GIFT_CONTRACT],
  },
];

export function getMiniAppManifest(appId: string): MiniAppManifest | null {
  return MINI_APP_MANIFESTS.find((manifest) => manifest.appId === appId) || null;
}

export function resolveMiniAppUrl(manifest: MiniAppManifest, path = '/'): string {
  const base = process.env.NODE_ENV === 'development' && manifest.developmentUrl
    ? manifest.developmentUrl
    : manifest.productionUrl;
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('injpass_miniapp', '1');
  if (typeof window !== 'undefined') {
    url.searchParams.set('injpass_host_origin', window.location.origin);
  }
  return url.toString();
}

export function isAllowedMiniAppOrigin(manifest: MiniAppManifest, origin: string): boolean {
  const allowed = [manifest.productionUrl, manifest.developmentUrl]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
  return allowed.includes(origin);
}
