/**
 * Faucet network configuration
 *
 * MON: 0.5 per account per day (Monad Testnet)
 */

import { INJECTIVE_TESTNET } from '@/types/chain';

export interface FaucetNetwork {
  id: string;
  name: string;
  chainName: string;
  rpcUrl: string;
  chainId: number;
  /** Human-readable amount to distribute (e.g. "0.5") */
  amount: string;
  symbol: string;
  /** Hex color for UI badges */
  color: string;
  /** Whether this is the always-included base chain */
  isBase: boolean;
  explorerUrl: string;
}

export const FAUCET_NETWORKS: FaucetNetwork[] = [
  {
    id: 'monad',
    name: 'MON',
    chainName: INJECTIVE_TESTNET.name,
    rpcUrl: INJECTIVE_TESTNET.rpcUrl,
    chainId: INJECTIVE_TESTNET.id,
    amount: '0.5',
    symbol: 'MON',
    color: '#836EF9',
    isBase: true,
    explorerUrl: `${INJECTIVE_TESTNET.explorerUrl}/tx/`,
  },
];

export const INJ_NETWORK = FAUCET_NETWORKS.find((n) => n.isBase)!;
export const COMPANION_NETWORKS = FAUCET_NETWORKS.filter((n) => !n.isBase);
