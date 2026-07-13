import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ACTIVE_NETWORK, NETWORK_CONFIG } from '@/config/network';
import { INJECTIVE_MAINNET_CHAIN, INJECTIVE_TESTNET_CHAIN } from '@/types/chain';
import { API_BASE_URL } from './api-base';
import { getAuthToken } from './passkey';

export interface CatNFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  edition?: number;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  external_url?: string;
}

export interface CatNFT {
  contractAddress: Address;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  metadata?: CatNFTMetadata;
  collection: string;
  owner: Address;
  tokenURI: string;
  mintTxHash?: Hash;
}

export interface CatCollectionInfo {
  name: string;
  symbol: string;
  baseURI: string;
  maxSupply: number;
  totalMinted: number;
}

export interface CatMintResult {
  hash: Hash;
  tokenId: string | null;
  gasSponsored?: boolean;
  sponsoredWei?: string;
  sponsorshipTxHash?: Hash;
}

export interface CatMintCredits {
  mintCreditsRemaining: number;
  walletAddress: string | null;
}

const CATNFT_ABI = [
  {
    inputs: [],
    name: 'mint',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'to', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiresAt', type: 'uint64' },
          { name: 'quantity', type: 'uint32' },
        ],
        name: 'voucher',
        type: 'tuple',
      },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'mintWithVoucher',
    outputs: [
      { name: 'firstTokenId', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'baseURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalMinted',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'mintedCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
    name: 'Minted',
    type: 'event',
  },
] as const;

function getChain() {
  return NETWORK_CONFIG.isMainnet ? INJECTIVE_MAINNET_CHAIN : INJECTIVE_TESTNET_CHAIN;
}

function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function createClient() {
  return createPublicClient({
    chain: getChain(),
    transport: http(),
  });
}

async function assertCatNFTContractDeployed(client = createClient()) {
  const contractAddress = getCatNFTContractAddress();
  const bytecode = await client.getBytecode({ address: contractAddress });

  if (!bytecode || bytecode === '0x') {
    throw new Error(
      `No CatNFT contract found at ${contractAddress} on ${ACTIVE_NETWORK.name}. Check NEXT_PUBLIC_NETWORK and NEXT_PUBLIC_CATNFT_CONTRACT_ADDRESS.`,
    );
  }
}

export function hasCatNFTContractAddress() {
  const contractAddress = process.env.NEXT_PUBLIC_CATNFT_CONTRACT_ADDRESS?.trim();
  return Boolean(contractAddress && /^0x[a-fA-F0-9]{40}$/.test(contractAddress));
}

export function getCatNFTContractAddress(): Address {
  const contractAddress = process.env.NEXT_PUBLIC_CATNFT_CONTRACT_ADDRESS?.trim();
  if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    throw new Error('NEXT_PUBLIC_CATNFT_CONTRACT_ADDRESS is required and must be a valid 0x address.');
  }

  return contractAddress as Address;
}

async function fetchMetadata(tokenURI: string): Promise<CatNFTMetadata | null> {
  try {
    let url = tokenURI;
    if (tokenURI.startsWith('ipfs://')) {
      url = tokenURI.replace('ipfs://', NETWORK_CONFIG.ipfsGateway);
    }

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const metadata = (await response.json()) as CatNFTMetadata;
    if (metadata.image?.startsWith('ipfs://')) {
      metadata.image = metadata.image.replace('ipfs://', NETWORK_CONFIG.ipfsGateway);
    }

    return metadata;
  } catch (error) {
    console.error('[CatNFT] Failed to fetch metadata:', error);
    return null;
  }
}

export async function getCatCollectionInfo(): Promise<CatCollectionInfo> {
  const contractAddress = getCatNFTContractAddress();
  const client = createClient();

  await assertCatNFTContractDeployed(client);

  try {
    const [name, symbol, baseURI, maxSupply, totalMinted] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'name',
      }) as Promise<string>,
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'baseURI',
      }) as Promise<string>,
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'maxSupply',
      }) as Promise<bigint>,
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'totalMinted',
      }) as Promise<bigint>,
    ]);

    return {
      name,
      symbol,
      baseURI,
      maxSupply: Number(maxSupply),
      totalMinted: Number(totalMinted),
    };
  } catch (error) {
    console.error('[CatNFT] Failed to load collection info:', error);
    return {
      name: 'CatNFT',
      symbol: 'CAT',
      baseURI: '',
      maxSupply: 0,
      totalMinted: 0,
    };
  }
}

