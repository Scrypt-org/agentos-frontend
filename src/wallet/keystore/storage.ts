import { LocalKeystore } from '@/types/wallet';

const STORAGE_KEY = 'injective-pass-wallet';
const WALLET_VAULT_KEY = 'injective-pass-wallets';

function readWalletVault(): LocalKeystore[] {
  try {
    const raw = localStorage.getItem(WALLET_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((wallet): wallet is LocalKeystore => Boolean(wallet && typeof wallet === 'object' && 'address' in wallet))
      : [];
  } catch {
    return [];
  }
}

function writeWalletVault(wallets: LocalKeystore[]): void {
  localStorage.setItem(WALLET_VAULT_KEY, JSON.stringify(wallets));
}

/**
 * Save wallet to localStorage
 */
export function saveWallet(keystore: LocalKeystore): void {
  try {
    const data = JSON.stringify(keystore);
    localStorage.setItem(STORAGE_KEY, data);
    const wallets = readWalletVault();
    const existingIndex = wallets.findIndex((wallet) => wallet.address.toLowerCase() === keystore.address.toLowerCase());
    if (existingIndex >= 0) {
      wallets[existingIndex] = keystore;
    } else {
      wallets.unshift(keystore);
    }
    writeWalletVault(wallets);
  } catch (error) {
    throw new Error(`Failed to save wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function loadWallets(): LocalKeystore[] {
  const activeWallet = loadWallet();
  const wallets = readWalletVault();
  if (activeWallet && !wallets.some((wallet) => wallet.address.toLowerCase() === activeWallet.address.toLowerCase())) {
    wallets.unshift(activeWallet);
    writeWalletVault(wallets);
  }
  return wallets;
}

export function setActiveWallet(address: string): LocalKeystore | null {
  const wallet = loadWallets().find((item) => item.address.toLowerCase() === address.toLowerCase()) || null;
  if (wallet) localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}

/**
 * Load wallet from localStorage
 */
export function loadWallet(): LocalKeystore | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as LocalKeystore;
  } catch (error) {
    console.error('Failed to load wallet:', error);
    return null;
  }
}

/**
 * Check if wallet exists in localStorage
 */
export function hasWallet(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Delete wallet from localStorage
 */
export function deleteWallet(): void {
  const activeWallet = loadWallet();
  localStorage.removeItem(STORAGE_KEY);
  if (!activeWallet) return;
  const remainingWallets = readWalletVault().filter(
    (wallet) => wallet.address.toLowerCase() !== activeWallet.address.toLowerCase()
  );
  writeWalletVault(remainingWallets);
  if (remainingWallets[0]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingWallets[0]));
  }
}

export function deleteWalletByAddress(address: string): void {
  const normalizedAddress = address.toLowerCase();
  const activeWallet = loadWallet();
  const remainingWallets = readWalletVault().filter(
    (wallet) => wallet.address.toLowerCase() !== normalizedAddress,
  );
  writeWalletVault(remainingWallets);

  if (activeWallet?.address.toLowerCase() !== normalizedAddress) return;
  localStorage.removeItem(STORAGE_KEY);
  if (remainingWallets[0]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingWallets[0]));
  }
}

/**
 * Get wallet address without loading full keystore
 */
export function getWalletAddress(): string | null {
  const wallet = loadWallet();
  return wallet?.address || null;
}

/**
 * Get wallet source without loading full keystore
 */
export function getWalletSource(): LocalKeystore['source'] | null {
  const wallet = loadWallet();
  return wallet?.source || null;
}
