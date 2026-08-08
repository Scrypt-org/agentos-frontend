import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { API_BASE_URL } from './api-base';
import { getAuthToken } from './passkey';
import { DEFAULT_CHAIN_VIEM } from '@/types/chain';

export interface AccountFungibleAsset {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balanceRaw: string;
  balance: string;
}

export interface AccountNftAsset {
  contractAddress: string;
  symbol: string;
  name: string;
  tokenId: string;
  tokenType: 'ERC-721' | 'ERC-1155' | 'OTHER';
  balanceRaw: string;
}

export interface AccountDeletionStatus {
  canDelete: boolean;
  checksComplete: true;
  checkedAt: string;
  walletAddress: string;
  evmNative: { symbol: 'INJ'; balanceRaw: string; balance: string };
  fungibleTokens: AccountFungibleAsset[];
  nfts: AccountNftAsset[];
  forfeitedLam: number;
  blockers: Array<{
    kind: string;
    label: string;
    amount: string;
    canAutoSweep: boolean;
  }>;
}

const erc20Abi = [{
  type: 'function',
  name: 'transfer',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

const erc721Abi = [{
  type: 'function',
  name: 'transferFrom',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
  ],
  outputs: [],
}] as const;

const erc1155Abi = [{
  type: 'function',
  name: 'safeTransferFrom',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'id', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
  outputs: [],
}] as const;

function authenticatedHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: string | string[] };
    return Array.isArray(payload.message)
      ? payload.message.join(' ')
      : payload.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function getAccountDeletionStatus(): Promise<AccountDeletionStatus> {
  const response = await fetch(`${API_BASE_URL}/user/account/deletion-status`, {
    headers: authenticatedHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<AccountDeletionStatus>;
}

export async function deleteInjPassAccount(): Promise<{ deleted: true }> {
  const response = await fetch(`${API_BASE_URL}/user/account`, {
    method: 'DELETE',
    headers: authenticatedHeaders(),
    body: JSON.stringify({ confirmation: 'DELETE' }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json() as { deleted?: boolean };
  if (!payload.deleted) throw new Error('Account deletion was not confirmed.');
  return { deleted: true };
}

interface SweepAction {
  label: string;
  to: Address;
  data: Hex;
  estimatedGas?: bigint;
}

export async function sweepAccountAssets(
  status: AccountDeletionStatus,
  targetAddress: string,
  privateKey: Uint8Array,
  onProgress?: (message: string) => void,
): Promise<void> {
  if (!isAddress(targetAddress)) {
    throw new Error('Enter a valid EVM destination address.');
  }

  const target = targetAddress as Address;
  const privateKeyHex = `0x${Array.from(privateKey)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
  const account = privateKeyToAccount(privateKeyHex);
  if (account.address.toLowerCase() !== status.walletAddress.toLowerCase()) {
    throw new Error('The unlocked Passkey does not match this wallet.');
  }
  if (account.address.toLowerCase() === target.toLowerCase()) {
    throw new Error('Choose a different destination wallet.');
  }

  const publicClient = createPublicClient({
    chain: DEFAULT_CHAIN_VIEM,
    transport: http(),
  });
  const walletClient = createWalletClient({
    account,
    chain: DEFAULT_CHAIN_VIEM,
    transport: http(),
  });

  const targetCode = await publicClient.getCode({ address: target });
  if (targetCode && targetCode !== '0x') {
    throw new Error('For a complete sweep, use a regular EVM wallet address rather than a contract.');
  }

  const actions: SweepAction[] = [];
  for (const token of status.fungibleTokens) {
    if (!isAddress(token.contractAddress) || BigInt(token.balanceRaw) <= 0n) continue;
    actions.push({
      label: token.symbol,
      to: token.contractAddress as Address,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [target, BigInt(token.balanceRaw)],
      }),
    });
  }

  for (const nft of status.nfts) {
    if (
      !isAddress(nft.contractAddress) ||
      !nft.tokenId ||
      nft.tokenType === 'OTHER'
    ) continue;

    const data = nft.tokenType === 'ERC-721'
      ? encodeFunctionData({
          abi: erc721Abi,
          functionName: 'transferFrom',
          args: [account.address, target, BigInt(nft.tokenId)],
        })
      : encodeFunctionData({
          abi: erc1155Abi,
          functionName: 'safeTransferFrom',
          args: [
            account.address,
            target,
            BigInt(nft.tokenId),
            BigInt(nft.balanceRaw),
            '0x',
          ],
        });
    actions.push({
      label: `${nft.symbol} #${nft.tokenId}`,
      to: nft.contractAddress as Address,
      data,
    });
  }

  const unsupported = status.blockers.filter(
    (blocker) => !blocker.canAutoSweep,
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Move or settle these assets first: ${unsupported.map((item) => item.label).join(', ')}.`,
    );
  }

  const initialNativeBalance = await publicClient.getBalance({ address: account.address });
  const gasPrice = await publicClient.getGasPrice();
  let contractFeeBudget = 0n;
  for (const action of actions) {
    const estimate = await publicClient.estimateGas({
      account: account.address,
      to: action.to,
      data: action.data,
    });
    action.estimatedGas = (estimate * 120n + 99n) / 100n;
    contractFeeBudget += action.estimatedGas * gasPrice;
  }
  const nativeTransferFeeBudget = 21_000n * gasPrice;
  if (
    actions.length > 0 &&
    initialNativeBalance < contractFeeBudget + nativeTransferFeeBudget
  ) {
    throw new Error(
      `Add at least ${formatEther(contractFeeBudget + nativeTransferFeeBudget - initialNativeBalance)} INJ for sweep gas.`,
    );
  }

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    onProgress?.(`Moving ${action.label} (${index + 1}/${actions.length})`);
    const hash = await walletClient.sendTransaction({
      to: action.to,
      data: action.data,
      gas: action.estimatedGas,
      gasPrice,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const nativeBalance = await publicClient.getBalance({ address: account.address });
  if (nativeBalance > 0n) {
    onProgress?.('Moving remaining EVM INJ');
    const finalGasPrice = await publicClient.getGasPrice();
    const finalFee = 21_000n * finalGasPrice;
    if (nativeBalance <= finalFee) {
      throw new Error('The remaining INJ is below the network fee. Add a small amount of INJ and sweep again.');
    }
    const hash = await walletClient.sendTransaction({
      to: target,
      value: nativeBalance - finalFee,
      gas: 21_000n,
      gasPrice: finalGasPrice,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  onProgress?.('Checking remaining assets');
}

export async function signalDeletedPasskey(credentialId: string): Promise<boolean> {
  const signalApi = PublicKeyCredential as typeof PublicKeyCredential & {
    signalUnknownCredential?: (options: {
      rpId: string;
      credentialId: string;
    }) => Promise<void>;
  };
  if (typeof signalApi.signalUnknownCredential !== 'function') return false;

  const base64UrlCredentialId = credentialId
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  try {
    await signalApi.signalUnknownCredential({
      rpId: window.location.hostname,
      credentialId: base64UrlCredentialId,
    });
    return true;
  } catch {
    return false;
  }
}
