import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface TypedDataJson {
  domain: {
    name?: string;
    version?: string;
    chainId?: number | string;
    verifyingContract?: Address;
  };
  primaryType: string;
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}

function privateKeyHex(privateKey: Uint8Array): Hex {
  return `0x${Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function signTypedDataJson(
  privateKey: Uint8Array,
  value: string | TypedDataJson,
): Promise<Hex> {
  const typedData = typeof value === 'string'
    ? JSON.parse(value) as TypedDataJson
    : value;
  const { EIP712Domain: _, ...types } = typedData.types;
  void _;
  return privateKeyToAccount(privateKeyHex(privateKey)).signTypedData({
    domain: {
      ...typedData.domain,
      chainId: typedData.domain.chainId === undefined
        ? undefined
        : Number(typedData.domain.chainId),
    },
    primaryType: typedData.primaryType,
    types,
    message: typedData.message,
  });
}
