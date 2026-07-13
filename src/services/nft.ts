/**
 * NFT Service for Injective EVM
 * 
 * This service fetches NFT data from ERC-721 contracts on Injective EVM.
 */

import { 
  createPublicClient, 
  http,
  type Address,
  type Hash,
} from 'viem';
import { NETWORK_CONFIG } from '@/config/network';
import { DEFAULT_CHAIN_VIEM } from '@/types/chain';

// N1NJ4 NFT Contract Address on Injective EVM
export const N1NJ4_CONTRACT_ADDRESS = '0x816070929010a3d202d8a6b89f92bee33b7e8769' as Address;

// ERC-721 ABI for basic NFT operations
const ERC721_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
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
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
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
] as const;

/**
 * NFT Metadata structure
 */
export interface NFTMetadata {
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

/**
 * NFT data structure
 */
export interface NFT {
  contractAddress: Address;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  metadata?: NFTMetadata;
  collection: string;
  owner: Address;
  tokenURI?: string;
  mintTxHash?: Hash;
}

interface BlockscoutTokenInstance {
  id?: string;
  image_url?: string | null;
  media_url?: string | null;
  metadata?: NFTMetadata | null;
  owner?: {
    hash?: string;
  } | null;
  token?: {
    name?: string | null;
  } | null;
}

interface BlockscoutTokenInstancesResponse {
  items?: BlockscoutTokenInstance[];
}

function extractTokenIdFromBlockscoutItem(item: BlockscoutTokenInstance): string | null {
  const edition = item.metadata?.edition;
  if (typeof edition === 'number' && Number.isFinite(edition)) {
    return String(edition);
  }

  const nameMatch = item.metadata?.name?.match(/#(\d+)$/);
  if (nameMatch?.[1]) {
    return nameMatch[1];
  }

  const imageLike = item.metadata?.image || item.image_url || item.media_url || '';
  const imageMatch = imageLike.match(/\/(\d+)\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i);
  if (imageMatch?.[1]) {
    return imageMatch[1];
  }

  return null;
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
 * Fetch NFT metadata from URI
 */
async function fetchMetadata(tokenURI: string): Promise<NFTMetadata | null> {
  try {
    // Handle IPFS URIs
    let url = tokenURI;
    if (tokenURI.startsWith('ipfs://')) {
      url = tokenURI.replace('ipfs://', NETWORK_CONFIG.ipfsGateway);
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch metadata from ${url}`);
      return null;
    }

    const metadata = await response.json() as NFTMetadata;
    
    // Handle IPFS image URLs in metadata
    if (metadata.image?.startsWith('ipfs://')) {
      metadata.image = metadata.image.replace('ipfs://', NETWORK_CONFIG.ipfsGateway);
    }

    return metadata;
  } catch (error) {
    console.error('Failed to fetch NFT metadata:', error);
    return null;
  }
}

async function getNFTsFromBlockscout(
  contractAddress: Address,
  ownerAddress: Address,
): Promise<NFT[]> {
  try {
    const apiUrl = NETWORK_CONFIG.isMainnet
      ? NETWORK_CONFIG.mainnet.explorerApiUrl
      : NETWORK_CONFIG.testnet.explorerApiUrl;

    const url = `${apiUrl}/api/v2/tokens/${contractAddress}/instances?holder_address_hash=${ownerAddress}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[NFT] Blockscout fallback request failed:', response.status);
      return [];
    }

    const data = (await response.json()) as BlockscoutTokenInstancesResponse;
    const items = data.items || [];

    return items
      .map((item) => {
        const tokenId = extractTokenIdFromBlockscoutItem(item);
        if (!tokenId) {
          return null;
        }

        const metadata = item.metadata || undefined;
        const name = metadata?.name || `${item.token?.name || 'NFT'} #${tokenId}`;
        const image = metadata?.image?.startsWith('ipfs://')
          ? metadata.image.replace('ipfs://', NETWORK_CONFIG.ipfsGateway)
          : (metadata?.image || item.image_url || undefined);

        return {
          contractAddress,
          tokenId,
          name,
          description: metadata?.description,
          image,
          metadata,
          collection: item.token?.name || 'Unknown',
          owner: ((item.owner?.hash as Address) || ownerAddress),
        } as NFT;
      })
      .filter((nft): nft is NFT => nft !== null);
  } catch (error) {
    console.error('[NFT] Blockscout fallback failed:', error);
    return [];
  }
}

/**
 * Get NFT balance for an address
 */
export async function getNFTBalance(
  contractAddress: Address,
  ownerAddress: Address
): Promise<number> {
  try {
    const client = createClient();
    
    const balance = await client.readContract({
      address: contractAddress,
      abi: ERC721_ABI,
      functionName: 'balanceOf',
      args: [ownerAddress],
    }) as bigint;

    return Number(balance);
  } catch (error) {
    console.error('Failed to get NFT balance:', error);
    return 0;
  }
}

/**
 * Get token ID by index for an owner
 */
export async function getTokenByIndex(
  contractAddress: Address,
  ownerAddress: Address,
  index: number
): Promise<bigint | null> {
  try {
    const client = createClient();
    
    const tokenId = await client.readContract({
      address: contractAddress,
      abi: ERC721_ABI,
      functionName: 'tokenOfOwnerByIndex',
      args: [ownerAddress, BigInt(index)],
    }) as bigint;

    return tokenId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('execution reverted')) {
      console.warn('[NFT] tokenOfOwnerByIndex not available on this contract, will use fallback indexer data.');
      return null;
    }
    console.error(`Failed to get token at index ${index}:`, error);
    return null;
  }
}

/**
 * Get NFT collection info
 */
export async function getCollectionInfo(contractAddress: Address): Promise<{
  name: string;
  symbol: string;
}> {
  try {
    const client = createClient();
    
    const [name, symbol] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: ERC721_ABI,
        functionName: 'name',
      }) as Promise<string>,
      client.readContract({
        address: contractAddress,
        abi: ERC721_ABI,
        functionName: 'symbol',
      }) as Promise<string>,
    ]);

    return { name, symbol };
  } catch (error) {
    console.error('Failed to get collection info:', error);
    return { name: 'Unknown', symbol: 'UNKNOWN' };
  }
}

