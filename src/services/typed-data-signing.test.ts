import { describe, expect, it } from 'vitest';
import { recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { signTypedDataJson } from './typed-data-signing';

const privateKey = `0x${'01'.padStart(64, '0')}` as `0x${string}`;

describe('typed data signing', () => {
  it('produces an EIP-712 signature for the unlocked wallet', async () => {
    const account = privateKeyToAccount(privateKey);
    const typedData = {
      domain: {
        name: 'InjGift',
        version: '1',
        chainId: 1776,
        verifyingContract: '0x5373A185ee8017eeDD8bF51C009f5A1F058A8D02',
      },
      primaryType: 'ClaimPermit',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ClaimPermit: [
          { name: 'id', type: 'bytes32' },
          { name: 'pwdHash', type: 'bytes32' },
          { name: 'claimer', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      message: {
        id: `0x${'11'.repeat(32)}`,
        pwdHash: `0x${'22'.repeat(32)}`,
        claimer: account.address,
        nonce: '0',
        deadline: '2000000000',
      },
    } as const;

    const signature = await signTypedDataJson(
      Uint8Array.from(Buffer.from(privateKey.slice(2), 'hex')),
      JSON.stringify(typedData),
    );
    const { EIP712Domain: _, ...types } = typedData.types;
    void _;
    await expect(recoverTypedDataAddress({
      domain: typedData.domain,
      primaryType: typedData.primaryType,
      types,
      message: {
        ...typedData.message,
        nonce: BigInt(typedData.message.nonce),
        deadline: BigInt(typedData.message.deadline),
      },
      signature,
    })).resolves.toBe(account.address);
  });

  it('signs the backend Circle TransferWithAuthorization object', async () => {
    const account = privateKeyToAccount(privateKey);
    const typedData = {
      domain: {
        name: 'USDC',
        version: '2',
        chainId: '1',
        verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      },
      primaryType: 'TransferWithAuthorization',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      message: {
        from: account.address,
        to: '0x1111111111111111111111111111111111111111',
        value: '1000000',
        validAfter: '0',
        validBefore: '2000000000',
        nonce: `0x${'33'.repeat(32)}`,
      },
    } as const;

    const signature = await signTypedDataJson(
      Uint8Array.from(Buffer.from(privateKey.slice(2), 'hex')),
      typedData,
    );
    const { EIP712Domain: _, ...types } = typedData.types;
    void _;
    await expect(recoverTypedDataAddress({
      domain: {
        ...typedData.domain,
        chainId: Number(typedData.domain.chainId),
      },
      primaryType: typedData.primaryType,
      types,
      message: {
        ...typedData.message,
        value: BigInt(typedData.message.value),
        validAfter: BigInt(typedData.message.validAfter),
        validBefore: BigInt(typedData.message.validBefore),
      },
      signature,
    })).resolves.toBe(account.address);
  });
});
