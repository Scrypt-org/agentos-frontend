import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

function privateKeyHex(privateKey: Uint8Array): Hex {
  return `0x${Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function signTypedDataJson(
  privateKey: Uint8Array,
  value: string,
): Promise<Hex> {
  const typedData = JSON.parse(value) as {
    domain: {
      name?: string;
      version?: string;
      chainId?: number | string;
      verifyingContract?: Address;
    };
    primaryType: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
  };
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