/**
 * Get NFT details for a specific token ID
 */
export async function getNFTDetails(
  contractAddress: Address,
  tokenId: bigint
): Promise<NFT | null> {
  try {
    const client = createClient();
    
    // Get basic NFT info
    const [tokenURI, owner, collectionInfo] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: ERC721_ABI,
        functionName: 'tokenURI',
        args: [tokenId],
      }) as Promise<string>,
      client.readContract({
        address: contractAddress,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }) as Promise<Address>,
      getCollectionInfo(contractAddress),
    ]);

    // Fetch metadata
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
    };
  } catch (error) {
    console.error(`Failed to get NFT details for token ${tokenId}:`, error);
    return null;
  }
}

/**
 * Get all NFTs owned by an address for a specific contract
 */
export async function getUserNFTs(
  contractAddress: Address,
  ownerAddress: Address
): Promise<NFT[]> {
  try {
    console.log('[NFT] Fetching NFTs for address:', ownerAddress);
    
    // Get balance
    const balance = await getNFTBalance(contractAddress, ownerAddress);
    console.log('[NFT] NFT balance:', balance);
    
    if (balance === 0) {
      return [];
    }

    // Get all token IDs
    const tokenIds: bigint[] = [];
    for (let i = 0; i < balance; i++) {
      const tokenId = await getTokenByIndex(contractAddress, ownerAddress, i);
      if (tokenId !== null) {
        tokenIds.push(tokenId);
      }
    }

    console.log('[NFT] Token IDs:', tokenIds.map(id => id.toString()));

    // Some ERC-721 contracts do not implement ERC721Enumerable.
    // If tokenOfOwnerByIndex fails but balance > 0, fallback to Blockscout indexer data.
    if (tokenIds.length === 0 && balance > 0) {
      const fallbackNFTs = await getNFTsFromBlockscout(contractAddress, ownerAddress);
      console.log('[NFT] Fallback NFTs via Blockscout:', fallbackNFTs.length);
      if (fallbackNFTs.length > 0) {
        return fallbackNFTs;
      }
    }

    // Get details for all tokens (in parallel, but limit concurrency)
    const nfts: NFT[] = [];
    const batchSize = 5; // Process 5 at a time to avoid rate limits
    
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      const batchNFTs = await Promise.all(
        batch.map(tokenId => getNFTDetails(contractAddress, tokenId))
      );
      nfts.push(...batchNFTs.filter((nft): nft is NFT => nft !== null));
    }

    console.log('[NFT] Fetched NFTs:', nfts.length);
    return nfts;
  } catch (error) {
    console.error('Failed to get user NFTs:', error);
    return [];
  }
}

/**
 * Get all N1NJ4 NFTs for a user
 */
export async function getN1NJ4NFTs(ownerAddress: Address): Promise<NFT[]> {
  return getUserNFTs(N1NJ4_CONTRACT_ADDRESS, ownerAddress);
}

/**
 * Check whether a wallet owns at least one N1NJ4 NFT.
 * Uses the same core rule as NFT-verify: balanceOf(owner) > 0.
 */
export async function hasN1NJ4NFT(ownerAddress: Address): Promise<boolean> {
  const balance = await getNFTBalance(N1NJ4_CONTRACT_ADDRESS, ownerAddress);
  return balance > 0;
}
