/**
 * DEX Swap Service for Monad
 * 
 * This service provides swap functionality using a Uniswap V2 compatible DEX.
 * 
 * IMPORTANT: You need to configure the ROUTER_ADDRESS with the actual Pumex router address.
 * To find it:
 * 1. Visit the Pumex dApp and perform a swap
 * 2. Check the transaction in the browser console or block explorer
 * 3. Replace the placeholder address below
 */

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseUnits, 
  formatUnits,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DEFAULT_CHAIN_VIEM } from '@/types/chain';
import { ROUTER_ABI, ERC20_ABI } from './dex-abi';
import { getTokenInfo, getTokenAddress, isNativeToken, getWrappedToken, getTokenInfoByAddress } from './tokens';

// ✅ CONFIGURED: Pumex RouterV2 address on Monad Testnet (Chain ID: 1776)
// Contract: https://blockscout.injective.network/address/0xC7247df0e97353D676d78f1cc55D3CE39eE32bE1
// Verified: Yes
// Name: RouterV2 (Uniswap V2 compatible)
// Network: Monad Testnet
export const ROUTER_ADDRESS = '0xC7247df0e97353D676d78f1cc55D3CE39eE32bE1' as Address;

// Router address configuration check
const ROUTER_NOT_CONFIGURED = ROUTER_ADDRESS === '0x0000000000000000000000000000000000000000';

/**
 * Swap quote result
 */
export interface SwapQuote {
  fromToken: string;
  toToken: string;
  amountIn: string;
  expectedOutput: string;
  priceImpact: string;
  route: string[];
  minOutput: string; // with slippage
}

/**
 * Swap execution params
 */
export interface SwapParams {
  fromToken: string;
  toToken: string;
  amountIn: string;
  slippage: number; // in percentage, e.g., 0.5 for 0.5%
  userAddress: Address;
  privateKey: `0x${string}`;
}

/**
 * Create public client for reading blockchain data
 */
function createClient() {
  return createPublicClient({
    chain: DEFAULT_CHAIN_VIEM,
    transport: http(),
  });
}

/**
 * Get swap routes (Solidly/Velodrome format)
 */
function getSwapRoutes(fromToken: string, toToken: string) {
  const fromInfo = getTokenInfo(fromToken);
  const toInfo = getTokenInfo(toToken);
  
  if (!fromInfo || !toInfo) {
    throw new Error('Token not found');
  }

  // If one of the tokens is native INJ, use WINJ for the path
  let fromAddr = fromInfo.address as Address;
  let toAddr = toInfo.address as Address;

  if (isNativeToken(fromToken)) {
    fromAddr = getWrappedToken('INJ').address as Address;
  }
  if (isNativeToken(toToken)) {
    toAddr = getWrappedToken('INJ').address as Address;
  }

  // Determine if this should use stable or volatile pool
  // INJ pairs use volatile, stablecoin pairs use stable
  const isStableSwap = (fromToken === 'USDC' && toToken === 'USDT') || 
                       (fromToken === 'USDT' && toToken === 'USDC');

  const routes = [
    {
      from: fromAddr,
      to: toAddr,
      stable: isStableSwap,
    },
  ] as const;

  console.log('[DEX] Swap routes:', {
    fromToken,
    toToken,
    routes,
  });

  return routes;
}

/**
 * Get swap quote (expected output amount)
 */
