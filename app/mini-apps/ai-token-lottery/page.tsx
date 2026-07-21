'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LOTTERY_COPY } from '@/config/ai-token-lottery-copy';
import {
  drawLotteryReward,
  getLotteryStatus,
  type LotteryStatus,
} from '@/services/ai-token-lottery';
import {
  expireLotteryStatus,
  lotteryStateCanDraw,
  normalizeLotteryLanguage,
  type LotteryLanguage,
} from '@/services/ai-token-lottery-helpers';
import { InjPassMiniAppConnector } from '../../../packages/injpass-connector/src/miniapp';
import styles from './lottery.module.css';

type Phase = 'loading' | 'idle' | 'pulling' | 'drawing' | 'revealed' | 'error';

const CONFETTI = Array.from({ length: 30 }, (_, index) => ({
  left: (index * 37) % 100,
  delay: ((index * 13) % 12) / 20,
  color: ['#ffe36e', '#ff826f', '#71ddff', '#fff8e9', '#d6a4ff'][index % 5],
}));

function formatCountdown(
  target: string | null,
  now: number,
  units: { day: string; hour: string; minute: string },
) {
  if (!target) return '—';
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${days}${units.day} ${hours}${units.hour} ${minutes}${units.minute}`;
}

export default function AiTokenLotteryPage() {
  const [status, setStatus] = useState<LotteryStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [language, setLanguage] = useState<LotteryLanguage>('en');
  const [pull, setPull] = useState(0);
  const [now, setNow] = useState(Date.now());
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const connectorRef = useRef<InjPassMiniAppConnector | null>(null);
  const copy = LOTTERY_COPY[language];
  const visibleStatus = status ? expireLotteryStatus(status, now) : null;
  const canDraw = Boolean(visibleStatus && lotteryStateCanDraw(visibleStatus.state) && phase !== 'drawing');
  const won = Boolean(visibleStatus?.claimedAt && (phase === 'revealed' || visibleStatus.state !== 'eligible'));

  const refresh = async () => {
    setPhase('loading');
    try {
      const next = await getLotteryStatus();
      setStatus(next);
      setPhase(next.state === 'eligible' ? 'idle' : 'revealed');
    } catch {
      setPhase('error');
    }
  };

  useEffect(() => {
    let connector: InjPassMiniAppConnector | null = null;
    const stored = window.localStorage.getItem('injpass_language');
    setLanguage(normalizeLotteryLanguage(stored || window.navigator.language));
    if (InjPassMiniAppConnector.isEmbedded()) {
      connector = new InjPassMiniAppConnector();
      connectorRef.current = connector;
      connector.onSession((session) => setLanguage(normalizeLotteryLanguage(session.language)));
    }
    void refresh();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      connector?.destroy();
      connectorRef.current = null;
      window.clearInterval(timer);
    };
  }, []);

  const countdown = useMemo(
    () => formatCountdown(
      visibleStatus?.expiresAt || visibleStatus?.eligibleUntil || null,
      now,
      copy.countdownUnits,
    ),
    [copy.countdownUnits, now, visibleStatus?.eligibleUntil, visibleStatus?.expiresAt],
  );

  const reveal = async () => {
    if (!canDraw) return;
    setPhase('drawing');
    try {
      const result = await drawLotteryReward();
      setStatus(result);
      setPull(1);
      window.setTimeout(() => setPhase('revealed'), 700);
      navigator.vibrate?.([20, 40, 30]);
    } catch {
      setPull(0);
      setPhase('error');
    }
  };

  const startAiChat = () => {
    if (connectorRef.current) {
      connectorRef.current.openHostChat();
      return;
    }
    window.location.assign('/');
  };

  return (
    <main className={styles.app} style={{ '--pull': pull } as React.CSSProperties}>
      <div className={styles.grain} />
      {won && <div className={styles.confetti}>{CONFETTI.map((piece, index) => (
        <i key={index} style={{ left: `${piece.left}%`, animationDelay: `${piece.delay}s`, background: piece.color }} />
      ))}</div>}

      <header className={styles.header}>
        <span className={styles.live}>{copy.live}</span>
      </header>

      <section className={styles.hero}>
        <h1>{won ? copy.reward : copy.title}</h1>
        <p>{visibleStatus ? copy.states[visibleStatus.state] : copy.subtitle}</p>

        <div className={styles.machine}>
          <div className={styles.slot} />
          <article className={`${styles.voucher} ${won ? styles.visible : ''}`}>
            <div className={styles.security}>INJ PASS • VERIFIED • AI TOKEN •</div>
            <div className={styles.voucherHeader}>
              <strong>INJ Pass</strong>
              <span>{visibleStatus?.tier ? copy.tiers[visibleStatus.tier] : 'AI TOKEN'}</span>
            </div>
            <div className={styles.amount}>
              <small>AI TOKEN</small>
              <b>{(visibleStatus?.displayAiTokens || 0).toLocaleString()}</b>
            </div>
            <div className={styles.details}>
              <span>{copy.lamEquivalent}</span>
              <strong>{Number(visibleStatus?.rewardLam || 0).toFixed(2)} LAM</strong>
              <span>{copy.remaining}</span>
              <strong>{Number(visibleStatus?.remainingLam || 0).toFixed(2)} LAM</strong>
            </div>
            <p>{copy.interactions}</p>
          </article>

          <button
            type="button"
            className={styles.handle}
            disabled={!canDraw}
            aria-label={copy.pull}
            onPointerDown={(event) => {
              if (!canDraw) return;
              pointerId.current = event.pointerId;
              startY.current = event.clientY;
              event.currentTarget.setPointerCapture(event.pointerId);
              setPhase('pulling');
            }}
            onPointerMove={(event) => {
              if (pointerId.current !== event.pointerId) return;
              setPull(Math.min(1, Math.max(0, (event.clientY - startY.current) / 220)));
            }}
            onPointerUp={(event) => {
              if (pointerId.current !== event.pointerId) return;
              pointerId.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
              if (pull >= 0.7) void reveal();
              else {
                setPull(0);
                setPhase('idle');
              }
            }}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && canDraw) {
                event.preventDefault();
                void reveal();
              }
            }}
          >
            <span />
            <b>{phase === 'pulling' ? (pull >= 0.7 ? copy.release : copy.pulling) : copy.pull}</b>
          </button>
        </div>

        <div className={styles.status}>
          <span>{visibleStatus?.claimedAt ? copy.expires : copy.eligibility}</span>
          <strong>{countdown}</strong>
        </div>

        {phase === 'error' && <button className={styles.secondary} onClick={() => void refresh()}>{copy.retry}</button>}
        {won && <button className={styles.primary} onClick={startAiChat}>{copy.chat}</button>}

        <div className={styles.stateKeys} aria-hidden="true">
          {'eligible'} {'claimed'} {'expired'} {'eligibility_expired'}
        </div>
      </section>
    </main>
  );
}
