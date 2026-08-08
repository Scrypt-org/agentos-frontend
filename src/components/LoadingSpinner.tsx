'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useTheme } from '@/contexts/ThemeContext';

function getDestinationLabel(pathname: string | null) {
  if (!pathname || pathname === '/') return 'AgentOS';

  const routeLabels: Record<string, string> = {
    '/dashboard': 'Wallet',
    '/discover': 'Discover',
    '/settings': 'Settings',
    '/agents': 'Agents',
    '/history': 'History',
    '/send': 'Send',
    '/receive': 'Receive',
    '/swap': 'Swap',
    '/cards': 'Cards',
    '/welcome': 'AgentOS',
    '/unlock': 'AgentOS',
  };

  if (routeLabels[pathname]) {
    return routeLabels[pathname];
  }

  const fallback = pathname.split('/').filter(Boolean).pop();
  if (!fallback) return 'AgentOS';

  return fallback
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getDefaultStatus(pathname: string | null) {
  if (!pathname || pathname === '/') return 'Checking local session';

  const statusMap: Record<string, string> = {
    '/dashboard': 'Loading wallet surface',
    '/discover': 'Loading discovery workspace',
    '/settings': 'Loading wallet settings',
    '/agents': 'Loading agent workspace',
    '/history': 'Loading recent activity',
    '/send': 'Loading send surface',
    '/receive': 'Loading receive surface',
    '/swap': 'Loading swap surface',
    '/cards': 'Loading card center',
    '/welcome': 'Preparing AgentOS',
    '/unlock': 'Loading wallet relay',
  };

  return statusMap[pathname] ?? `Loading ${getDestinationLabel(pathname)}`;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

interface LoadingSpinnerProps {
  ready?: boolean;
  children?: ReactNode;
  progress?: number;
  statusLabel?: string;
}

export default function LoadingSpinner({ ready = false, children, progress, statusLabel }: LoadingSpinnerProps) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const destinationLabel = useMemo(() => getDestinationLabel(pathname), [pathname]);
  const resolvedStatusLabel = useMemo(() => statusLabel ?? getDefaultStatus(pathname), [pathname, statusLabel]);
  const isWrapped = children !== undefined;
  const targetProgress = clampProgress(progress ?? (ready ? 100 : isWrapped ? 84 : 68));
  const isLight = theme === 'light';

  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDisplayProgress((current) => {
        if (Math.abs(current - targetProgress) < 0.2) {
          return targetProgress;
        }

        if (current < targetProgress) {
          const delta = targetProgress - current;
          const step = targetProgress >= 100 ? Math.max(delta * 0.22, 1.6) : Math.max(delta * 0.1, 0.32);
          return Math.min(targetProgress, current + step);
        }

        return targetProgress;
      });
    }, 16);

    return () => {
      window.clearInterval(interval);
    };
  }, [targetProgress]);

  useEffect(() => {
    if (!isWrapped || !ready || displayProgress < 99.8) {
      return;
    }

    const startExit = window.setTimeout(() => {
      setIsLeaving(true);
    }, 120);

    const endExit = window.setTimeout(() => {
      setOverlayVisible(false);
    }, 420);

    return () => {
      window.clearTimeout(startExit);
      window.clearTimeout(endExit);
    };
  }, [displayProgress, isWrapped, ready]);

  return (
    <div className={`relative min-h-screen overflow-hidden ${isLight ? 'bg-[#eef4fb]' : 'bg-black'}`}>
      {children ? <>{children}</> : null}

      {overlayVisible && (
        <div
          className={`fixed inset-0 z-[140] flex items-center justify-center transition-opacity duration-300 ${
            isLight ? 'bg-[#eef4fb]' : 'bg-[#020202]'
          } ${
            isLeaving ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div
            className={`absolute inset-0 ${
              isLight
                ? 'bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.88),transparent_24%),radial-gradient(circle_at_80%_12%,rgba(251,191,36,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_52%,#e8eef8_100%)]'
                : 'bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.08),transparent_24%),linear-gradient(180deg,#050505_0%,#020202_48%,#000000_100%)]'
            }`}
          />
          <div
            className={`absolute inset-0 ${
              isLight
                ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.38),transparent_18%,transparent_82%,rgba(148,163,184,0.06))]'
                : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%,transparent_82%,rgba(255,255,255,0.015))]'
            }`}
          />

          <div
            className={`relative w-full max-w-[360px] px-6 text-center transition-all duration-500 ${
              isLeaving ? 'translate-y-2 scale-[0.992] opacity-0 blur-[2px]' : 'translate-y-0 scale-100 opacity-100'
            }`}
          >
            <div
              className={`mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-[1.15rem] border ${
                isLight
                  ? 'border-slate-200/80 bg-white/88 shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_18px_44px_rgba(148,163,184,0.22)]'
                  : 'border-white/10 bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_18px_44px_rgba(0,0,0,0.42)]'
              }`}
            >
              <Image src="/lambdalogo.png" alt="AgentOS" width={30} height={30} className="h-[30px] w-[30px] object-contain opacity-95" />
            </div>

            <div className={`text-[10px] font-semibold uppercase tracking-[0.34em] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
              {destinationLabel}
            </div>

            <div
              className={`mt-5 overflow-hidden rounded-full border p-[3px] ${
                isLight
                  ? 'border-slate-200/80 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]'
                  : 'border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
              }`}
            >
              <div className={`h-[6px] rounded-full ${isLight ? 'bg-slate-200/90' : 'bg-black/70'}`}>
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ease-out ${
                    isLight
                      ? 'bg-[linear-gradient(180deg,#0f172a_0%,#334155_100%)] shadow-[0_0_16px_rgba(59,130,246,0.12)]'
                      : 'bg-[linear-gradient(180deg,#f4f4f5_0%,#d4d4d8_100%)]'
                  }`}
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
            </div>

            <div className={`mt-3 flex items-center justify-between text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
              <span>{resolvedStatusLabel}</span>
              <span className={`font-mono ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{Math.round(displayProgress)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
