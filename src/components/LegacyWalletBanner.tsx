'use client';

import Link from 'next/link';
import { useWallet } from '@/contexts/WalletContext';

/**
 * Non-blocking warning shown when the active wallet still uses the legacy,
 * insecure key scheme (`privateKey = sha256(credentialId)`). Links to the
 * voluntary upgrade flow that creates a PRF-secured wallet.
 */
export function LegacyWalletBanner() {
  const { keystore, isUnlocked } = useWallet();

  const isLegacy =
    !!keystore &&
    isUnlocked &&
    keystore.source === 'passkey' &&
    keystore.keyScheme !== 'prf-v1';

  if (!isLegacy) return null;

  return (
    <div className="mx-auto mb-4 flex max-w-6xl flex-col gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <span>
        ⚠️ 当前钱包使用旧的密钥方案，存在安全风险。建议升级到基于 passkey PRF 的安全钱包。
      </span>
      <Link
        href="/upgrade"
        className="shrink-0 rounded-xl bg-amber-400/90 px-3 py-1.5 font-semibold text-black hover:bg-amber-300"
      >
        升级到安全钱包
      </Link>
    </div>
  );
}