export async function getCatNFTDetails(tokenId: bigint): Promise<CatNFT | null> {
  try {
    const contractAddress = getCatNFTContractAddress();
    const client = createClient();

    const [tokenURI, owner, collectionInfo] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'tokenURI',
        args: [tokenId],
      }) as Promise<string>,
      client.readContract({
        address: contractAddress,
        abi: CATNFT_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }) as Promise<Address>,
      getCatCollectionInfo(),
    ]);

    const metadata = await fetchMetadata(tokenURI);

    return {
      contractAddress,
      tokenId: tokenId.toString(),
      name: metadata?.name || `${collectionInfo.name} #${tokenId}`,
      description: metadata?.description,
      image: metadata?.image,
      metadata: metadata || undefined,
      collection: collectionInfo.name,
      owner,
      tokenURI,
    };
  } catch (error) {
    console.error(`[CatNFT] Failed to load token ${tokenId.toString()}:`, error);
    return null;
  }
}

async function getCatNFTsForOwnerByScanning(ownerAddress: Address): Promise<CatNFT[]> {
  const collectionInfo = await getCatCollectionInfo();
  const totalMinted = Math.min(collectionInfo.totalMinted, collectionInfo.maxSupply);
  const nfts: CatNFT[] = [];

  for (let tokenId = BigInt(totalMinted); tokenId >= 1n; tokenId -= 1n) {
    const nft = await getCatNFTDetails(tokenId);
    if (nft?.owner.toLowerCase() === ownerAddress.toLowerCase()) {
      nfts.push(nft);
    }
  }

  return nfts;
}

export async function getCatNFTsForOwner(ownerAddress: Address): Promise<CatNFT[]> {
  try {
    const contractAddress = getCatNFTContractAddress();
    const client = createClient();

    await assertCatNFTContractDeployed(client);

    const balance = await client.readContract({
      address: contractAddress,
      abi: CATNFT_ABI,
      functionName: 'balanceOf',
      args: [ownerAddress],
    }) as bigint;

    if (balance === 0n) {
      return [];
    }

    try {
      const [mintLogs, transferLogs] = await Promise.all([
        client.getLogs({
          address: contractAddress,
          event: parseAbiItem('event Minted(address indexed to, uint256 indexed tokenId)'),
          args: { to: ownerAddress },
          fromBlock: 0n,
          toBlock: 'latest',
        }),
        client.getLogs({
          address: contractAddress,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
          args: { to: ownerAddress },
          fromBlock: 0n,
          toBlock: 'latest',
        }),
      ]);

      const mintTxHashes = new Map<string, Hash>();
      for (const log of mintLogs) {
        const tokenId = log.args?.tokenId;
        if (typeof tokenId === 'bigint' && log.transactionHash) {
          mintTxHashes.set(tokenId.toString(), log.transactionHash);
        }
      }

      const tokenIds = [...mintLogs, ...transferLogs]
        .sort((a, b) => {
          if (a.blockNumber === b.blockNumber) {
            return a.logIndex > b.logIndex ? -1 : 1;
          }
          return a.blockNumber > b.blockNumber ? -1 : 1;
        })
        .map((log) => log.args?.tokenId)
        .filter((tokenId): tokenId is bigint => typeof tokenId === 'bigint');

      const seen = new Set<string>();
      const nfts: CatNFT[] = [];
      for (const tokenId of tokenIds) {
        const key = tokenId.toString();
        if (seen.has(key)) continue;
        seen.add(key);

        const nft = await getCatNFTDetails(tokenId);
        if (nft?.owner.toLowerCase() === ownerAddress.toLowerCase()) {
          nfts.push({
            ...nft,
            mintTxHash: mintTxHashes.get(key),
          });
          if (nfts.length >= Number(balance)) {
            return nfts;
          }
        }
      }

      if (nfts.length > 0) {
        return nfts;
      }
    } catch (error) {
      console.warn('[CatNFT] Event lookup failed, scanning minted tokens:', error);
    }

    return await getCatNFTsForOwnerByScanning(ownerAddress);
  } catch (error) {
    console.error('[CatNFT] Failed to load owner NFTs:', error);
    return [];
  }
}

export async function getCatNFTForOwner(ownerAddress: Address): Promise<CatNFT | null> {
  const nfts = await getCatNFTsForOwner(ownerAddress);
  return nfts[0] ?? null;
}

