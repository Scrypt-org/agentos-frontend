import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { INJECTIVE_TESTNET, INJECTIVE_TESTNET_CHAIN } from '@/types/chain';

export const INJ_GIFT_CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_INJ_GIFT_CONTRACT_ADDRESS
  || '0xfF2750Ac6f03d4fD4AA19D49a17DC4459cf2d6Ed'
) as Address;

export const INJ_GIFT_APP_URL = process.env.NEXT_PUBLIC_INJ_GIFT_APP_URL || 'http://localhost:3002';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const PACKET_ID_PATTERN = /0x[a-fA-F0-9]{64}/;

export const INJ_GIFT_ABI = [
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
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'password', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'redPackets',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'totalCount', type: 'uint256' },
      { name: 'claimedAmount', type: 'uint256' },
      { name: 'claimedCount', type: 'uint256' },
      { name: 'passwordHash', type: 'bytes32' },
      { name: 'expiration', type: 'uint256' },
      { name: 'internalNonce', type: 'uint64' },
      { name: 'lastClaimHash', type: 'bytes32' },
      { name: 'mode', type: 'uint8' },
      { name: 'isActive', type: 'bool' },
    ],
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
  {
    type: 'event',
    name: 'RedPacketClaimed',
    anonymous: false,
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'claimer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export type InjGiftCommand =
  | {
      kind: 'create';
      amount: string;
      count: number;
      password: string;
      durationSec: number;
      mode: 'random' | 'equal';
      generatedPassword: boolean;
    }
  | { kind: 'claim'; packetId: Hex; password: string }
  | { kind: 'query'; packetId: Hex }
  | { kind: 'help'; intent?: 'create' | 'claim' | 'query' };

export interface InjGiftExecutionResult {
  body: string;
  transactionHash?: Hex;
  packetId?: Hex;
}

function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, (byte, index) => alphabet[(byte || Date.now() + index) % alphabet.length]).join('');
}

function parseDuration(text: string): number {
  const match = text.match(/(\d+)\s*(分钟|分|min(?:ute)?s?|小时|时|hours?|hrs?|天|days?)/i);
  if (!match) return 24 * 60 * 60;
  const amount = Math.max(1, Number(match[1]));
  const unit = match[2].toLocaleLowerCase();
  if (unit.includes('分') || unit.startsWith('min')) return amount * 60;
  if (unit.includes('天') || unit.startsWith('day')) return amount * 24 * 60 * 60;
  return amount * 60 * 60;
}

