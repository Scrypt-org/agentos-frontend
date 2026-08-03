/**
 * Plain ERC-20 transfers for assets the gas sponsor does not cover.
 *
 * The sender pays gas in INJ, so this is an ordinary contract call rather than
 * the EIP-712 authorization flow used by sponsored USDC.
 */

import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from 'viem';
import { DEFAULT_CHAIN_VIEM } from '@/types/chain';

export const ERC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

export interface Erc20Balance {
  value: bigint;
  formatted: string;
}

export const ZERO_ERC20_BALANCE: Erc20Balance = { value: 0n, formatted: '0' };

/**
 * Convert a user-typed amount into base units.
 *
 * parseUnits silently rounds anything past the token's precision, which would
 * move a different amount than the one on screen, so reject it instead.
 */
export function parseErc20Amount(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Amount must be a positive number.');
  }

  const fraction = trimmed.split('.')[1] ?? '';
  if (fraction.length > decimals) {
    throw new Error(`Amount cannot have more than ${decimals} decimal places.`);
  }

  const units = parseUnits(trimmed, decimals);
  if (units <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }
  return units;
}

export function encodeErc20Transfer(
  recipient: Address,
  units: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [recipient, units],
  });
}

export async function getErc20Balance(
  owner: Address,
  token: Address,
  decimals: number,
): Promise<Erc20Balance> {
  const client = createPublicClient({
    chain: DEFAULT_CHAIN_VIEM,
    transport: http(),
  });

  const value = (await client.readContract({
    address: token,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'balanceOf',
    args: [owner],
  })) as bigint;

  return { value, formatted: formatUnits(value, decimals) };
}