async function mintCatNFTWithVoucherEndpoint(
  privateKey: Uint8Array,
  endpoint: 'mint-voucher' | 'sponsored-mint-voucher',
): Promise<CatMintResult> {
  const contractAddress = getCatNFTContractAddress();
  const client = createClient();

  await assertCatNFTContractDeployed(client);

  const account = privateKeyToAccount(`0x${Array.from(privateKey)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: getChain(),
    transport: http(),
  });

  const voucherResponse = await fetch(`${API_BASE_URL}/catnft/${endpoint}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ quantity: 1 }),
  });

  if (!voucherResponse.ok) {
    const payload = await voucherResponse.json().catch(() => ({}));
    const message = typeof payload?.message === 'string'
      ? payload.message
      : 'Failed to issue mint voucher';
    throw new Error(message);
  }

  const voucherPayload = await voucherResponse.json() as {
    voucher: {
      to: Address;
      nonce: string;
      expiresAt: number;
      quantity: number;
    };
    signature: `0x${string}`;
    gasLimit?: string;
    gasSponsored?: boolean;
    sponsoredWei?: string;
    sponsorshipTxHash?: Hash;
  };

  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: CATNFT_ABI,
    functionName: 'mintWithVoucher',
    args: [
      {
        to: voucherPayload.voucher.to,
        nonce: BigInt(voucherPayload.voucher.nonce),
        expiresAt: BigInt(voucherPayload.voucher.expiresAt),
        quantity: voucherPayload.voucher.quantity,
      },
      voucherPayload.signature,
    ],
    gas: voucherPayload.gasLimit ? BigInt(voucherPayload.gasLimit) : undefined,
  });

  const receipt = await client.waitForTransactionReceipt({ hash });
  const decodedLogs = parseEventLogs({ abi: CATNFT_ABI, logs: receipt.logs });
  const mintLog = decodedLogs.find((log) => log.eventName === 'Minted');
  const tokenId = mintLog?.args && 'tokenId' in mintLog.args ? mintLog.args.tokenId : null;

  if (receipt.status !== 'success') {
    throw new Error('Mint transaction reverted.');
  }

  if (typeof tokenId !== 'bigint') {
    throw new Error('Mint transaction succeeded but no CatNFT Minted event was found. Check the contract address and network.');
  }

  const recordResponse = await fetch(`${API_BASE_URL}/catnft/mint-record`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      tokenId: tokenId.toString(),
      txHash: hash,
      ownerAddress: account.address,
      source: endpoint === 'sponsored-mint-voucher' ? 'eric-mfer' : 'frontend',
    }),
  });

  if (!recordResponse.ok) {
    const payload = await recordResponse.json().catch(() => ({}));
    const message = typeof payload?.message === 'string'
      ? payload.message
      : `Failed to persist mint record (${recordResponse.status})`;
    throw new Error(
      `Mint transaction succeeded (${hash}), but backend record failed: ${message}`,
    );
  }

  return {
    hash,
    tokenId: typeof tokenId === 'bigint' ? tokenId.toString() : null,
    gasSponsored: voucherPayload.gasSponsored,
    sponsoredWei: voucherPayload.sponsoredWei,
    sponsorshipTxHash: voucherPayload.sponsorshipTxHash,
  };
}

export async function mintCatNFT(privateKey: Uint8Array): Promise<CatMintResult> {
  return mintCatNFTWithVoucherEndpoint(privateKey, 'mint-voucher');
}

export async function mintSponsoredCatNFT(privateKey: Uint8Array): Promise<CatMintResult> {
  return mintCatNFTWithVoucherEndpoint(privateKey, 'sponsored-mint-voucher');
}

export async function getCatMintCredits(): Promise<CatMintCredits> {
  try {
    const response = await fetch(`${API_BASE_URL}/catnft/credits`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return {
        mintCreditsRemaining: 0,
        walletAddress: null,
      };
    }

    const payload = await response.json() as Partial<CatMintCredits>;
    return {
      mintCreditsRemaining: Number.isFinite(Number(payload.mintCreditsRemaining))
        ? Number(payload.mintCreditsRemaining)
        : 0,
      walletAddress: payload.walletAddress || null,
    };
  } catch (error) {
    console.error('[CatNFT] Failed to load mint credits:', error);
    return {
      mintCreditsRemaining: 0,
      walletAddress: null,
    };
  }
}
