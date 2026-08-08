/**
 * Global Network and API Configuration
 */

// Monad testnet is the only deployment target right now. Both keys point at
// it so NEXT_PUBLIC_NETWORK can't accidentally resolve to a dead mainnet.
const MONAD_TESTNET = {
  name: 'Monad Testnet',
  chainId: 10143,
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorerUrl: 'https://testnet.monadexplorer.com',
  // Monadscan (Etherscan-compatible API), not Blockscout.
  explorerApiUrl: 'https://api-testnet.monadscan.com/api',
  bridgeUrl: 'https://faucet.monad.xyz',
};

export const NETWORK_CONFIG = {
  // Chain Selection (can be switched via environment variable)
  isMainnet: process.env.NEXT_PUBLIC_NETWORK !== 'testnet',

  mainnet: MONAD_TESTNET,
  testnet: MONAD_TESTNET,

  // Backend API
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,

  // External APIs
  coingeckoApi: 'https://api.coingecko.com/api/v3',
  ipfsGateway: 'https://ipfs.io/ipfs/',
  faviconService: 'https://www.google.com/s2/favicons?domain=',
};

// Current active configuration based on environment
export const ACTIVE_NETWORK = NETWORK_CONFIG.isMainnet
  ? NETWORK_CONFIG.mainnet
  : NETWORK_CONFIG.testnet;
