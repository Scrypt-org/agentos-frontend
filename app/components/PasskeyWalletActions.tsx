'use client';

interface PasskeyWalletActionsProps {
  isLight: boolean;
  pendingAction: 'create' | 'enter' | null;
  onCreate: () => void;
  onEnterExisting: () => void;
}

export default function PasskeyWalletActions({
  isLight,
  pendingAction,
  onCreate,
  onEnterExisting,
}: PasskeyWalletActionsProps) {
  const mutedText = isLight ? 'text-black/46' : 'text-white/46';
  const secondaryHover = isLight ? 'hover:bg-black/5' : 'hover:bg-white/8';

  return (
    <div className="px-1 pb-1">
      <button
        type="button"
        onClick={onCreate}
        disabled={pendingAction !== null}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition duration-300 disabled:opacity-55 ${
          isLight
            ? 'border-white bg-black/[0.025] shadow-[0_0_0_1px_rgba(0,0,0,0.07)] hover:bg-black/5'
            : 'border-white/35 bg-white/[0.035] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] hover:border-white/55 hover:bg-white/8'
        }`}
      >
        <span>
          <span className="block text-sm font-bold">Create New Wallet</span>
          <span className={`mt-0.5 block text-xs ${mutedText}`}>
            Secure PRF wallet with this device&apos;s system Passkey
          </span>
        </span>
        <span className="text-xs font-semibold">Create</span>
      </button>

      <button
        type="button"
        onClick={onEnterExisting}
        disabled={pendingAction !== null}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition disabled:opacity-55 ${secondaryHover}`}
      >
        <span>
          <span className="block text-sm font-bold">Use another Passkey</span>
          <span className={`mt-0.5 block text-xs ${mutedText}`}>
            Open an existing new or legacy Passkey wallet
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold">
          {pendingAction === 'enter' ? 'Opening...' : 'Enter'}
        </span>
      </button>
    </div>
  );
}
