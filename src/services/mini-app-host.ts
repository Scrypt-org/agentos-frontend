import {
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { MiniAppManifest } from '@/config/mini-apps';

export class MiniAppHostError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'MiniAppHostError';
    this.code = code;
    this.data = data;
  }
}
interface MiniAppRpcContext {
  manifest: MiniAppManifest;
  address: Address | null;
  getPrivateKey: () => Promise<Uint8Array>;
}

function privateKeyHex(privateKey: Uint8Array): Hex {
  return `0x${Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('')}` as Hex;
}

function toBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return BigInt(String(value));
}

function chainFromManifest(manifest: MiniAppManifest): Chain {
  return {
    id: manifest.chainId,
    name: `${manifest.name} Monad network`,
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [manifest.rpcUrl] } },
  };
}

function requirePermission(manifest: MiniAppManifest, permission: MiniAppManifest['permissions'][number]): void {
  if (!manifest.permissions.includes(permission)) {
    throw new MiniAppHostError(4100, `${manifest.name} is not allowed to use ${permission}.`);
  }
}

async function forwardRpc(manifest: MiniAppManifest, method: string, params: unknown[]): Promise<unknown> {
  requirePermission(manifest, 'read');
  const response = await fetch(manifest.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const payload = await response.json() as { result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
  if (payload.error) {
    throw new MiniAppHostError(payload.error.code ?? -32603, payload.error.message || 'Monad RPC error', payload.error.data);
  }
  return payload.result;
}

export async function handleMiniAppRpc(
  method: string,
  params: unknown[] = [],
  context: MiniAppRpcContext,
): Promise<unknown> {
  const { manifest } = context;
  if (method === 'eth_accounts') {
    requirePermission(manifest, 'accounts');
    return context.address ? [context.address] : [];
  }
  if (method === 'eth_requestAccounts') {
    requirePermission(manifest, 'accounts');
    if (!context.address) throw new MiniAppHostError(4100, 'Log in to AgentOS first.');
    return [context.address];
  }
  if (method === 'eth_chainId') return `0x${manifest.chainId.toString(16)}`;
  if (method === 'net_version') return String(manifest.chainId);
  if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
    const requested = (params[0] as { chainId?: string } | undefined)?.chainId;
    if (requested && Number.parseInt(requested, 16) !== manifest.chainId) {
      throw new MiniAppHostError(4902, `${manifest.name} is registered for chain ${manifest.chainId}.`);
    }
    return null;
  }
  if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') {
    return manifest.permissions.map((permission) => ({ parentCapability: permission === 'accounts' ? 'eth_accounts' : permission }));
  }

  if (method === 'eth_sendTransaction') {
    requirePermission(manifest, 'transactions');
    if (!context.address) throw new MiniAppHostError(4100, 'Log in to AgentOS first.');
    const tx = params[0] as Record<string, unknown> | undefined;
    if (!tx?.to) throw new MiniAppHostError(-32602, 'A transaction recipient is required.');
    const requestedFrom = String(tx.from || '');
    if (requestedFrom && requestedFrom.toLowerCase() !== context.address.toLowerCase()) {
      throw new MiniAppHostError(4100, 'The transaction sender is not the authenticated AgentOS wallet.');
    }
    const to = String(tx.to) as Address;
    if (
      manifest.allowedContracts?.length
      && !manifest.allowedContracts.some((contract) => contract.toLocaleLowerCase() === to.toLocaleLowerCase())
    ) {
      throw new MiniAppHostError(4100, `${manifest.name} cannot transact with this contract.`);
    }
    const privateKey = await context.getPrivateKey();
    const account = privateKeyToAccount(privateKeyHex(privateKey));
    const client = createWalletClient({
      account,
      chain: chainFromManifest(manifest),
      transport: http(manifest.rpcUrl),
    });
    return client.sendTransaction({
      account,
      to,
      data: tx.data ? String(tx.data) as Hex : undefined,
      value: toBigInt(tx.value),
      gas: toBigInt(tx.gas),
      nonce: tx.nonce === undefined ? undefined : Number(toBigInt(tx.nonce)),
    });
  }

  if (method === 'personal_sign' || method === 'eth_sign') {
    requirePermission(manifest, 'sign');
    if (!context.address) throw new MiniAppHostError(4100, 'Log in to AgentOS first.');
    const requestedAddress = String(method === 'personal_sign' ? params[1] || '' : params[0] || '');
    if (requestedAddress && requestedAddress.toLowerCase() !== context.address.toLowerCase()) {
      throw new MiniAppHostError(4100, 'The requested signing account is not the authenticated AgentOS wallet.');
    }
    const privateKey = await context.getPrivateKey();
    const account = privateKeyToAccount(privateKeyHex(privateKey));
    const raw = String(method === 'personal_sign' ? params[0] : params[1] || params[0]) as Hex;
    return account.signMessage({ message: { raw } });
  }

  if (method === 'eth_signTypedData_v4') {
    requirePermission(manifest, 'sign');
    if (!context.address) throw new MiniAppHostError(4100, 'Log in to AgentOS first.');
    const requestedAddress = String(params[0] || '');
    if (requestedAddress.toLowerCase() !== context.address.toLowerCase()) {
      throw new MiniAppHostError(4100, 'The requested signing account is not the authenticated AgentOS wallet.');
    }
    const typedData = JSON.parse(String(params[1] || '{}')) as {
      domain?: { chainId?: number | string; verifyingContract?: Address };
      primaryType?: string;
      types?: Record<string, Array<{ name: string; type: string }>>;
      message?: Record<string, unknown>;
    };
    const verifyingContract = typedData.domain?.verifyingContract;
    if (
      Number(typedData.domain?.chainId) !== manifest.chainId
      || !verifyingContract
      || (
        manifest.allowedContracts?.length
        && !manifest.allowedContracts.some(
          (contract) => contract.toLowerCase() === verifyingContract.toLowerCase(),
        )
      )
    ) {
      throw new MiniAppHostError(4100, 'Typed data is not authorized for this mini app contract.');
    }
    const claimer = typedData.message?.claimer;
    if (
      typeof claimer === 'string'
      && claimer.toLowerCase() !== context.address.toLowerCase()
    ) {
      throw new MiniAppHostError(4100, 'The claim beneficiary is not the authenticated AgentOS wallet.');
    }
    const privateKey = await context.getPrivateKey();
    const account = privateKeyToAccount(privateKeyHex(privateKey));
    const { EIP712Domain: _domainType, ...types } = typedData.types || {};
    const domain = {
      ...typedData.domain,
      chainId: Number(typedData.domain?.chainId),
    };
    void _domainType;
    return account.signTypedData({
      domain,
      primaryType: typedData.primaryType || '',
      types,
      message: typedData.message || {},
    });
  }

  return forwardRpc(manifest, method, params);
}
