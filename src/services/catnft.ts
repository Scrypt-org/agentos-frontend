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
  recordSynced: boolean;
  recordSyncWarning?: string;
}

export interface CatMintRecordPayload {
  tokenId: string;
  txHash: Hash;
  ownerAddress: Address;
  source: string;
}

interface CatMintRecordSyncOptions {
  attempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface CatMintRecordSyncResult {
  recordSynced: boolean;
  recordSyncWarning?: string;
}

export interface CatMintCredits {
  mintCreditsRemaining: number;
  walletAddress: string | null;
}

interface IndexedCatNFTItem {
  tokenId: string;
  ownerAddress: string;
  txHash: string;
  mintedAt: string | null;
  name: string;
  description: string | null;
  image: string | null;
  attributes: CatNFTMetadata['attributes'];
  metadata: CatNFTMetadata | null;
}

interface IndexedCatNFTOwnership {
  ownerAddress: string;
  contractAddress: string;
  items: IndexedCatNFTItem[];
}

interface IndexedCatNFTOptions {
  fetchImpl?: typeof fetch;
  loadDetails?: (tokenId: bigint) => Promise<CatNFT | null>;
}

export async function waitForCatNftSponsorship(
  hash: Hash,
  waitForReceipt: (request: { hash: Hash }) => Promise<{ status: string }>,
): Promise<void> {
  const receipt = await waitForReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('CatNFT gas sponsorship transaction reverted. The mint was not submitted.');
  }
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

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

export async function syncCatMintRecord(
  payload: CatMintRecordPayload,
  options: CatMintRecordSyncOptions = {},
): Promise<CatMintRecordSyncResult> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delay = options.delay ?? wait;
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastError = 'Unable to persist the mint record.';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${API_BASE_URL}/catnft/mint-record`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (response.ok) return { recordSynced: true };

      const responsePayload = await response.json().catch(() => ({})) as { message?: unknown };
      lastError = typeof responsePayload.message === 'string'
        ? responsePayload.message
        : `Failed to persist mint record (${response.status})`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }

    if (attempt < attempts - 1) {
      await delay(Math.min(750 * (attempt + 1), 2_000));
    }
  }

  return {
    recordSynced: false,
    recordSyncWarning: `The NFT was minted on-chain, but its INJ Pass record is still syncing: ${lastError}`,
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

function resolveCatNftUri(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  return uri.startsWith('ipfs://')
    ? uri.replace('ipfs://', NETWORK_CONFIG.ipfsGateway)
    : uri;
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

export async function getIndexedCatNFTsForOwner(
  ownerAddress: Address,
  options: IndexedCatNFTOptions = {},
): Promise<CatNFT[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const loadDetails = options.loadDetails ?? getCatNFTDetails;

  try {
    const response = await fetchImpl(`${API_BASE_URL}/catnft/owned`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!response.ok) return [];

    const payload = await response.json() as IndexedCatNFTOwnership;
    if (
      payload.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase()
      || !/^0x[a-fA-F0-9]{40}$/.test(payload.contractAddress || '')
      || !Array.isArray(payload.items)
    ) {
      return [];
    }

    const contractAddress = payload.contractAddress as Address;
    const indexedItems = payload.items
      .filter((item) => /^\d+$/.test(item.tokenId) && BigInt(item.tokenId) > 0n)
      .map((item): CatNFT => {
        const metadata = item.metadata ?? {
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          ...(item.image ? { image: resolveCatNftUri(item.image) } : {}),
          ...(item.attributes?.length ? { attributes: item.attributes } : {}),
        };
        const image = resolveCatNftUri(item.image ?? metadata.image);
        if (metadata.image) metadata.image = resolveCatNftUri(metadata.image);

        return {
          contractAddress,
          tokenId: item.tokenId,
          name: item.name || `eric mfer #${item.tokenId.padStart(3, '0')}`,
          ...(item.description ? { description: item.description } : {}),
          ...(image ? { image } : {}),
          metadata,
          collection: 'eric mfer',
          owner: ownerAddress,
          tokenURI: '',
          ...(/^0x[a-fA-F0-9]{64}$/.test(item.txHash)
            ? { mintTxHash: item.txHash as Hash }
            : {}),
        };
      });

    const enriched = await Promise.all(indexedItems.map(async (indexed) => {
      try {
        const detail = await loadDetails(BigInt(indexed.tokenId));
        if (!detail) return indexed;
        if (detail.owner.toLowerCase() !== ownerAddress.toLowerCase()) return null;
        return detail;
      } catch {
        return indexed;
      }
    }));

    return enriched.filter((item): item is CatNFT => item !== null);
  } catch (error) {
    console.warn('[CatNFT] Failed to load indexed owner NFTs:', error);
    return [];
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

  if (voucherPayload.sponsorshipTxHash) {
    await waitForCatNftSponsorship(
      voucherPayload.sponsorshipTxHash,
      ({ hash: sponsorshipHash }) => client.waitForTransactionReceipt({
        hash: sponsorshipHash,
      }),
    );
  }

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

  const recordSync = await syncCatMintRecord({
    tokenId: tokenId.toString(),
    txHash: hash,
    ownerAddress: voucherPayload.voucher.to,
    source: endpoint === 'sponsored-mint-voucher' ? 'eric-mfer' : 'frontend',
  });

  return {
    hash,
    tokenId: typeof tokenId === 'bigint' ? tokenId.toString() : null,
    gasSponsored: voucherPayload.gasSponsored,
    sponsoredWei: voucherPayload.sponsoredWei,
    sponsorshipTxHash: voucherPayload.sponsorshipTxHash,
    ...recordSync,
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
