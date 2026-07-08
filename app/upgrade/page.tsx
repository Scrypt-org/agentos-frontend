'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { createPrfWallet, PrfUnsupportedError } from '@/wallet/key-management';
import { saveWallet } from '@/wallet/keystore';
import type { LocalKeystore } from '@/types/wallet';

/**
 * Voluntary upgrade from a legacy (sha256(credentialId)) wallet to a PRF-secured
 * wallet. Intentionally conservative: it creates the new wallet WITHOUT touching
 * the old keystore, asks the user to move funds manually via the normal Send
 * flow, and only switches the active wallet on an explicit final confirmation —
 * so funds can never be stranded by an automatic, untested sweep.
 */
export default function UpgradePage() {
  const router = useRouter();
  const { isUnlocked, address, keystore, unlock } = useWallet();

  const [newWallet, setNewWallet] = useState<{
    address: string;
    privateKey: Uint8Array;
    credentialId: string;
    walletName?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isLegacy =
    !!keystore && keystore.source === 'passkey' && keystore.keyScheme !== 'prf-v1';

  const handleCreateNew = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await createPrfWallet(keystore?.walletName, undefined, {
        persist: false, // keep the old keystore active until funds are moved
      });
      setNewWallet(result);
    } catch (err) {
      if (err instanceof PrfUnsupportedError) {
        setError('此设备/浏览器不支持 PRF，无法升级。请在支持的设备上操作。');
      } else {
        setError(err instanceof Error ? err.message : '创建安全钱包失败');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSwitch = () => {
    if (!newWallet) return;
    const newKeystore: LocalKeystore = {
      address: newWallet.address,
      encryptedPrivateKey: '',
      source: 'passkey',
      keyScheme: 'prf-v1',
      credentialId: newWallet.credentialId,
      createdAt: Date.now(),
      walletName: newWallet.walletName,
    };
    saveWallet(newKeystore);
    unlock(newWallet.privateKey, newKeystore);
    router.push('/dashboard');
  };

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-xl p-6 text-white">
        <p>请先解锁钱包再进行升级。</p>
        <Link href="/unlock" className="text-amber-300 underline">
          去解锁
        </Link>
      </div>
    );
  }

  if (!isLegacy) {
    return (
      <div className="mx-auto max-w-xl p-6 text-white">
        <p>当前钱包已是安全（PRF）钱包，无需升级。</p>
        <Link href="/dashboard" className="text-amber-300 underline">
          返回
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6 text-white">
      <h1 className="text-xl font-bold">升级到安全钱包</h1>
      <p className="text-sm text-white/70">
        旧钱包的私钥由公开的 credentialId 推导，存在被还原的风险。升级会创建一把由
        passkey PRF 派生的新钱包（新地址），你需要把资产从旧地址转到新地址后再切换。
      </p>

      <div className="rounded-xl border border-white/10 p-4 text-sm">
        <div className="text-white/50">当前（旧）地址</div>
        <div className="break-all font-mono">{address}</div>
      </div>

      {!newWallet ? (
        <button
          type="button"
          onClick={handleCreateNew}
          disabled={busy}
          className="rounded-xl bg-amber-400 px-4 py-2 font-semibold text-black disabled:opacity-60"
        >
          {busy ? '创建中…' : '① 创建安全新钱包'}
        </button>
      ) : (
        <>
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            <div className="text-white/50">新（安全）地址</div>
            <div className="break-all font-mono">{newWallet.address}</div>
          </div>
          <p className="text-sm text-white/70">
            ② 请用「发送」功能把资产从旧地址转到上面的新地址。
            <Link
              href={`/send?address=${newWallet.address}`}
              className="ml-1 text-amber-300 underline"
            >
              去转账
            </Link>
          </p>
          <p className="text-xs text-amber-300">
            ⚠️ 务必先把资产转移完成再切换。切换后旧钱包将不再是当前活动钱包。
          </p>
          <button
            type="button"
            onClick={handleSwitch}
            className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-black"
          >
            ③ 我已转移完成，切换到新钱包
          </button>
        </>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
