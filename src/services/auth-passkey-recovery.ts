import type { LocalKeystore } from '@/types/wallet';
import type { RecoverWalletResult } from '@/wallet/key-management';

interface AuthPasskeyRecoveryDependencies {
  recover: () => Promise<RecoverWalletResult>;
  loadWallets: () => LocalKeystore[];
}

export async function recoverPasskeyForAuthorization({
  recover,
  loadWallets,
}: AuthPasskeyRecoveryDependencies): Promise<LocalKeystore> {
  const recovered = await recover();
  try {
    const wallet = loadWallets().find(
      (candidate) => candidate.address.toLowerCase() === recovered.address.toLowerCase(),
    );
    if (!wallet) {
      throw new Error('The Passkey was verified but its wallet metadata was not saved.');
    }
    return wallet;
  } finally {
    recovered.privateKey.fill(0);
  }
}
