/**
 * POST /api/faucet/claim
 *
 * Body: { address: string; companion: string | null; captchaToken?: string }
 *   address   — recipient's EVM address (injpass account)
 *   companion — one of the companion network IDs, or null for INJ-only
 *
 * Rules:
 *   • Always sends 0.1 INJ on Injective Testnet
 *   • Optionally sends 0.02 ETH on one companion chain
 *   • Rate-limited to 1 claim per account address per UTC day
 *   • Multiple accounts from the same IP are allowed (by design)
 *
 * @author Alex <jsxj81@163.com>
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getInjectiveAddress } from '@injectivelabs/sdk-ts';
import { hasClaimedToday, recordClaim } from '@/lib/faucet-store';
import { INJ_NETWORK, COMPANION_NETWORKS } from '@/config/faucet';

export const runtime = 'nodejs';

function buildViemChain(network: { chainId: number; chainName: string; symbol: string; rpcUrl: string }) {
  return {
    id: network.chainId,
    name: network.chainName,
    nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
    rpcUrls: {
      default: { http: [network.rpcUrl] },
      public: { http: [network.rpcUrl] },
    },
  };
}

async function sendNative(
  privateKeyHex: `0x${string}`,
  to: string,
  amount: string,
  network: { chainId: number; chainName: string; symbol: string; rpcUrl: string }
): Promise<string> {
  const account = privateKeyToAccount(privateKeyHex);
  const chain = buildViemChain(network);

  const publicClient = createPublicClient({ transport: http(network.rpcUrl, { timeout: 20_000 }) });
  const walletClient = createWalletClient({ account, chain, transport: http(network.rpcUrl, { timeout: 20_000 }) });

  const nonce = await publicClient.getTransactionCount({ address: account.address });
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  const hash = await walletClient.sendTransaction({
    to: to as Address,
    value: parseEther(amount),
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  return hash;
}

export async function POST(req: NextRequest) {
  try {
    const { address, companion, captchaToken } = (await req.json()) as {
      address: string;
      companion: string | null;
      captchaToken?: string;
    };

    // --- Validation ---
    if (!address || typeof address !== 'string' || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    if (companion !== null && !COMPANION_NETWORKS.find((n) => n.id === companion)) {
      return NextResponse.json({ error: 'Unknown companion network' }, { status: 400 });
    }

    // --- Rate limit check ---
    if (hasClaimedToday(address)) {
      return NextResponse.json(
        {
          error: 'This account has already claimed today. Come back tomorrow!',
          code: 'already_claimed',
        },
        { status: 429 }
      );
    }

    // --- Private key ---
    const rawKey = process.env.FAUCET_PRIVATE_KEY;
    if (!rawKey) {
      if (companion) {
        return NextResponse.json({ error: 'Companion faucet not configured' }, { status: 500 });
      }

      if (!captchaToken) {
        return NextResponse.json(
          {
            error: 'Human verification is required by the Injective faucet.',
            code: 'captcha_required',
          },
          { status: 428 }
        );
      }

      const injectiveAddress = getInjectiveAddress(address);
      const officialFaucetUrl = process.env.INJECTIVE_FAUCET_API_URL
        || 'https://d1ikjbl0xk5pmx.cloudfront.net/v2/faucet';
      const officialResponse = await fetch(
        officialFaucetUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: injectiveAddress, token: captchaToken }),
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (!officialResponse.ok) {
        const responseText = await officialResponse.text().catch(() => '');
        let message = responseText;
        try {
          const payload = JSON.parse(responseText) as { error?: string; message?: string };
          message = payload.error || payload.message || responseText;
        } catch {
          // The faucet may return a plain-text validation message.
        }
        return NextResponse.json(
          { error: message || 'Injective testnet faucet is unavailable' },
          { status: officialResponse.status }
        );
      }

      recordClaim(address, null);
      return NextResponse.json({
        success: true,
        queued: true,
        address: injectiveAddress,
        source: 'injective-official-faucet-v2',
      });
    }
    const privateKeyHex = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;

    // --- Send INJ (always) ---
    const injTxHash = await sendNative(privateKeyHex, address, INJ_NETWORK.amount, INJ_NETWORK);

    // --- Send companion ETH (if chosen) ---
    let ethTxHash: string | null = null;
    if (companion) {
      const companionNet = COMPANION_NETWORKS.find((n) => n.id === companion)!;
      ethTxHash = await sendNative(privateKeyHex, address, companionNet.amount, companionNet);
    }

    // --- Record the claim ---
    recordClaim(address, companion);

    return NextResponse.json({
      success: true,
      injTxHash,
      ethTxHash,
      injExplorerUrl: INJ_NETWORK.explorerUrl + injTxHash,
      ethExplorerUrl: ethTxHash
        ? (COMPANION_NETWORKS.find((n) => n.id === companion)!.explorerUrl + ethTxHash)
        : null,
    });
  } catch (err) {
    console.error('[Faucet] Claim error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Claim failed' },
      { status: 500 }
    );
  }
}
