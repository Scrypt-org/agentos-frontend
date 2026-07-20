import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  recoverMessageAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem';

import type { MiniAppManifest } from '@/config/mini-apps';
import { handleMiniAppRpc } from '@/services/mini-app-host';

const PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
const account = privateKeyToAccount(PRIVATE_KEY);
const otherAddress = '0x0000000000000000000000000000000000000002' as Address;

function manifest(permissions: MiniAppManifest['permissions']): MiniAppManifest {
  return {
    appId: 'inj-gift',
    slug: 'gift',
    name: 'INJ Gift',
    productionUrl: 'https://gift.example',
    networkName: 'Injective EVM Testnet',
    chainId: 1439,
    rpcUrl: 'https://rpc.example',
    permissions,
  };
}

function context(permissions: MiniAppManifest['permissions']) {
  return {
    manifest: manifest(permissions),
    address: account.address,
    getPrivateKey: async () => Uint8Array.from(Buffer.from(PRIVATE_KEY.slice(2), 'hex')),
  };
}

describe('handleMiniAppRpc signing authorization', () => {
  it('returns a personal_sign signature recoverable to the authenticated wallet', async () => {
    const message = '0x68656c6c6f' as Hex;
    const signature = await handleMiniAppRpc(
      'personal_sign',
      [message, account.address],
      context(['sign']),
    ) as Hex;

    await expect(recoverMessageAddress({ message: { raw: message }, signature }))
      .resolves.toBe(account.address);
  });

  it('rejects personal_sign when the requested address is not the authenticated wallet', async () => {
    const request = handleMiniAppRpc(
      'personal_sign',
      ['0x68656c6c6f', otherAddress],
      context(['sign']),
    );
    await expect(request).rejects.toMatchObject({ code: 4100 });
  });

  it('rejects signing when the manifest lacks sign permission', async () => {
    const request = handleMiniAppRpc(
      'personal_sign',
      ['0x68656c6c6f', account.address],
      context(['accounts']),
    );
    await expect(request).rejects.toMatchObject({ code: 4100 });
  });

  it('signs EIP-712 data only for the authenticated wallet and registered contract', async () => {
    const verifyingContract = account.address;
    const typedData = {
      domain: {
        name: 'InjGift',
        version: '1',
        chainId: 1439,
        verifyingContract,
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
    };
    const typedManifest = manifest(['sign']);
    typedManifest.allowedContracts = [verifyingContract];
    const signature = await handleMiniAppRpc(
      'eth_signTypedData_v4',
      [account.address, JSON.stringify(typedData)],
      { ...context(['sign']), manifest: typedManifest },
    ) as Hex;

    await expect(recoverTypedDataAddress({
      domain: typedData.domain,
      primaryType: 'ClaimPermit',
      types: { ClaimPermit: typedData.types.ClaimPermit },
      message: typedData.message,
      signature,
    })).resolves.toBe(account.address);
  });
});

describe('handleMiniAppRpc transaction authorization', () => {
  it('rejects a transaction whose from account is not the authenticated wallet', async () => {
    const request = handleMiniAppRpc(
      'eth_sendTransaction',
      [{ from: otherAddress, to: account.address, value: '0x0' }],
      context(['transactions']),
    );
    await expect(request).rejects.toMatchObject({ code: 4100 });
  });
});
