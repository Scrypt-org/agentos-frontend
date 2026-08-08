/**
 * Token configuration for Monad
 */

import { NETWORK_CONFIG } from '@/config/network';

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  icon: string;
  isNative?: boolean;
}

// Monad Testnet Token Addresses
export const TOKENS_MAINNET: Record<string, TokenInfo> = {
  MON: {
    symbol: 'MON',
    name: 'Monad',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Special address for native token
    decimals: 18,
    icon: '/injswap.png',
    isNative: true,
  },
  WINJ: {
    symbol: 'WINJ',
    name: 'Wrapped INJ',
    address: '0x0000000088827d2d103ee2d9A6b781773AE03FfB',
    decimals: 18,
    icon: '/injswap.png',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x88f7F2b685F9692caf8c478f5BADF09eE9B1Cc13',
    decimals: 6,
    icon: '/USDT_Logo.png',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
    decimals: 6,
    icon: '/USDC_Logo.png',
  },
};

// Monad Testnet Token Addresses
export const TOKENS_TESTNET: Record<string, TokenInfo> = {
  MON: {
    symbol: 'MON',
    name: 'Monad',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
    icon: '/injswap.png',
    isNative: true,
  },
  WINJ: {
    symbol: 'WINJ',
    name: 'Wrapped INJ',
    address: '0x0000000088827d2d103ee2d9A6b781773AE03FfB',
    decimals: 18,
    icon: '/injswap.png',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xaDC7bcB5d8fe053Ef19b4E0C861c262Af6e0db60',
    decimals: 6,
    icon: '/USDT_Logo.png',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d',
    decimals: 6,
    icon: '/USDC_Logo.png',
  },
};

export const TOKENS = NETWORK_CONFIG.isMainnet
  ? TOKENS_MAINNET
  : TOKENS_TESTNET;

/**
 * Get token info by symbol
 */
export function getTokenInfo(symbol: string): TokenInfo | undefined {
  return TOKENS[symbol.toUpperCase()];
}

/**
 * Get token info by address
 */
export function getTokenInfoByAddress(address: string): TokenInfo | undefined {
  const normalizedAddress = address.toLowerCase();
  return Object.values(TOKENS).find(
    token => token.address.toLowerCase() === normalizedAddress
  );
}

/**
 * Get token address by symbol
 */
export function getTokenAddress(symbol: string): string {
  const token = getTokenInfo(symbol);
  if (!token) {
    throw new Error(`Token ${symbol} not found`);
  }
  return token.address;
}

/**
 * Check if a token is native (MON)
 */
export function isNativeToken(symbol: string): boolean {
  const token = getTokenInfo(symbol);
  return token?.isNative || false;
}

/**
 * Get the wrapped version of native token
 */
export function getWrappedToken(symbol: string): TokenInfo {
  if (symbol === 'MON') {
    return TOKENS.WINJ;
  }
  return getTokenInfo(symbol)!;
}
