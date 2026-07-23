import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { NETWORK_CONFIG } from '@/config/network';
import { INJECTIVE_MAINNET_CHAIN, INJECTIVE_TESTNET_CHAIN } from '@/types/chain';

/**
 * Minimal ABI for host-native red-packet creation — just the payable
 * `createRedPacket` entry point and the `RedPacketCreated` event we parse for
 * the packet id.
 */
const GIFT_ABI = [
  {
    type: 'function',
    name: 'createRedPacket',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'count', type: 'uint256' },
      { name: 'password', type: 'string' },
      { name: 'duration', type: 'uint256' },
      { name: 'mode', type: 'uint8' },
    ],
    outputs: [{ name: 'id', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'RedPacketCreated',
    anonymous: false,
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'count', type: 'uint256', indexed: false },
      { name: 'mode', type: 'uint8', indexed: false },
      { name: 'expiration', type: 'uint256', indexed: false },
    ],
  },
] as const;

function giftChain() {
  return NETWORK_CONFIG.isMainnet ? INJECTIVE_MAINNET_CHAIN : INJECTIVE_TESTNET_CHAIN;
}

function privateKeyHex(privateKey: Uint8Array): `0x${string}` {
  return `0x${Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export interface CreateInjGiftParams {
  /** Human INJ amount, e.g. "0.01". */
  amount: string;
  count: number;
  password: string;
  durationSec: number;
  mode: 'random' | 'equal';
}

export interface CreateInjGiftResult {
  hash: Hash;
  packetId?: string;
  amountWei: string;
}

/**
 * Create an INJ Gift red packet entirely host-side — the exact pattern that
 * makes the eric mfer mint reliable (see `mintSponsoredCatNFT`). The host holds
 * the unlocked private key and signs + broadcasts with viem over a direct http
 * RPC transport: no cross-origin iframe, no `postMessage` round-trips, and no
 * "prove where to sign" authorization dance. That is why this can't stall on the
 * mini-app bridge the way the delegated (iframe) create path does.
 */
export async function createInjGiftPacket(
  privateKey: Uint8Array,
  contractAddress: Address,
  params: CreateInjGiftParams,
): Promise<CreateInjGiftResult> {
  const chain = giftChain();
  const account = privateKeyToAccount(privateKeyHex(privateKey));
  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  const amountWei = parseEther(params.amount);
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: GIFT_ABI,
    functionName: 'createRedPacket',
    args: [
      zeroAddress,
      amountWei,
      BigInt(Math.max(1, Math.trunc(params.count))),
      params.password,
      BigInt(Math.max(60, Math.trunc(params.durationSec))),
      params.mode === 'equal' ? 1 : 0,
    ],
    value: amountWei,
  });

  let packetId: string | undefined;
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    const logs = parseEventLogs({ abi: GIFT_ABI, eventName: 'RedPacketCreated', logs: receipt.logs });
    const created = logs[0] as { args?: { id?: unknown } } | undefined;
    if (created?.args?.id) packetId = String(created.args.id);
  } catch {
    // Receipt slow to land — hand back the hash; the packet may still be mined
    // and the caller falls back to a "submitted, verify later" message.
  }

  return { hash, packetId, amountWei: amountWei.toString() };
}

export interface SyncedInjGiftPacket {
  shareCode?: string;
}

/**
 * Best-effort: register the freshly created packet with the INJ Gift backend so
 * it assigns the short share code. This is a cross-origin POST (host →
 * inj-gift), so it depends on CORS on the gift side; any failure degrades to
 * "no share code" and the caller falls back to the packet id.
 */
export async function syncInjGiftShareCode(
  baseUrl: string,
  item: { packetId: string; txHash: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SyncedInjGiftPacket | null> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/gift/packets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { packet?: SyncedInjGiftPacket };
    return payload.packet ?? null;
  } catch {
    return null;
  }
}
