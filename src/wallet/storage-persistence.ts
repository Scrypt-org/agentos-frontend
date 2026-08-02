/**
 * Local wallet records (`injective-pass-wallet(s)` in localStorage and the
 * `inj-pass` IndexedDB vaults) are the only copy of a `local-mnemonic-v1`
 * wallet on this device. Browsers evict that storage on their own schedule, so
 * ask for a persistent bucket and tell the user when the request was refused.
 */

export type StoragePersistence = 'persisted' | 'denied' | 'unsupported';

export async function ensurePersistentStorage(): Promise<StoragePersistence> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** True once the site runs from the Home Screen / as an installed app. */
export function isHomeScreenApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Every browser on iOS is WebKit, so Chrome and Edge there are bound by the
 * same 7-day cap on script-writable storage as Safari.
 */
export function isWebKitBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const agent = navigator.userAgent;
  return /iP(hone|ad|od)/.test(agent)
    || (/Safari/.test(agent) && !/Chrome|Chromium|Android/.test(agent));
}

export function describeStoragePersistence(state: StoragePersistence): string {
  if (state === 'persisted') return '';
  if (isWebKitBrowser() && !isHomeScreenApp()) {
    return 'Safari erases site data after 7 days without a visit, which removes this wallet from the device. Add INJ Pass to your Home Screen (Share → Add to Home Screen) to keep it, and store the 24 words offline as the only other copy.';
  }
  return 'This browser has not granted INJ Pass persistent storage, so it may clear the wallet record when disk space runs low or site data is cleared. Store the 24 words offline as the only other copy.';
}

/**
 * Fire-and-forget wrapper for call sites that only want to surface the warning.
 * Chrome grants persistence silently once site engagement is high enough, so
 * this is worth retrying on every visit rather than only at wallet creation.
 */
export function requestPersistentStorage(onWarning: (warning: string) => void): void {
  void ensurePersistentStorage().then((state) => onWarning(describeStoragePersistence(state)));
}