export async function getSwapQuote(
  fromToken: string,
  toToken: string,
  amountIn: string,
  slippage: number = 0.5
): Promise<SwapQuote> {
  if (ROUTER_NOT_CONFIGURED) {
    throw new Error(
      'Router address not configured. Please update ROUTER_ADDRESS in dex-swap.ts'
    );
  }

  try {
    const client = createClient();
    const fromInfo = getTokenInfo(fromToken);
    const toInfo = getTokenInfo(toToken);

    if (!fromInfo || !toInfo) {
      throw new Error('Token not found');
    }

    // Parse input amount
    const amountInWei = parseUnits(amountIn, fromInfo.decimals);
    
    console.log('[DEX] Getting quote:', {
      fromToken,
      toToken,
      amountIn,
      amountInWei: amountInWei.toString(),
      fromDecimals: fromInfo.decimals,
      toDecimals: toInfo.decimals
    });
    
    // Get swap routes (Solidly/Velodrome format)
    const routes = getSwapRoutes(fromToken, toToken);

    console.log('[DEX] Calling Router:', {
      router: ROUTER_ADDRESS,
      function: 'getAmountsOut',
      amountIn: amountInWei.toString(),
      routes
    });

    // Get amounts out from router
    const amounts = await client.readContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountInWei, routes],
    }) as bigint[];

    console.log('[DEX] Quote received:', {
      amounts: amounts.map(a => a.toString()),
      expectedOutput: amounts[amounts.length - 1].toString()
    });

    // Expected output is the last amount in the array
    const expectedOutputWei = amounts[amounts.length - 1];
    const expectedOutput = formatUnits(expectedOutputWei, toInfo.decimals);

    // Calculate minimum output with slippage
    const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100));
    const minOutputWei = (expectedOutputWei * slippageMultiplier) / BigInt(10000);
    const minOutput = formatUnits(minOutputWei, toInfo.decimals);

    // Calculate price impact (simplified)
    // In production, you'd compare against a price oracle or reference price
    const priceImpact = '0.1'; // Placeholder

    // Format route for display
    const routeDisplay = (routes as any).map((r: any) => {
      const fromSymbol = getTokenInfoByAddress(r.from)?.symbol || r.from;
      const toSymbol = getTokenInfoByAddress(r.to)?.symbol || r.to;
      return `${fromSymbol} → ${toSymbol} (${r.stable ? 'stable' : 'volatile'})`;
    });

    return {
      fromToken,
      toToken,
      amountIn,
      expectedOutput,
      priceImpact,
      route: routeDisplay,
      minOutput,
    };
  } catch (error) {
    console.error('Failed to get swap quote:', error);
    throw new Error(`Failed to get swap quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check token allowance
 */
export async function checkAllowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address
): Promise<bigint> {
  const client = createClient();
  
  const allowance = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  }) as bigint;

  return allowance;
}

/**
 * Approve token spending
 */
export async function approveToken(
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
  privateKey: `0x${string}`
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  
  const walletClient = createWalletClient({
    account,
    chain: DEFAULT_CHAIN_VIEM,
    transport: http(),
  });

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, amount],
  });

  // Wait for confirmation
  const client = createClient();
  await client.waitForTransactionReceipt({ hash });

  return hash;
}

/**
 * Execute swap
 */
export async function executeSwap(params: SwapParams): Promise<Hash> {
  if (ROUTER_NOT_CONFIGURED) {
    throw new Error(
      'Router address not configured. Please update ROUTER_ADDRESS in dex-swap.ts'
    );
  }

  const { fromToken, toToken, amountIn, slippage, userAddress, privateKey } = params;

  try {
    const fromInfo = getTokenInfo(fromToken);
    const toInfo = getTokenInfo(toToken);

    if (!fromInfo || !toInfo) {
      throw new Error('Token not found');
    }

    // Get quote first to calculate min output
    const quote = await getSwapQuote(fromToken, toToken, amountIn, slippage);
    const amountInWei = parseUnits(amountIn, fromInfo.decimals);
    const minOutputWei = parseUnits(quote.minOutput, toInfo.decimals);

    // Create wallet client
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: DEFAULT_CHAIN_VIEM,
      transport: http(),
    });

    // Get swap routes
    const routes = getSwapRoutes(fromToken, toToken);

    // Deadline: 20 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

    let hash: Hash;

    // Handle different swap scenarios
    if (isNativeToken(fromToken)) {
      // INJ -> Token (swapExactETHForTokens)
      hash = await walletClient.writeContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: 'swapExactETHForTokens',
        args: [minOutputWei, routes, userAddress, deadline],
        value: amountInWei,
      });
    } else if (isNativeToken(toToken)) {
      // Token -> INJ (swapExactTokensForETH)
      const tokenAddress = getTokenAddress(fromToken) as Address;
      const allowance = await checkAllowance(tokenAddress, userAddress, ROUTER_ADDRESS);
      
      if (allowance < amountInWei) {
        console.log('Approving token...');
        await approveToken(tokenAddress, ROUTER_ADDRESS, amountInWei * BigInt(2), privateKey);
      }

      hash = await walletClient.writeContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForETH',
        args: [amountInWei, minOutputWei, routes, userAddress, deadline],
      });
    } else {
      // Token -> Token (swapExactTokensForTokens)
      const tokenAddress = getTokenAddress(fromToken) as Address;
      const allowance = await checkAllowance(tokenAddress, userAddress, ROUTER_ADDRESS);
      
      if (allowance < amountInWei) {
        console.log('Approving token...');
        await approveToken(tokenAddress, ROUTER_ADDRESS, amountInWei * BigInt(2), privateKey);
      }

      hash = await walletClient.writeContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountInWei, minOutputWei, routes, userAddress, deadline],
      });
    }

    // Wait for confirmation
    const client = createClient();
    await client.waitForTransactionReceipt({ hash });

    return hash;
  } catch (error) {
    console.error('Swap execution failed:', error);
    throw new Error(`Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get token balance
 */
export async function getTokenBalance(
  tokenSymbol: string,
  userAddress: Address
): Promise<string> {
  const client = createClient();
  const tokenInfo = getTokenInfo(tokenSymbol);

  if (!tokenInfo) {
    throw new Error('Token not found');
  }

  try {
    if (isNativeToken(tokenSymbol)) {
      // Get native INJ balance
      const balance = await client.getBalance({ address: userAddress });
      return formatUnits(balance, 18);
    } else {
      // Get ERC20 token balance
      const balance = await client.readContract({
        address: tokenInfo.address as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      }) as bigint;
      return formatUnits(balance, tokenInfo.decimals);
    }
  } catch (error) {
    console.error(`Failed to get balance for ${tokenSymbol}:`, error);
    return '0';
  }
}

/**
 * Get balances for multiple tokens
 */
export async function getTokenBalances(
  tokenSymbols: string[],
  userAddress: Address
): Promise<Record<string, string>> {
  const balances: Record<string, string> = {};
  
  await Promise.all(
    tokenSymbols.map(async (symbol) => {
      try {
        balances[symbol] = await getTokenBalance(symbol, userAddress);
      } catch (error) {
        console.error(`Failed to get balance for ${symbol}:`, error);
        balances[symbol] = '0';
      }
    })
  );

  return balances;
}
