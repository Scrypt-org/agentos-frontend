/**
 * Send transaction (construct, sign, broadcast)
 * All signing happens on the client side
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getEthereumAddress } from '@injectivelabs/sdk-ts';
import { TransactionRequest, TransactionReceipt, ChainConfig, DEFAULT_CHAIN } from '@/types/chain';
import { estimateGas } from './estimateGas';

function normalizeToEvmAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.startsWith('inj1')) {
    try {
      return getEthereumAddress(trimmed);
    } catch {
      // fall through and return original
    }
  }
  return trimmed;
}

/**
 * Send a transaction
 * 
 * @param privateKey - Private key bytes (32 bytes)
 * @param to - Recipient address
 * @param value - Amount to send (in INJ/ETH as string)
 * @param data - Optional contract call data
 * @param chain - Chain configuration
 */
export async function sendTransaction(
  privateKey: Uint8Array,
  to: string,
  value: string,
  data?: `0x${string}`,
  chain: ChainConfig = DEFAULT_CHAIN
): Promise<string> {
  try {
    const evmTo = normalizeToEvmAddress(to);
    if (!isAddress(evmTo, { strict: false })) {
      throw new Error('Invalid EVM recipient address.');
    }

    // Convert private key to account
    const privateKeyHex = `0x${Array.from(privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}` as `0x${string}`;
    
    const account = privateKeyToAccount(privateKeyHex);

    // Create clients
    const walletClient = createWalletClient({
      account,
      chain: {
        id: chain.id,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: {
          default: { http: [chain.rpcUrl] },
          public: { http: [chain.rpcUrl] },
        },
      },
      transport: http(chain.rpcUrl),
    });

    // Estimate gas
    const gasEstimate = await estimateGas(
      account.address,
      evmTo,
      value,
      data,
      chain
    );

    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: evmTo as Address,
      value: parseEther(value),
      data: data,
      gas: gasEstimate.gasLimit,
      gasPrice: gasEstimate.maxFeePerGas,
    });

    return hash;
  } catch (error) {
    throw new Error(
      `Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Sign and send a raw transaction
 */
export async function signAndSendTransaction(
  privateKey: Uint8Array,
  txRequest: TransactionRequest,
  chain: ChainConfig = DEFAULT_CHAIN
): Promise<string> {
  try {
    const privateKeyHex = `0x${Array.from(privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}` as `0x${string}`;
    
    const account = privateKeyToAccount(privateKeyHex);

    const walletClient = createWalletClient({
      account,
      chain: {
        id: chain.id,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: {
          default: { http: [chain.rpcUrl] },
          public: { http: [chain.rpcUrl] },
        },
      },
      transport: http(chain.rpcUrl),
    });

    const hash = await walletClient.sendTransaction({
      to: txRequest.to as Address,
      value: txRequest.value,
      data: txRequest.data,
      gas: txRequest.gasLimit,
      maxFeePerGas: txRequest.maxFeePerGas,
      maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas,
    });

    return hash;
  } catch (error) {
    throw new Error(
      `Failed to sign and send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(
  txHash: string,
  chain: ChainConfig = DEFAULT_CHAIN
): Promise<TransactionReceipt> {
  try {
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });

    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    const block = await client.getBlock({
      blockHash: receipt.blockHash,
    });

    // Get full transaction details for value
    const tx = await client.getTransaction({
      hash: txHash as `0x${string}`,
    });

    return {
      hash: receipt.transactionHash,
      from: receipt.from,
      to: receipt.to || null,
      value: tx.value,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      timestamp: Number(block.timestamp),
    };
  } catch (error) {
    throw new Error(
      `Failed to get transaction receipt: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Send transaction and wait for confirmation
 */
export async function sendAndWaitForTransaction(
  privateKey: Uint8Array,
  to: string,
  value: string,
  data?: `0x${string}`,
  chain: ChainConfig = DEFAULT_CHAIN,
  confirmations: number = 1
): Promise<TransactionReceipt> {
  try {
    // Send transaction
    const hash = await sendTransaction(privateKey, to, value, data, chain);

    // Wait for confirmation
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });

    await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      confirmations,
    });

    // Get full receipt
    return await getTransactionReceipt(hash, chain);
  } catch (error) {
    throw new Error(
      `Failed to send and wait for transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
