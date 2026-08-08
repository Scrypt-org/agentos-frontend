import type { LocalKeystore } from '@/types/wallet';
import type { LocalMnemonicVaultV1 } from '@/wallet/key-management/vault';

function normalizedAddress(address: string): string {
  return address.toLowerCase();
}

function reconstructedWallet(vault: LocalMnemonicVaultV1): LocalKeystore {
  return {
    address: vault.address,
    encryptedPrivateKey: '',
    source: 'import',
    keyScheme: 'local-mnemonic-v1',
    encryptedMnemonicVault: JSON.stringify(vault),
    mnemonicBackupConfirmed: false,
    createdAt: vault.createdAt,
    walletName: 'Recovered AgentOS',
  };
}

export function mergeWalletSources(
  indexedWallets: LocalKeystore[],
  activeWallet: LocalKeystore | null,
  mnemonicVaults: LocalMnemonicVaultV1[],
): LocalKeystore[] {
  const merged: LocalKeystore[] = [];
  const addresses = new Set<string>();

  const addWallet = (wallet: LocalKeystore | null) => {
    if (!wallet) return;
    const address = normalizedAddress(wallet.address);
    if (addresses.has(address)) return;
    addresses.add(address);
    merged.push(wallet);
  };

  indexedWallets.forEach(addWallet);
  addWallet(activeWallet);
  mnemonicVaults.forEach((vault) => addWallet(reconstructedWallet(vault)));

  return merged;
}