function parsePassword(text: string): string | null {
  const match = text.match(/(?:密码|口令|兑换码|验证码|pass(?:word|code)?|code)\s*[:：=]?\s*["']?([^\s,，;；"']+)/i);
  return match?.[1]?.trim() || null;
}

export function isInjGiftMessage(text: string): boolean {
  return /@\s*inj(?:\s|-|_)?gift\b/i.test(text) || /@\s*injift\b/i.test(text);
}

export function parseInjGiftCommand(rawText: string): InjGiftCommand {
  const text = rawText
    .replace(/@\s*inj(?:\s|-|_)?gift\b/ig, ' ')
    .replace(/@\s*injift\b/ig, ' ')
    .trim();
  const packetId = text.match(PACKET_ID_PATTERN)?.[0] as Hex | undefined;
  const password = parsePassword(text);
  const queryIntent = /(查询|查看|余额|状态|剩余|详情|check|query|status|balance|remaining)/i.test(text);
  const claimIntent = /(领取|接收|打开红包|领红包|claim|receive|redeem)/i.test(text);
  const createIntent = /(创建|新建|发送|发一个|发红包|生成|create|send|make)/i.test(text);

  if (packetId && queryIntent) return { kind: 'query', packetId };
  if (packetId && (claimIntent || password)) {
    return password ? { kind: 'claim', packetId, password } : { kind: 'help', intent: 'claim' };
  }
  if (packetId) return { kind: 'query', packetId };

  if (createIntent) {
    const amount = text.match(/(\d+(?:\.\d+)?)\s*INJ\b/i)?.[1];
    if (!amount || Number(amount) <= 0) return { kind: 'help', intent: 'create' };
    const countMatch = text.match(/(\d+)\s*(?:份|个|人|packets?|gifts?|copies?)/i);
    const generatedPassword = !password;
    return {
      kind: 'create',
      amount,
      count: Math.max(1, countMatch ? Number(countMatch[1]) : 1),
      password: password || randomPassword(),
      durationSec: parseDuration(text),
      mode: /(平分|平均|等额|equal|even)/i.test(text) ? 'equal' : 'random',
      generatedPassword,
    };
  }

  if (claimIntent) return { kind: 'help', intent: 'claim' };
  if (queryIntent) return { kind: 'help', intent: 'query' };
  return { kind: 'help' };
}

function privateKeyHex(privateKey: Uint8Array): Hex {
  return `0x${Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('')}` as Hex;
}

function publicClient() {
  return createPublicClient({
    chain: INJECTIVE_TESTNET_CHAIN,
    transport: http(INJECTIVE_TESTNET.rpcUrl),
  });
}

function walletClient(privateKey: Uint8Array) {
  const account = privateKeyToAccount(privateKeyHex(privateKey));
  return {
    account,
    client: createWalletClient({
      account,
      chain: INJECTIVE_TESTNET_CHAIN,
      transport: http(INJECTIVE_TESTNET.rpcUrl),
    }),
  };
}

function helpMessage(intent: 'create' | 'claim' | 'query' | undefined, languageCode: string): string {
  const zh = languageCode.startsWith('zh');
  if (zh) {
    if (intent === 'create') return '请带上金额，例如：`@INJ Gift 创建 0.1 INJ 红包，5 份，密码 lucky，24 小时，随机分配`。';
    if (intent === 'claim') return '请粘贴红包 ID 和密码，例如：`@INJ Gift 领取 0x… 密码 lucky`。';
    if (intent === 'query') return '请粘贴红包 ID，例如：`@INJ Gift 查询 0x… 的余额和状态`。';
    return 'INJ Gift 支持真实链上操作：创建红包、凭红包 ID 与密码领取，以及查询红包余额和状态。';
  }
  if (intent === 'create') return 'Include an amount, for example: `@INJ Gift create a 0.1 INJ gift for 5 people, password lucky, valid for 24 hours, random split`.';
  if (intent === 'claim') return 'Paste the packet ID and passcode, for example: `@INJ Gift claim 0x… password lucky`.';
  if (intent === 'query') return 'Paste the packet ID, for example: `@INJ Gift check the balance of 0x…`.';
  return 'INJ Gift supports real on-chain creation, claiming with a packet ID and passcode, and packet balance/status queries.';
}

function readableExecutionError(error: unknown, languageCode: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLocaleLowerCase();
  const zh = languageCode.startsWith('zh');
  if (lower.includes('insufficient') || lower.includes('exceeds the balance')) {
    return new Error(zh ? 'INJ 余额不足，无法同时支付红包金额和测试网 Gas。' : 'Insufficient INJ for the gift amount and testnet gas.');
  }
  if (lower.includes('revert')) {
    return new Error(zh ? '合约拒绝了这次操作，请检查红包状态、密码或领取资格。' : 'The contract rejected this action. Check the packet status, passcode, and claim eligibility.');
  }
  return new Error(zh ? `INJ Gift 操作失败：${message}` : `INJ Gift action failed: ${message}`);
}

export async function executeInjGiftCommand(
  command: InjGiftCommand,
  options: { languageCode: string; privateKey?: Uint8Array },
): Promise<InjGiftExecutionResult> {
  if (command.kind === 'help') {
    return { body: helpMessage(command.intent, options.languageCode) };
  }

  const zh = options.languageCode.startsWith('zh');
  const client = publicClient();

  try {
    if (command.kind === 'query') {
      const packet = await client.readContract({
        address: INJ_GIFT_CONTRACT_ADDRESS,
        abi: INJ_GIFT_ABI,
        functionName: 'redPackets',
        args: [command.packetId],
      });
      const [creator, token, totalAmount, totalCount, claimedAmount, claimedCount, , expiration, , , mode, isActive] = packet;
      const remaining = totalAmount - claimedAmount;
      const expired = Number(expiration) <= Math.floor(Date.now() / 1000);
      const active = isActive && !expired && claimedCount < totalCount;
      const status = active ? (zh ? '可领取' : 'Claimable') : expired ? (zh ? '已过期' : 'Expired') : (zh ? '已结束' : 'Closed');
      return {
        packetId: command.packetId,
        body: zh
          ? `**INJ Gift 红包状态**\n\n- 状态：${status}\n- 剩余：${formatEther(remaining)} INJ\n- 剩余份数：${Number(totalCount - claimedCount)} / ${Number(totalCount)}\n- 分配：${Number(mode) === 0 ? '随机' : '平均'}\n- 创建者：\`${creator}\`\n- 资产：${token === ZERO_ADDRESS ? 'INJ' : token}`
          : `**INJ Gift packet status**\n\n- Status: ${status}\n- Remaining: ${formatEther(remaining)} INJ\n- Claims left: ${Number(totalCount - claimedCount)} / ${Number(totalCount)}\n- Split: ${Number(mode) === 0 ? 'Random' : 'Equal'}\n- Creator: \`${creator}\`\n- Asset: ${token === ZERO_ADDRESS ? 'INJ' : token}`,
      };
    }

    if (!options.privateKey) {
      throw new Error(zh ? '请先登录并解锁 INJ Pass 钱包。' : 'Log in and unlock your INJ Pass wallet first.');
    }

    const { account, client: signer } = walletClient(options.privateKey);
    if (command.kind === 'create') {
      const hash = await signer.writeContract({
        account,
        address: INJ_GIFT_CONTRACT_ADDRESS,
        abi: INJ_GIFT_ABI,
        functionName: 'createRedPacket',
        args: [ZERO_ADDRESS, parseEther(command.amount), BigInt(command.count), command.password, BigInt(command.durationSec), command.mode === 'random' ? 0 : 1],
        value: parseEther(command.amount),
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      const event = parseEventLogs({ abi: INJ_GIFT_ABI, logs: receipt.logs, eventName: 'RedPacketCreated' })[0];
      const packetId = event?.args.id;
      if (!packetId) throw new Error('The transaction was confirmed but no packet ID was emitted.');
      const claimInstruction = `@INJ Gift ${zh ? '领取' : 'claim'} ${packetId} ${zh ? '密码' : 'password'} ${command.password}`;
      const explorer = `${INJECTIVE_TESTNET.explorerUrl}/tx/${hash}`;
      return {
        transactionHash: hash,
        packetId,
        body: zh
          ? `**红包已在 Injective EVM Testnet 创建**\n\n- 金额：${command.amount} INJ\n- 份数：${command.count}\n- 密码：\`${command.password}\`${command.generatedPassword ? '（已自动生成）' : ''}\n- 红包 ID：\`${packetId}\`\n\n把下面这句发给领取人即可：\n\n\`${claimInstruction}\`\n\n[查看交易](${explorer})`
          : `**Gift created on Injective EVM Testnet**\n\n- Amount: ${command.amount} INJ\n- Gifts: ${command.count}\n- Passcode: \`${command.password}\`${command.generatedPassword ? ' (generated automatically)' : ''}\n- Packet ID: \`${packetId}\`\n\nShare this command with the recipient:\n\n\`${claimInstruction}\`\n\n[View transaction](${explorer})`,
      };
    }

    const hash = await signer.writeContract({
      account,
      address: INJ_GIFT_CONTRACT_ADDRESS,
      abi: INJ_GIFT_ABI,
      functionName: 'claim',
      args: [command.packetId, command.password],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const event = parseEventLogs({ abi: INJ_GIFT_ABI, logs: receipt.logs, eventName: 'RedPacketClaimed' })[0];
    const amount = event?.args.amount;
    const explorer = `${INJECTIVE_TESTNET.explorerUrl}/tx/${hash}`;
    return {
      transactionHash: hash,
      packetId: command.packetId,
      body: zh
        ? `**领取成功**\n\n已收到 ${amount === undefined ? '' : `${formatEther(amount)} `}INJ。\n\n[查看交易](${explorer})`
        : `**Claim successful**\n\nYou received ${amount === undefined ? '' : `${formatEther(amount)} `}INJ.\n\n[View transaction](${explorer})`,
    };
  } catch (error) {
    throw readableExecutionError(error, options.languageCode);
  }
}
