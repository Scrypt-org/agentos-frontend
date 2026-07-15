import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress, type Address, type Hex } from 'viem';

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
