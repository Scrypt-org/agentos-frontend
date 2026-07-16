import type { DApp } from '@/config/dapps';
import { NETWORK_CONFIG } from '@/config/network';
import { API_BASE_URL } from './api-base';

export type DAppTab = {
  id: string;
  label: string;
  order: number;
  enabled: boolean;
};

function normalizeIcon(icon: string) {
  if (!icon) return icon;
  if (icon.startsWith('/')) return icon;

  const looksLikeImage = /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(icon);
  if (looksLikeImage) {
    return /^https?:\/\//i.test(icon) ? icon : `/${icon}`;
  }

  try {
    const parsed = icon.startsWith('http') ? new URL(icon) : new URL(`https://${icon}`);
    return `${NETWORK_CONFIG.faviconService}${parsed.hostname}&sz=128`;
  } catch {
    return `${NETWORK_CONFIG.faviconService}${icon}&sz=128`;
  }
}

export async function fetchDapps(): Promise<{ dapps: DApp[]; tabs: DAppTab[] }> {
  if (!API_BASE_URL) {
    return { dapps: [], tabs: [] };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/dapps`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dapps: ${response.status}`);
    }

    const payload = (await response.json()) as { dapps?: DApp[]; tabs?: DAppTab[] };
    const dapps = Array.isArray(payload.dapps) ? payload.dapps : [];
    const tabs = Array.isArray(payload.tabs) ? payload.tabs : [];
    return {
      dapps: dapps.map((dapp) => ({
        ...dapp,
        order: Number.isFinite(dapp.order) ? dapp.order : 0,
        icon: normalizeIcon(dapp.icon),
      }))
        .sort((left, right) => right.order - left.order),
      tabs: tabs
        .filter((tab) => tab.enabled)
        .sort((left, right) => left.order - right.order),
    };
  } catch {
    return { dapps: [], tabs: [] };
  }
}
