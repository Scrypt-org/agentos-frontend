/**
 * Get balance for an address
 */

import { createPublicClient, http, formatEther, type Address } from 'viem';
import { Balance, ChainConfig, DEFAULT_CHAIN } from '@/types/chain';

/**
 * Get native token balance (MON)
 */
export async function getBalance(
  address: string,
  chain: ChainConfig = DEFAULT_CHAIN
): Promise<Balance> {
  try {
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });

    const balance = await client.getBalance({
      address: address as Address,
    });

    return {
      value: balance,
      formatted: formatEther(balance),
      decimals: chain.nativeCurrency.decimals,
      symbol: chain.nativeCurrency.symbol,
    };
  } catch (error) {
    throw new Error(
      `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get multiple balances in parallel
 */
export async function getBalances(
  addresses: string[],
  chain: ChainConfig = DEFAULT_CHAIN
): Promise<Balance[]> {
  try {
    const balances = await Promise.all(
      addresses.map((address) => getBalance(address, chain))
    );
    return balances;
  } catch (error) {
    throw new Error(
      `Failed to get balances: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
