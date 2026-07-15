import type { LocalKeystore } from '@/types/wallet';
import type { RecoverWalletResult } from '@/wallet/key-management';

interface EnterExistingPasskeyDependencies {
  recover: () => Promise<RecoverWalletResult>;
  loadRecoveredWallet: () => LocalKeystore | null;
  unlock: (privateKey: Uint8Array, wallet: LocalKeystore) => void;
}

export async function enterExistingPasskey({
  recover,
  loadRecoveredWallet,
  unlock,
}: EnterExistingPasskeyDependencies): Promise<RecoverWalletResult> {
  const recovered = await recover();
  const wallet = loadRecoveredWallet();
  if (!wallet) {
    throw new Error('The Passkey was verified but the wallet could not be recovered.');
  }

  unlock(recovered.privateKey, {
    ...wallet,
    credentialId: recovered.credentialId,
    keyScheme: recovered.keyScheme,
  });

  return recovered;
}
