'use client';

import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { sha256 } from '@noble/hashes/sha2.js';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import {
  createPrfWallet,
  createByPassword,
  unlockWalletKey,
  PrfUnsupportedError,
} from '@/wallet/key-management';
import {
  hasWallet,
  loadWallet,
} from '@/wallet/keystore';
import type { LocalKeystore } from '@/types/wallet';
import TunnelBackground from '@/components/TunnelBackground';
import { validateInviteCode } from '@/services/referral';

type PendingAction = 'create' | 'enter' | null;
type MockPhase = 'idle' | 'analyzing' | 'preparing' | 'awaiting' | 'complete';

interface MockExecutionState {
  prompt: string;
  intent: string;
  phase: MockPhase;
  hash: string;
}

interface ConversationMessage {
  role: 'assistant' | 'user';
  title?: string;
  body: string;
  tone: 'default' | 'active' | 'warning' | 'success';
}

interface ErrorToastState {
  id: number;
  message: string;
  isExiting: boolean;
}

const ERROR_TOAST_DURATION_MS = 4200;
const ERROR_TOAST_EXIT_MS = 320;
const AGENT_OS_PREFIX = 'Agent';
const AGENT_OS_SUFFIX = 'OS';
const REDEFINES_PREFIX = 'that ';
const REDEFINES_TARGET = 'redefines';
const HEADLINE_LINES = [
  'AgentOS',
  'that redefines',
  'Web3 through AI.',
] as const;
const HEADLINE_TEXT = HEADLINE_LINES.join(' ');
const HEADLINE_TYPING_STEPS = Math.max(
  ...HEADLINE_LINES.map((line) => line.length)
);
const AI_STREAM_STEP = 2;
const AI_STREAM_INTERVAL = 16;
const AGENT_MESSAGE_GAP_MS = 280;
const CONTACT_MENU_HIDE_DELAY_MS = 500;
const WIKI_MENU_HIDE_DELAY_MS = 500;
const AGENT_SCENARIOS = [
  'Swap 250 USDT to INJ',
  'Send 12 INJ to 0x4f2a71c98de4a3bc11f6d851be5f4b1f84e98aa1',
  'Stake 40 INJ with the validator showing the strongest uptime',
  'Claim staking rewards and restake them into INJ',
  'Rebalance idle USDT into INJ if slippage stays below 0.5%',
] as const;
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

function WelcomeSkeleton({ isLightMode }: { isLightMode: boolean }) {
  return (
    <div
      className={`relative isolate min-h-screen overflow-hidden ${
        isLightMode ? 'bg-[#eef2f7] text-[#12151b]' : 'bg-[#020202] text-white'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isLightMode
            ? 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(237,241,247,0.62) 100%)'
            : 'linear-gradient(180deg, rgba(2,2,2,0.12) 0%, rgba(2,2,2,0.28) 100%)',
        }}
      />
      <div
        className={`pointer-events-none absolute inset-0 ${
          isLightMode ? 'opacity-26' : 'opacity-34'
        }`}
        style={{
          background: isLightMode
            ? 'radial-gradient(circle at 16% 18%, rgba(126,67,255,0.1), transparent 30%), radial-gradient(circle at 82% 22%, rgba(255,99,158,0.08), transparent 26%), radial-gradient(circle at 52% 100%, rgba(117,54,224,0.06), transparent 28%)'
            : 'radial-gradient(circle at 18% 18%, rgba(126,67,255,0.12), transparent 30%), radial-gradient(circle at 82% 22%, rgba(255,99,158,0.1), transparent 26%), radial-gradient(circle at 50% 100%, rgba(117,54,224,0.08), transparent 28%)',
        }}
      />

      <div
        className={`absolute inset-x-0 top-0 z-30 border-b backdrop-blur-xl ${
          isLightMode
            ? 'border-[#1a2030]/8 bg-[linear-gradient(90deg,rgba(255,255,255,0.78),rgba(246,241,252,0.72),rgba(244,236,243,0.76))]'
            : 'border-white/10 bg-[linear-gradient(90deg,rgba(74,18,111,0.62),rgba(83,17,88,0.44),rgba(116,24,76,0.56))]'
        }`}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4 sm:px-8 lg:px-12">
          <div className="order-1 min-w-0 justify-self-start">
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
              <div
                className={`h-5 w-16 rounded-full animate-pulse ${
                  isLightMode ? 'bg-[#20283a]/10' : 'bg-white/10'
                }`}
              />
              <div
                className={`h-4 w-40 rounded-full animate-pulse ${
                  isLightMode ? 'bg-[#20283a]/8' : 'bg-white/8'
                }`}
              />
            </div>
          </div>

          <div className="order-3 col-span-2 flex justify-center sm:order-2 sm:col-span-1">
            <div
              className={`h-4 w-[18.5rem] rounded-full animate-pulse sm:w-[25rem] ${
                isLightMode ? 'bg-[#20283a]/8' : 'bg-white/8'
              }`}
            />
          </div>

          <div className="order-2 flex items-center justify-end gap-2 justify-self-end sm:order-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className={`h-8 w-8 rounded-full border animate-pulse ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-white/72'
                    : 'border-white/10 bg-white/[0.05]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-start px-4 pb-24 pt-40 sm:px-8 sm:pb-16 sm:pt-40 lg:px-12 lg:items-center">
        <div className="grid w-full gap-10 sm:gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,0.88fr)] lg:items-center">
          <section className="max-w-none lg:max-w-2xl">
            <div className="space-y-5">
              <div
                className={`h-8 w-24 rounded-full animate-pulse sm:h-9 sm:w-28 ${
                  isLightMode ? 'bg-[#20283a]/10' : 'bg-white/10'
                }`}
              />
              <div className="space-y-3">
                <div
                  className={`h-11 w-[88%] rounded-[1.1rem] animate-pulse sm:h-14 ${
                    isLightMode ? 'bg-[#20283a]/10' : 'bg-white/10'
                  }`}
                />
                <div
                  className={`h-11 w-[72%] rounded-[1.1rem] animate-pulse sm:h-14 ${
                    isLightMode ? 'bg-[#20283a]/8' : 'bg-white/8'
                  }`}
                />
                <div
                  className={`h-11 w-[61%] rounded-[1.1rem] animate-pulse sm:h-14 ${
                    isLightMode ? 'bg-[#20283a]/7' : 'bg-white/7'
                  }`}
                />
              </div>
              <div className="space-y-3 pt-2">
                <div
                  className={`h-4 w-[84%] rounded-full animate-pulse ${
                    isLightMode ? 'bg-[#20283a]/8' : 'bg-white/8'
                  }`}
                />
                <div
                  className={`h-4 w-[76%] rounded-full animate-pulse ${
                    isLightMode ? 'bg-[#20283a]/7' : 'bg-white/7'
                  }`}
                />
              </div>
              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <div className="h-14 w-full rounded-[1.35rem] bg-[linear-gradient(135deg,rgba(127,44,255,0.72)_0%,rgba(213,31,147,0.68)_58%,rgba(255,111,136,0.72)_100%)] animate-pulse sm:max-w-[220px]" />
                <div
                  className={`h-14 w-full rounded-[1.35rem] border animate-pulse sm:max-w-[220px] ${
                    isLightMode
                      ? 'border-[#151a27]/10 bg-white/78'
                      : 'border-white/[0.12] bg-white/[0.05]'
                  }`}
                />
              </div>
            </div>
          </section>

          <section className="w-full">
            <div
              className={`flex min-h-[520px] flex-col rounded-[2rem] border px-4 py-4 shadow-[0_30px_120px_rgba(15,10,26,0.14)] backdrop-blur-xl sm:min-h-[560px] sm:px-5 sm:py-5 ${
                isLightMode
                  ? 'border-[#151a27]/10 bg-white/60'
                  : 'border-white/[0.1] bg-white/[0.04]'
              }`}
            >
              <div className="space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className={`rounded-[1.35rem] border px-4 py-4 ${
                      isLightMode
                        ? 'border-[#151a27]/8 bg-white/46'
                        : 'border-white/[0.08] bg-white/[0.03]'
                    }`}
                  >
                    <div
                      className={`mb-3 h-3.5 w-16 rounded-full animate-pulse ${
                        isLightMode ? 'bg-[#20283a]/10' : 'bg-white/10'
                      }`}
                    />
                    <div className="space-y-2">
                      <div
                        className={`h-3.5 w-[72%] rounded-full animate-pulse ${
                          isLightMode ? 'bg-[#20283a]/8' : 'bg-white/8'
                        }`}
                      />
                      <div
                        className={`h-3.5 w-[58%] rounded-full animate-pulse ${
                          isLightMode ? 'bg-[#20283a]/7' : 'bg-white/7'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-4">
                <div
                  className={`overflow-hidden rounded-[1.5rem] border px-4 py-4 ${
                    isLightMode
                      ? 'border-[#151a27]/10 bg-white/68'
                      : 'border-white/[0.12] bg-white/[0.05]'
                  }`}
                >
                  <div
                    className={`h-[3px] w-full rounded-full animate-pulse ${
                      isLightMode ? 'bg-[#20283a]/10' : 'bg-white/10'
                    }`}
                  />
                  <div className="mt-4 flex items-center gap-3">
                    <div
                      className={`h-11 flex-1 rounded-[1rem] animate-pulse ${
                        isLightMode ? 'bg-[#20283a]/8' : 'bg-white/8'
                      }`}
                    />
                    <div className="h-11 w-32 rounded-[1rem] bg-[linear-gradient(135deg,rgba(127,44,255,0.72)_0%,rgba(213,31,147,0.68)_58%,rgba(255,111,136,0.72)_100%)] animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function WelcomePageContent() {
  const router = useRouter();
  const { unlock } = useWallet();
  const { theme, setTheme } = useTheme();

  const pageRef = useRef<HTMLDivElement>(null);
  const createNameInputRef = useRef<HTMLInputElement>(null);
  const conversationViewportRef = useRef<HTMLDivElement>(null);
  const spotlightTargetRef = useRef({ x: 0, y: 0 });
  const spotlightCurrentRef = useRef({ x: 0, y: 0 });
  const scenarioIndexRef = useRef(0);
  const startScenarioLoopRef = useRef<(index: number) => void>(() => {});
  const agentTimeoutsRef = useRef<number[]>([]);
  const hasStartedAgentAutoplayRef = useRef(false);
  const themeTransitionTimeoutRef = useRef<number | null>(null);
  const headerEntranceTimeoutRef = useRef<number | null>(null);
  const wikiMenuTimeoutRef = useRef<number | null>(null);
  const contactMenuTimeoutRef = useRef<number | null>(null);
  const errorToastTimeoutRef = useRef<number | null>(null);
  const errorToastExitTimeoutRef = useRef<number | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [walletNameInput, setWalletNameInput] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isInviteCodeVisible, setIsInviteCodeVisible] = useState(false);
  const [createDialogError, setCreateDialogError] = useState<string | null>(null);
  // Password fallback (only when the device/browser lacks WebAuthn PRF).
  const [needsPasswordFallback, setNeedsPasswordFallback] = useState(false);
  const [passwordFallback, setPasswordFallback] = useState('');
  const [walletExists, setWalletExists] = useState(false);
  const [isThemeTransitioning, setIsThemeTransitioning] = useState(false);
  const [hasHeaderEntered, setHasHeaderEntered] = useState(false);
  const [isWikiMenuOpen, setIsWikiMenuOpen] = useState(false);
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const [agentInput, setAgentInput] = useState<string>(AGENT_SCENARIOS[0]);
  const [agentExecution, setAgentExecution] = useState<MockExecutionState>({
    prompt: '',
    intent: 'Ready',
    phase: 'idle',
    hash: '',
  });
  const [headlineStep, setHeadlineStep] = useState(0);
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [errorToast, setErrorToast] = useState<ErrorToastState | null>(null);

  useEffect(() => {
    setWalletExists(hasWallet());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const inviteCodeFromUrl = new URLSearchParams(window.location.search).get('invite');
    if (!inviteCodeFromUrl) return;

    const normalized = inviteCodeFromUrl.trim().toUpperCase();
    if (!normalized) return;

    setInviteCodeInput(normalized);
    setIsInviteCodeVisible(true);
  }, []);

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    createNameInputRef.current?.focus();
  }, [isCreateDialogOpen]);

  useEffect(() => {
    return () => {
      if (themeTransitionTimeoutRef.current) {
        window.clearTimeout(themeTransitionTimeoutRef.current);
      }

      if (headerEntranceTimeoutRef.current) {
        window.clearTimeout(headerEntranceTimeoutRef.current);
      }

      if (wikiMenuTimeoutRef.current) {
        window.clearTimeout(wikiMenuTimeoutRef.current);
      }

      if (contactMenuTimeoutRef.current) {
        window.clearTimeout(contactMenuTimeoutRef.current);
      }

      clearErrorToastTimers();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      setHasHeaderEntered(true);
      return;
    }

    setHasHeaderEntered(false);
    headerEntranceTimeoutRef.current = window.setTimeout(() => {
      setHasHeaderEntered(true);
      headerEntranceTimeoutRef.current = null;
    }, 140);

    return () => {
      if (headerEntranceTimeoutRef.current) {
        window.clearTimeout(headerEntranceTimeoutRef.current);
        headerEntranceTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) {
      return;
    }

    const setDefaultSpotlight = () => {
      const { width, height } = page.getBoundingClientRect();
      const nextX = width * 0.74;
      const nextY = height * 0.34;
      spotlightTargetRef.current = { x: nextX, y: nextY };
      spotlightCurrentRef.current = { x: nextX, y: nextY };
      page.style.setProperty('--spotlight-x', `${nextX}px`);
      page.style.setProperty('--spotlight-y', `${nextY}px`);
    };

    setDefaultSpotlight();

    let frameId = 0;

    const tick = () => {
      const current = spotlightCurrentRef.current;
      const target = spotlightTargetRef.current;

      current.x += (target.x - current.x) * 0.09;
      current.y += (target.y - current.y) * 0.09;

      page.style.setProperty('--spotlight-x', `${current.x}px`);
      page.style.setProperty('--spotlight-y', `${current.y}px`);

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    window.addEventListener('resize', setDefaultSpotlight);

    return () => {
      window.removeEventListener('resize', setDefaultSpotlight);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearAgentSimulation();
    };
  }, []);

  useEffect(() => {
    const viewport = conversationViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth',
    });
  }, [conversationMessages]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      if (prefersReducedMotion) {
        setHeadlineStep(HEADLINE_TYPING_STEPS);
        return;
      }
    }

    setHeadlineStep(0);

    let currentIndex = 0;
    const intervalId = window.setInterval(() => {
      currentIndex += 1;
      setHeadlineStep(currentIndex);

      if (currentIndex >= HEADLINE_TYPING_STEPS) {
        window.clearInterval(intervalId);
      }
    }, 30);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (headlineStep < HEADLINE_TYPING_STEPS) {
      return;
    }

    if (hasStartedAgentAutoplayRef.current) {
      return;
    }

    hasStartedAgentAutoplayRef.current = true;
    startScenarioLoopRef.current(0);
  }, [headlineStep]);

  // Unlock with a private key the create/recover ceremony already derived.
  // We deliberately do NOT run a second passkey ceremony here: createByPasskey /
  // recoverFullWallet already authenticated and derived the key in-memory, so a
  // second challenge+WebAuthn+verify round would only duplicate work (~doubling
  // login latency) without adding security.
  const unlockWithKey = (privateKey: Uint8Array, keystore: LocalKeystore) => {
    if (!keystore.credentialId) {
      throw new Error('Missing passkey credential for this wallet.');
    }
    unlock(privateKey, keystore);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const page = pageRef.current;
    if (!page) {
      return;
    }

    const bounds = page.getBoundingClientRect();
    spotlightTargetRef.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const handlePointerLeave = () => {
    const page = pageRef.current;
    if (!page) {
      return;
    }

    const { width, height } = page.getBoundingClientRect();
    spotlightTargetRef.current = {
      x: width * 0.74,
      y: height * 0.34,
    };
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    setIsThemeTransitioning(true);

    if (themeTransitionTimeoutRef.current) {
      window.clearTimeout(themeTransitionTimeoutRef.current);
    }

    themeTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsThemeTransitioning(false);
    }, 520);
  };

  const handleOpenCreateDialog = () => {
    dismissErrorToast(true);
    setCreateDialogError(null);
    setIsCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = () => {
    if (pendingAction === 'create') {
      return;
    }

    setCreateDialogError(null);
    setIsCreateDialogOpen(false);
  };

  const handleCreateWallet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction('create');
    dismissErrorToast(true);
    setCreateDialogError(null);

    try {
      const walletName = walletNameInput.trim();

      if (!walletName) {
        throw new Error('Please name your INJ Pass before continuing.');
      }

      if (walletName.length > 20) {
        throw new Error('INJ Pass name must be 20 characters or fewer.');
      }

      // Fallback mode: this device lacks WebAuthn PRF, so create a
      // password-encrypted wallet instead (the only credential is the password).
      if (needsPasswordFallback) {
        if (passwordFallback.length < 8) {
          throw new Error(
            '请设置至少 8 位密码。此设备不支持安全 passkey 钱包，密码是唯一凭据，务必牢记——无法找回。'
          );
        }
        const fallback = await createByPassword(walletName, passwordFallback);
        const created = loadWallet();
        if (!created) {
          throw new Error('Failed to load the created wallet.');
        }
        unlockWithKey(fallback.privateKey, created);
        setWalletExists(true);
        setIsCreateDialogOpen(false);
        router.push('/dashboard');
        return;
      }

      const normalizedInviteCode = inviteCodeInput.trim().toUpperCase();
      if (normalizedInviteCode.length > 0) {
        if (!INVITE_CODE_PATTERN.test(normalizedInviteCode)) {
          throw new Error('Invite code format is invalid.');
        }

        const validationResult = await validateInviteCode(normalizedInviteCode);
        if (!validationResult.valid) {
          throw new Error('Invite code is invalid.');
        }
      }

      // Secure path: derive the key from the WebAuthn PRF output.
      const result = await createPrfWallet(
        walletName,
        normalizedInviteCode.length > 0 ? normalizedInviteCode : undefined
      );
      const createdWallet = loadWallet();

      if (!createdWallet) {
        throw new Error('Failed to load the created wallet.');
      }

      unlockWithKey(result.privateKey, createdWallet);

      setWalletExists(true);
      setIsCreateDialogOpen(false);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof PrfUnsupportedError) {
        // Reveal the password fallback and ask the user to retry with a password.
        setNeedsPasswordFallback(true);
        setCreateDialogError(
          '此设备/浏览器不支持安全的 passkey 钱包（PRF）。可设置一个密码作为备用方式继续（密码无法找回，请牢记）。'
        );
      } else {
        setCreateDialogError(
          err instanceof Error ? err.message : 'Failed to create wallet.'
        );
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleEnterWallet = async () => {
    setPendingAction('enter');
    dismissErrorToast(true);

    try {
      // Same-device re-login: unlock by the wallet's own scheme (prf-v1 or
      // legacy). This also avoids the redundant recovery ceremony.
      const existing = loadWallet();
      if (existing?.credentialId) {
        const privateKey = await unlockWalletKey(existing);
        unlockWithKey(privateKey, existing);
        setWalletExists(true);
        router.push('/dashboard');
        return;
      }

      // No local keystore (fresh device): one passkey ceremony, scheme
      // auto-detected. PRF wallets re-derive the key directly from the
      // (synced) authenticator; legacy wallets fall back to the old scheme so
      // the user can open the original wallet and migrate.
      const { recoverWallet } = await import('@/wallet/key-management');
      const recovered = await recoverWallet();
      const recoveredWallet = loadWallet();

      if (!recoveredWallet) {
        throw new Error('Failed to load recovered wallet.');
      }

      unlockWithKey(recovered.privateKey, {
        ...recoveredWallet,
        credentialId: recovered.credentialId,
      });
      setWalletExists(true);
      if (recovered.keyScheme === 'legacy-sha256') {
        // Insecure legacy key recovered — push the user straight to migration.
        router.push('/upgrade');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      showErrorToast(
        err instanceof Error ? err.message : 'Failed to enter INJ Pass.'
      );
    } finally {
      setPendingAction(null);
    }
  };

  const startAgentSimulation = (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) {
      return;
    }

    clearAgentSimulation();
    setAgentInput(prompt);

    const intent = inferIntent(prompt);
    const hash = createMockHash(prompt);

    setAgentExecution({
      prompt,
      intent,
      phase: 'analyzing',
      hash: '',
    });

    const interpretBody = `Reading the instruction and mapping it to ${withArticle(intent.toLowerCase())} action on Injective.`;
    const buildBody =
      'Preparing a route for the requested action and assembling the transaction plan.';
    const approvalBody =
      'Simulating passkey approval before the onchain action is finalized.';
    const successBody = `Tx hash\n${hash}`;

    const getStreamDuration = (body: string) =>
      Math.max(
        560,
        Math.ceil(body.length / AI_STREAM_STEP) * AI_STREAM_INTERVAL + 260
      );

    const interpretDuration = getStreamDuration(interpretBody);
    const buildDuration = getStreamDuration(buildBody);
    const approvalDuration = getStreamDuration(approvalBody);
    const successDuration = getStreamDuration(successBody);

    appendConversationMessages([
      {
        role: 'user',
        body: prompt,
        tone: 'default',
      },
      {
        role: 'assistant',
        title: 'Interpret intent',
        body: interpretBody,
        tone: 'active',
      },
    ]);

    const buildAt = interpretDuration + AGENT_MESSAGE_GAP_MS;
    const approvalAt = buildAt + buildDuration + AGENT_MESSAGE_GAP_MS;
    const successAt = approvalAt + approvalDuration + AGENT_MESSAGE_GAP_MS;
    const loopAt = successAt + successDuration + 920;

    agentTimeoutsRef.current = [
      window.setTimeout(() => {
        setAgentExecution({
          prompt,
          intent,
          phase: 'preparing',
          hash: '',
        });
        appendConversationMessages([
          {
            role: 'assistant',
            title: 'Build transaction',
            body: buildBody,
            tone: 'active',
          },
        ]);
      }, buildAt),
      window.setTimeout(() => {
        setAgentExecution({
          prompt,
          intent,
          phase: 'awaiting',
          hash: '',
        });
        appendConversationMessages([
          {
            role: 'assistant',
            title: 'Request approval',
            body: approvalBody,
            tone: 'warning',
          },
        ]);
      }, approvalAt),
      window.setTimeout(() => {
        setAgentExecution({
          prompt,
          intent,
          phase: 'complete',
          hash,
        });
        appendConversationMessages([
          {
            role: 'assistant',
            title: 'Execution complete',
            body: successBody,
            tone: 'success',
          },
        ]);
      }, successAt),
      window.setTimeout(() => {
        startScenarioLoopRef.current(scenarioIndexRef.current);
      }, loopAt),
    ];
  };

  startScenarioLoopRef.current = (index: number) => {
    scenarioIndexRef.current = (index + 1) % AGENT_SCENARIOS.length;
    startAgentSimulation(AGENT_SCENARIOS[index]);
  };

  const handleAgentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startAgentSimulation(agentInput);
  };

  const openWikiMenu = () => {
    if (wikiMenuTimeoutRef.current) {
      window.clearTimeout(wikiMenuTimeoutRef.current);
      wikiMenuTimeoutRef.current = null;
    }

    if (contactMenuTimeoutRef.current) {
      window.clearTimeout(contactMenuTimeoutRef.current);
      contactMenuTimeoutRef.current = null;
    }

    setIsContactMenuOpen(false);
    setIsWikiMenuOpen(true);
  };

  const scheduleWikiMenuClose = () => {
    if (wikiMenuTimeoutRef.current) {
      window.clearTimeout(wikiMenuTimeoutRef.current);
    }

    wikiMenuTimeoutRef.current = window.setTimeout(() => {
      setIsWikiMenuOpen(false);
      wikiMenuTimeoutRef.current = null;
    }, WIKI_MENU_HIDE_DELAY_MS);
  };

  const openContactMenu = () => {
    if (contactMenuTimeoutRef.current) {
      window.clearTimeout(contactMenuTimeoutRef.current);
      contactMenuTimeoutRef.current = null;
    }

    if (wikiMenuTimeoutRef.current) {
      window.clearTimeout(wikiMenuTimeoutRef.current);
      wikiMenuTimeoutRef.current = null;
    }

    setIsWikiMenuOpen(false);
    setIsContactMenuOpen(true);
  };

  const scheduleContactMenuClose = () => {
    if (contactMenuTimeoutRef.current) {
      window.clearTimeout(contactMenuTimeoutRef.current);
    }

    contactMenuTimeoutRef.current = window.setTimeout(() => {
      setIsContactMenuOpen(false);
      contactMenuTimeoutRef.current = null;
    }, CONTACT_MENU_HIDE_DELAY_MS);
  };

  const isAgentRunning =
    agentExecution.phase !== 'idle' && agentExecution.phase !== 'complete';
  const isLightMode = theme === 'light';
  const typedHeadlineLines = HEADLINE_LINES.map((line) =>
    line.slice(0, headlineStep)
  );
  const firstLineTypedCount = Math.min(headlineStep, HEADLINE_LINES[0].length);
  const firstLineVisiblePrefix = AGENT_OS_PREFIX.slice(
    0,
    Math.min(firstLineTypedCount, AGENT_OS_PREFIX.length)
  );
  const typedFirstLineSuffixCount = Math.max(
    0,
    firstLineTypedCount - AGENT_OS_PREFIX.length
  );
  const typedFirstLineSuffix = AGENT_OS_SUFFIX.slice(
    0,
    typedFirstLineSuffixCount
  );
  const secondLineTypedCount = Math.min(headlineStep, HEADLINE_LINES[1].length);
  const secondLineVisiblePrefix = REDEFINES_PREFIX.slice(
    0,
    Math.min(secondLineTypedCount, REDEFINES_PREFIX.length)
  );
  const typedRedefinesCount = Math.max(
    0,
    secondLineTypedCount - REDEFINES_PREFIX.length
  );
  const secondLineVisibleTarget = REDEFINES_TARGET.slice(
    0,
    typedRedefinesCount
  );
  const isRedefinesUnderlineVisible =
    secondLineTypedCount >= HEADLINE_LINES[1].length;
  const typedLastLine = typedHeadlineLines[2];
  const typedLastLineHasPeriod = typedLastLine.endsWith('.');
  const typedLastLineBody = typedLastLineHasPeriod
    ? typedLastLine.slice(0, -1)
    : typedLastLine;

  return (
    <div
      ref={pageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`welcome-page relative isolate min-h-screen overflow-hidden ${
        isLightMode ? 'bg-[#eef2f7] text-[#12151b]' : 'bg-[#020202] text-white'
      }`}
      style={
        {
          '--spotlight-x': '74%',
          '--spotlight-y': '34%',
        } as CSSProperties
      }
    >
      <TunnelBackground mode={theme} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            isLightMode
              ? 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(237,241,247,0.34) 100%)'
              : 'linear-gradient(180deg, rgba(2,2,2,0.08) 0%, rgba(2,2,2,0.22) 100%)',
        }}
      />
      <div
        className={`pointer-events-none absolute inset-0 ${
          isLightMode ? 'opacity-62' : 'opacity-72 mix-blend-screen'
        }`}
        style={{
          background:
            isLightMode
              ? 'radial-gradient(circle 108px at var(--spotlight-x) var(--spotlight-y), rgba(153,117,255,0.24) 0%, rgba(231,146,199,0.18) 16%, rgba(255,177,198,0.13) 30%, transparent 54%)'
              : 'radial-gradient(circle 108px at var(--spotlight-x) var(--spotlight-y), rgba(255,255,255,0.18) 0%, rgba(220,142,255,0.14) 16%, rgba(255,129,173,0.095) 30%, transparent 54%)',
        }}
      />
      <div
        className={`pointer-events-none absolute inset-0 ${
          isLightMode ? 'opacity-28' : 'opacity-40'
        }`}
        style={{
          background:
            isLightMode
              ? 'radial-gradient(circle at 18% 18%, rgba(126,67,255,0.12), transparent 30%), radial-gradient(circle at 82% 22%, rgba(255,99,158,0.08), transparent 26%), radial-gradient(circle at 50% 100%, rgba(117,54,224,0.06), transparent 28%)'
              : 'radial-gradient(circle at 18% 18%, rgba(126,67,255,0.12), transparent 30%), radial-gradient(circle at 82% 22%, rgba(255,99,158,0.1), transparent 26%), radial-gradient(circle at 50% 100%, rgba(117,54,224,0.08), transparent 28%)',
        }}
      />
      <div
        className={`pointer-events-none absolute inset-0 z-[1] transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isThemeTransitioning ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: isLightMode
            ? 'rgba(255,255,255,0.22)'
            : 'rgba(11,10,16,0.24)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />
      <div
        className={`absolute inset-x-0 top-0 z-30 border-b backdrop-blur-xl transform-gpu will-change-transform will-change-opacity transition-[transform,opacity,filter] duration-[1050ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          hasHeaderEntered
            ? 'translate-y-0 scale-100 opacity-100 blur-0'
            : '-translate-y-8 scale-[0.988] opacity-0 blur-md'
        } ${
          isLightMode
            ? 'border-[#1a2030]/8 bg-[linear-gradient(90deg,rgba(255,255,255,0.78),rgba(246,241,252,0.72),rgba(244,236,243,0.76))]'
            : 'border-white/10 bg-[linear-gradient(90deg,rgba(74,18,111,0.62),rgba(83,17,88,0.44),rgba(116,24,76,0.56))]'
        }`}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4 sm:px-8 lg:px-12">
          <div
            className={`order-1 min-w-0 justify-self-start transform-gpu will-change-transform will-change-opacity transition-[transform,opacity,filter] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              hasHeaderEntered
                ? 'translate-y-0 opacity-100 blur-0'
                : 'translate-y-4 opacity-0 blur-[6px]'
            }`}
            style={{ transitionDelay: hasHeaderEntered ? '230ms' : '0ms' }}
          >
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
              <span
                className={`whitespace-nowrap text-[0.96rem] leading-6 sm:text-base sm:leading-7 ${
                  isLightMode ? 'text-[#2d3546]/72' : 'text-white/[0.67]'
                }`}
              >
                INJ Pass
              </span>
              <p
                className={`truncate text-[0.72rem] font-medium leading-5 sm:whitespace-nowrap sm:text-sm ${
                  isLightMode ? 'text-[#1a2231]/82' : 'text-white/[0.78]'
                }`}
              >
                Agent Wallet for Injective
              </p>
            </div>
          </div>

          <p
            className={`order-3 col-span-2 min-w-0 text-center text-[0.64rem] font-medium leading-5 tracking-[0.14em] transform-gpu will-change-transform will-change-opacity transition-[transform,opacity,filter] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:order-2 sm:col-span-1 sm:justify-self-center sm:-ml-2 sm:text-[0.78rem] sm:leading-normal sm:tracking-[0.16em] ${
              hasHeaderEntered
                ? 'translate-y-0 opacity-100 blur-0'
                : 'translate-y-4 opacity-0 blur-[6px]'
            } ${
              isLightMode ? 'text-[#3e4658]' : 'text-white/[0.82]'
            }`}
            style={{ transitionDelay: hasHeaderEntered ? '230ms' : '0ms' }}
          >
            Unstable Preview Release without Auditing under Risk
          </p>

          <div
            className={`order-2 flex items-center justify-end gap-2 justify-self-end transform-gpu will-change-transform will-change-opacity transition-[transform,opacity,filter] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:order-3 ${
              hasHeaderEntered
                ? 'translate-y-0 opacity-100 blur-0'
                : 'translate-y-4 opacity-0 blur-[6px]'
            }`}
            style={{ transitionDelay: hasHeaderEntered ? '230ms' : '0ms' }}
          >
            <div
              className="relative"
              onMouseEnter={openWikiMenu}
              onMouseLeave={scheduleWikiMenuClose}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isWikiMenuOpen}
                onClick={() => {
                  if (isWikiMenuOpen) {
                    scheduleWikiMenuClose();
                    return;
                  }

                  openWikiMenu();
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) {
                    scheduleWikiMenuClose();
                  }
                }}
                className={`inline-flex h-7 items-center justify-center text-[0.78rem] font-medium underline underline-offset-[0.24em] transition-colors ${
                  isLightMode
                    ? 'text-[#384055] hover:text-[#11161f]'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                WIKI
              </button>
              <div
                className={`absolute right-0 top-full z-40 mt-2 min-w-[11.5rem] origin-top-right rounded-[18px] border p-1.5 shadow-[0_18px_48px_rgba(10,8,18,0.18)] backdrop-blur-xl transition-[opacity,transform,filter] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform will-change-opacity ${
                  isWikiMenuOpen
                    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0'
                    : 'pointer-events-none -translate-y-1 scale-[0.96] opacity-0 blur-[6px]'
                } ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-[rgba(255,255,255,0.88)]'
                    : 'border-white/10 bg-[rgba(18,18,24,0.84)]'
                }`}
                role="menu"
                onMouseEnter={openWikiMenu}
                onMouseLeave={scheduleWikiMenuClose}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-[0.84rem] font-medium transition-colors ${
                    isLightMode
                      ? 'text-[#202634] hover:bg-[#151a27]/6'
                      : 'text-white/[0.86] hover:bg-white/[0.06]'
                  }`}
                >
                  Documentation
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-[0.84rem] font-medium transition-colors ${
                    isLightMode
                      ? 'text-[#202634] hover:bg-[#151a27]/6'
                      : 'text-white/[0.86] hover:bg-white/[0.06]'
                  }`}
                >
                  FAQ
                </button>
              </div>
            </div>
            <div
              className="relative"
              onMouseEnter={openContactMenu}
              onMouseLeave={scheduleContactMenuClose}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isContactMenuOpen}
                onClick={() => {
                  if (isContactMenuOpen) {
                    scheduleContactMenuClose();
                    return;
                  }

                  openContactMenu();
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) {
                    scheduleContactMenuClose();
                  }
                }}
                className={`inline-flex h-7 items-center justify-center text-[0.78rem] font-medium underline underline-offset-[0.24em] transition-colors ${
                  isLightMode
                    ? 'text-[#384055] hover:text-[#11161f]'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                Contact
              </button>
              <div
                className={`absolute right-0 top-full z-40 mt-2 min-w-[11.5rem] origin-top-right rounded-[18px] border p-1.5 shadow-[0_18px_48px_rgba(10,8,18,0.18)] backdrop-blur-xl transition-[opacity,transform,filter] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform will-change-opacity ${
                  isContactMenuOpen
                    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0'
                    : 'pointer-events-none -translate-y-1 scale-[0.96] opacity-0 blur-[6px]'
                } ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-[rgba(255,255,255,0.88)]'
                    : 'border-white/10 bg-[rgba(18,18,24,0.84)]'
                }`}
                role="menu"
                onMouseEnter={openContactMenu}
                onMouseLeave={scheduleContactMenuClose}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-[0.84rem] font-medium transition-colors ${
                    isLightMode
                      ? 'text-[#202634] hover:bg-[#151a27]/6'
                      : 'text-white/[0.86] hover:bg-white/[0.06]'
                  }`}
                >
                  Partnerships
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-[0.84rem] font-medium transition-colors ${
                    isLightMode
                      ? 'text-[#202634] hover:bg-[#151a27]/6'
                      : 'text-white/[0.86] hover:bg-white/[0.06]'
                  }`}
                >
                  Submit a Ticket
                </button>
              </div>
            </div>
            <a
              href="https://x.com/INJ_Pass"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                isLightMode
                  ? 'border-[#151a27]/10 bg-white/72 text-[#384055] hover:text-[#11161f]'
                  : 'border-white/10 bg-white/[0.05] text-white/75 hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a
              href="https://t.me/injective"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                isLightMode
                  ? 'border-[#151a27]/10 bg-white/72 text-[#384055] hover:text-[#11161f]'
                  : 'border-white/10 bg-white/[0.05] text-white/75 hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.84 8.673c-.136.624-.5.778-.999.485l-2.761-2.036-1.332 1.281c-.147.147-.271.271-.556.271l.199-2.822 5.13-4.638c.223-.199-.049-.31-.346-.111l-6.341 3.993-2.733-.853c-.593-.187-.605-.593.126-.879l10.691-4.12c.496-.183.929.112.762.874z"/>
              </svg>
            </a>
            <button
              type="button"
              onClick={handleThemeToggle}
              aria-label={
                isLightMode ? 'Switch to dark mode' : 'Switch to light mode'
              }
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                isLightMode
                  ? 'border-[#151a27]/10 bg-white/78 text-[#384055] hover:text-[#11161f]'
                  : 'border-white/10 bg-white/[0.05] text-white/75 hover:text-white'
              }`}
            >
              {isLightMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isThemeTransitioning ? 'rotate-180 scale-95' : 'rotate-0 scale-100'}`}>
                  <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0 4a1 1 0 0 1-1-1v-1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1Zm0-18a1 1 0 0 1-1-1V2a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1Zm10 8a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM4 12a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1Zm14.95 6.364a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707ZM5.757 5.172a1 1 0 0 1 1.414 0l.707.707A1 1 0 1 1 6.464 7.293l-.707-.707a1 1 0 0 1 0-1.414Zm12.193 0a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM7.171 16.707a1 1 0 1 1-1.414 1.414l-.707-.707a1 1 0 0 1 1.414-1.414l.707.707Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isThemeTransitioning ? 'rotate-180 scale-95' : 'rotate-0 scale-100'}`}>
                  <path d="M21.752 15.002A9 9 0 0 1 11 2.248a1 1 0 0 0-1.185-1.185A11 11 0 1 0 22.937 14.19a1 1 0 0 0-1.185-1.185Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4 sm:top-24">
        {errorToast ? (
          <ErrorToast
            key={errorToast.id}
            message={errorToast.message}
            isExiting={errorToast.isExiting}
            isLightMode={isLightMode}
          />
        ) : null}
      </div>

      {isCreateDialogOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onClick={handleCloseCreateDialog}
        >
          <form
            onSubmit={handleCreateWallet}
            onClick={(event) => event.stopPropagation()}
            className={`w-full max-w-md rounded-[28px] border p-5 shadow-[0_30px_120px_rgba(15,10,26,0.22)] backdrop-blur-xl sm:p-6 ${
              isLightMode
                ? 'border-[#151a27]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,238,250,0.88))]'
                : 'border-white/10 bg-[linear-gradient(180deg,rgba(42,20,54,0.92),rgba(20,12,29,0.94))]'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className={`text-[0.7rem] font-medium uppercase tracking-[0.22em] ${
                    isLightMode ? 'text-[#6a7287]' : 'text-white/[0.42]'
                  }`}
                >
                  Start a new INJ Pass wallet
                </p>
                <h2
                  className={`mt-2 text-xl font-semibold ${
                    isLightMode ? 'text-[#161b24]' : 'text-white'
                  }`}
                >
                  Name your INJ Pass
                </h2>
                <p
                  className={`mt-2 max-w-sm text-sm leading-6 ${
                    isLightMode ? 'text-[#50586d]' : 'text-white/[0.58]'
                  }`}
                >
                  Approve the passkey request, pair this wallet to the current
                  device, and continue into your dashboard.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseCreateDialog}
                disabled={pendingAction === 'create'}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-white/72 text-[#4d556a] hover:text-[#161b24]'
                    : 'border-white/10 bg-white/[0.05] text-white/62 hover:text-white'
                }`}
                aria-label="Close create wallet dialog"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4"
                >
                  <path
                    d="M6 6 18 18M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <label
              htmlFor="wallet-name"
              className={`mt-6 flex items-center justify-between gap-4 text-[0.72rem] font-medium uppercase tracking-[0.2em] ${
                isLightMode ? 'text-[#5f6880]' : 'text-white/[0.42]'
              }`}
            >
              <span>Wallet name</span>
              <button
                type="button"
                onClick={() => setIsInviteCodeVisible((current) => !current)}
                className={`text-[0.68rem] normal-case tracking-normal underline underline-offset-[0.24em] transition-colors ${
                  isLightMode
                    ? 'text-[#586179] hover:text-[#161b24]'
                    : 'text-white/[0.58] hover:text-white/[0.86]'
                }`}
              >
                I have an invite code
              </button>
            </label>
            <input
              ref={createNameInputRef}
              id="wallet-name"
              type="text"
              value={walletNameInput}
              onChange={(event) => setWalletNameInput(event.target.value)}
              placeholder="Enter wallet name"
              maxLength={20}
              disabled={pendingAction === 'create'}
              className={`mt-3 w-full rounded-2xl border px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#d96eff]/18 disabled:cursor-not-allowed disabled:opacity-65 ${
                isLightMode
                  ? 'border-[#151a27]/10 bg-white/78 text-[#171b24] placeholder:text-[#71798d] focus:border-[#d96eff]/22'
                  : 'border-white/[0.12] bg-[rgba(255,255,255,0.04)] text-white placeholder:text-white/26 focus:border-[#d96eff]/34'
              }`}
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            />
            {isInviteCodeVisible ? (
              <input
                id="invite-code"
                type="text"
                value={inviteCodeInput}
                onChange={(event) => setInviteCodeInput(event.target.value.toUpperCase())}
                placeholder="Enter invite code"
                maxLength={8}
                disabled={pendingAction === 'create'}
                className={`mt-3 w-full rounded-2xl border px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#d96eff]/18 disabled:cursor-not-allowed disabled:opacity-65 ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-white/78 text-[#171b24] placeholder:text-[#71798d] focus:border-[#d96eff]/22'
                    : 'border-white/[0.12] bg-[rgba(255,255,255,0.04)] text-white placeholder:text-white/26 focus:border-[#d96eff]/34'
                }`}
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              />
            ) : null}
            {needsPasswordFallback ? (
              <input
                id="fallback-password"
                type="password"
                value={passwordFallback}
                onChange={(event) => setPasswordFallback(event.target.value)}
                placeholder="设置钱包密码（≥8 位，无法找回）"
                disabled={pendingAction === 'create'}
                className={`mt-3 w-full rounded-2xl border px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#d96eff]/18 disabled:cursor-not-allowed disabled:opacity-65 ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-white/78 text-[#171b24] placeholder:text-[#71798d] focus:border-[#d96eff]/22'
                    : 'border-white/[0.12] bg-[rgba(255,255,255,0.04)] text-white placeholder:text-white/26 focus:border-[#d96eff]/34'
                }`}
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              />
            ) : null}
            <p
              className={`mt-2 text-xs ${
                isLightMode ? 'text-[#727b90]' : 'text-white/[0.34]'
              }`}
            >
              Up to 20 characters. This will be used for passkey registration.
            </p>

            {createDialogError ? (
              <p
                role="alert"
                className={`mt-3 rounded-xl border px-3 py-2 text-sm font-medium ${
                  isLightMode
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-red-400/35 bg-red-500/10 text-red-300'
                }`}
              >
                {createDialogError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleCloseCreateDialog}
                disabled={pendingAction === 'create'}
                className={`inline-flex min-h-12 w-full items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isLightMode
                    ? 'border-[#151a27]/10 bg-white/78 text-[#202634] hover:bg-white'
                    : 'border-white/[0.12] bg-white/[0.04] text-white/[0.86] hover:bg-white/[0.08]'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pendingAction === 'create'}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7f2cff_0%,#d51f93_58%,#ff6f88_100%)] px-4 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(199,45,144,0.24)] transition duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              >
                <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>
                  {pendingAction === 'create'
                    ? 'Approving passkey...'
                    : 'Create INJ Pass'}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-start px-4 pb-24 pt-40 sm:px-8 sm:pb-16 sm:pt-40 lg:px-12 lg:items-center">
        <div className="grid w-full gap-10 sm:gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,0.88fr)] lg:items-center">
          <section className="max-w-none lg:max-w-2xl">
            <div>
              <h1
                aria-label={HEADLINE_TEXT}
                className={`relative max-w-3xl text-[2.55rem] font-semibold leading-[0.96] tracking-[-0.055em] sm:text-5xl sm:leading-[1.01] lg:text-[4.55rem] ${
                  isLightMode ? 'text-[#141821]' : 'text-white'
                }`}
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                <span aria-hidden="true" className="invisible block">
                  {HEADLINE_LINES.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
                <span aria-hidden="true" className="absolute inset-0 block">
                  <span className="block">
                    <span className="relative inline-block pb-[0.14em]">
                      {firstLineVisiblePrefix}
                      {typedFirstLineSuffix ? (
                        <AnimatedAgentOsSuffix text={typedFirstLineSuffix} />
                      ) : null}
                    </span>
                  </span>
                  <span className="block">
                    {secondLineVisiblePrefix}
                    <span className="relative inline-block pb-[0.12em]">
                      {secondLineVisibleTarget}
                      {isRedefinesUnderlineVisible ? (
                        <span
                          className="pointer-events-none absolute -left-[2%] -right-[2%] -bottom-[0.005em] h-[0.085em] origin-left overflow-hidden rounded-full motion-safe:animate-[agentOsUnderlineIn_720ms_cubic-bezier(0.22,1,0.36,1)_both]"
                        >
                          <span
                            className={`absolute inset-0 rounded-full ${
                              isLightMode
                                ? 'bg-[linear-gradient(90deg,rgba(63,114,255,0.82)_0%,rgba(102,153,255,0.92)_48%,rgba(161,203,255,0.78)_100%)]'
                                : 'bg-[linear-gradient(90deg,rgba(88,138,255,0.84)_0%,rgba(118,175,255,0.96)_48%,rgba(182,220,255,0.82)_100%)]'
                            }`}
                          />
                          <span
                            className={`absolute inset-x-[3%] inset-y-0 rounded-full blur-[2.5px] ${
                              isLightMode
                                ? 'bg-[linear-gradient(90deg,rgba(113,165,255,0)_0%,rgba(113,165,255,0.18)_18%,rgba(177,214,255,0.34)_52%,rgba(113,165,255,0.12)_82%,rgba(113,165,255,0)_100%)]'
                                : 'bg-[linear-gradient(90deg,rgba(130,184,255,0)_0%,rgba(130,184,255,0.2)_18%,rgba(196,225,255,0.38)_52%,rgba(130,184,255,0.14)_82%,rgba(130,184,255,0)_100%)]'
                            } motion-safe:animate-[agentOsUnderlineGlow_4.4s_ease-in-out_0.78s_infinite]`}
                          />
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="block">
                    {typedLastLineBody}
                    {typedLastLineHasPeriod ? (
                      <span
                        className={
                          headlineStep >= HEADLINE_LINES[2].length
                            ? 'motion-safe:animate-[headlineDotBlink_1.05s_ease-in-out_infinite]'
                            : ''
                        }
                      >
                        .
                      </span>
                    ) : null}
                  </span>
                </span>
              </h1>
              <p
                className={`mt-4 max-w-[34rem] text-[0.98rem] leading-6 sm:mt-5 sm:max-w-xl sm:text-lg sm:leading-7 ${
                  isLightMode ? 'text-[#2d3546]/72' : 'text-white/[0.67]'
                }`}
              >
                Simplify onchain execution with secure, intelligent automation
                anytime, anywhere, across every stage of your Web3 journey.
              </p>
            </div>

            <div className="mt-7 grid gap-3 sm:mt-8 sm:max-w-xl sm:grid-cols-2">
              <button
                type="button"
                onClick={handleOpenCreateDialog}
                disabled={pendingAction !== null}
                className={`inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7f2cff_0%,#d51f93_58%,#ff6f88_100%)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(199,45,144,0.28)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8ab0]/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 ${
                  isLightMode
                    ? 'focus-visible:ring-offset-[#eef2f7]'
                    : 'focus-visible:ring-offset-[#15091f]'
                }`}
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              >
                <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>
                  {pendingAction === 'create' ? 'Creating...' : 'Create INJ Pass'}
                </span>
              </button>
              <button
                type="button"
                onClick={handleEnterWallet}
                disabled={pendingAction !== null}
                className={`inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl border px-5 text-base font-semibold transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d86dff]/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 ${
                  isLightMode
                    ? 'border-[#161c29]/10 bg-white/68 text-[#202634] hover:-translate-y-0.5 hover:border-[#d96eff]/24 hover:bg-white/88'
                    : 'border-white/[0.12] bg-[linear-gradient(135deg,rgba(99,29,149,0.12),rgba(231,41,131,0.08))] text-white/[0.88] hover:-translate-y-0.5 hover:border-[#d96eff]/26 hover:bg-[linear-gradient(135deg,rgba(115,38,199,0.18),rgba(232,40,129,0.12))]'
                }`}
                style={{
                  boxShadow: isLightMode ? '0 10px 28px rgba(170, 107, 186, 0.08)' : undefined,
                  ...(isLightMode
                    ? { ['--tw-ring-offset-color' as string]: '#eef2f7' }
                    : { ['--tw-ring-offset-color' as string]: '#15091f' }),
                }}
              >
                {pendingAction === 'enter' ? 'Entering...' : 'Enter INJ Pass'}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <TrustPill
                label="Sovereign Custody"
                isLightMode={isLightMode}
                icon="custody"
              />
              <TrustPill
                label="Passkey Security"
                isLightMode={isLightMode}
                icon="passkey"
              />
              <TrustPill
                label="Agent Sandbox"
                isLightMode={isLightMode}
                icon="lock"
              />
            </div>

            {walletExists ? (
              <p className={`mt-4 text-sm ${isLightMode ? 'text-[#5d677d]' : 'text-white/[0.45]'}`}>
                A passkey wallet is already paired on this device. Enter INJ
                Pass will authenticate it in the current session.
              </p>
            ) : null}
          </section>

          <aside className="w-full max-w-none lg:w-[34rem] lg:max-w-[34rem] lg:justify-self-end">
            <form onSubmit={handleAgentSubmit} className="w-full">
              <div
                ref={conversationViewportRef}
                className="conversation-scrollbar h-[18.5rem] space-y-2.5 overflow-y-auto pr-0.5 sm:h-[22rem] sm:space-y-3 sm:pr-1 lg:h-[26rem]"
              >
                {conversationMessages.map((message, index) => (
                  <ConversationBubble
                    key={`${message.role}-${index}-${message.title ?? ''}-${message.body}`}
                    role={message.role}
                    title={message.title}
                    body={message.body}
                    tone={message.tone}
                    isLightMode={isLightMode}
                  />
                ))}
              </div>

              <div className={`mt-4 rounded-[20px] border-[1.5px] p-2.5 backdrop-blur-md sm:rounded-[22px] sm:p-3 ${
                isLightMode
                  ? 'border-[#151a27]/12 bg-[rgba(255,255,255,0.72)]'
                  : 'border-white/[0.16] bg-[rgba(20,21,25,0.28)]'
              }`}>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full w-[42%] rounded-full bg-[linear-gradient(90deg,#8b34ff,#df2690,#ff7189)] motion-safe:animate-[runline_1.8s_ease-in-out_infinite]"
                  />
                </div>

                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <input
                    type="text"
                    value={agentInput}
                    onChange={(event) => setAgentInput(event.target.value)}
                    spellCheck={false}
                    disabled={isAgentRunning}
                    className={`min-w-0 w-full flex-1 rounded-2xl border-[1.5px] px-4 py-3 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-[#d96eff]/18 disabled:cursor-not-allowed disabled:opacity-65 sm:text-[1rem] ${
                      isLightMode
                        ? 'border-[#151a27]/12 bg-white/74 text-[#171b24] placeholder:text-[#6b7387]'
                        : 'border-white/[0.14] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-white/24'
                    }`}
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    placeholder="Swap 50 USDT to INJ"
                  />
                  <button
                    type="submit"
                    disabled={!agentInput.trim() || isAgentRunning}
                    className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d96eff]/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
                      isAgentRunning
                        ? isLightMode
                          ? 'border-[#d96eff]/28 bg-[linear-gradient(135deg,rgba(128,44,255,0.18),rgba(237,38,137,0.14))] text-[#171b24] shadow-[0_0_0_1px_rgba(255,255,255,0.6),0_0_28px_rgba(214,49,149,0.12)]'
                          : 'border-[#d96eff]/28 bg-[linear-gradient(135deg,rgba(128,44,255,0.24),rgba(237,38,137,0.18))] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(214,49,149,0.18)]'
                        : isLightMode
                          ? 'border-[#151a27]/12 bg-white/80 text-[#171b24] hover:border-[#d96eff]/22 hover:bg-white'
                          : 'border-white/[0.14] bg-[linear-gradient(135deg,rgba(128,44,255,0.14),rgba(237,38,137,0.08))] text-white hover:border-[#d96eff]/26 hover:bg-[linear-gradient(135deg,rgba(128,44,255,0.2),rgba(237,38,137,0.12))]'
                    }`}
                    style={{
                      boxShadow: isLightMode ? '0 10px 26px rgba(108, 86, 148, 0.08)' : undefined,
                    }}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isAgentRunning
                          ? 'bg-white motion-safe:animate-pulse'
                          : 'bg-white/[0.62]'
                      }`}
                    />
                    {isAgentRunning ? 'Executing...' : 'Send to Agent'}
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      </main>
      <div className="fixed bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap px-3 text-[0.68rem] sm:bottom-6 sm:text-sm">
        <span className={isLightMode ? 'text-[#6a7387]' : 'text-gray-400'}>Powered by</span>
        <span className={`font-semibold ${isLightMode ? 'text-[#171b24]' : 'text-white'}`}>Injective</span>
        <Image
          src={isLightMode ? '/injective-ocean.png' : '/injlogo.png'}
          alt="Injective Logo"
          width={20}
          height={20}
          className={
            isLightMode
              ? '-ml-1 h-[0.92rem] w-[0.92rem] sm:h-[1.08rem] sm:w-[1.08rem]'
              : '-ml-1.5 h-4 w-4 md:h-5 md:w-5'
          }
        />
      </div>

      <style jsx global>{`
        @keyframes orbFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(18px, -24px, 0) scale(1.06);
          }
        }

        @keyframes orbFloatReverse {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-24px, 16px, 0) scale(0.96);
          }
        }

        @keyframes orbPulse {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(0.96);
            opacity: 0.4;
          }
          50% {
            transform: translate3d(10px, 14px, 0) scale(1.08);
            opacity: 0.72;
          }
        }

        @keyframes ambientDrift {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1.02);
            opacity: 0.56;
          }
          33% {
            transform: translate3d(-18px, 10px, 0) scale(1.06);
            opacity: 0.72;
          }
          66% {
            transform: translate3d(14px, -16px, 0) scale(0.98);
            opacity: 0.5;
          }
        }

        @keyframes runline {
          0% {
            transform: translateX(-130%);
          }
          50% {
            transform: translateX(130%);
          }
          100% {
            transform: translateX(260%);
          }
        }

        @keyframes headlineDotBlink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }

        @keyframes agentOsLiquidFlow {
          0%,
          100% {
            background-position:
              14% 14%,
              18% 22%,
              78% 70%,
              48% 82%;
            background-size:
              220% 220%,
              158% 158%,
              148% 148%,
              150% 150%;
          }
          34% {
            background-position:
              84% 26%,
              42% 18%,
              62% 80%,
              24% 68%;
            background-size:
              232% 232%,
              150% 150%,
              160% 160%,
              146% 146%;
          }
          68% {
            background-position:
              18% 84%,
              74% 34%,
              22% 58%,
              66% 18%;
            background-size:
              228% 228%,
              164% 164%,
              144% 144%,
              156% 156%;
          }
        }

        @keyframes agentOsLiquidHighlight {
          0%,
          100% {
            opacity: 0.38;
            transform: translate3d(0, 0, 0) scale(1);
            background-position:
              18% 24%,
              82% 68%;
          }
          50% {
            opacity: 0.74;
            transform: translate3d(1px, -1px, 0) scale(1.015);
            background-position:
              62% 18%,
              34% 82%;
          }
        }

        @keyframes agentOsUnderlineIn {
          0% {
            opacity: 0;
            transform: scaleX(0.18) translateY(2px);
            filter: blur(2px);
          }
          100% {
            opacity: 1;
            transform: scaleX(1) translateY(0);
            filter: blur(0);
          }
        }

        @keyframes agentOsUnderlineSweep {
          0%,
          100% {
            opacity: 0.72;
            filter: brightness(0.98);
          }
          50% {
            opacity: 1;
            filter: brightness(1.08);
          }
        }

        @keyframes agentOsUnderlineGlow {
          0%,
          100% {
            opacity: 0.54;
            transform: scaleX(0.985);
          }
          50% {
            opacity: 0.9;
            transform: scaleX(1);
          }
        }

        @keyframes headerBarDrop {
          0% {
            opacity: 0;
            transform: translate3d(0, -40px, 0);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0);
          }
        }

        @keyframes headerContentReveal {
          0% {
            opacity: 0;
            transform: translate3d(0, 18px, 0);
            filter: blur(8px);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0);
          }
        }

        @keyframes toastIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 14px, 0) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes toastOut {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, -20px, 0) scale(0.985);
          }
        }

        @keyframes toastCountdown {
          0% {
            transform: scaleX(1);
          }
          100% {
            transform: scaleX(0);
          }
        }

        .welcome-page,
        .welcome-page * {
          transition-property: background-color, color, border-color, box-shadow, fill, stroke;
          transition-duration: 460ms;
          transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
        }

        .conversation-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .conversation-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );

  function clearAgentSimulation() {
    agentTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    agentTimeoutsRef.current = [];
  }

  function clearErrorToastTimers() {
    if (errorToastTimeoutRef.current) {
      window.clearTimeout(errorToastTimeoutRef.current);
      errorToastTimeoutRef.current = null;
    }

    if (errorToastExitTimeoutRef.current) {
      window.clearTimeout(errorToastExitTimeoutRef.current);
      errorToastExitTimeoutRef.current = null;
    }
  }

  function dismissErrorToast(immediate = false) {
    clearErrorToastTimers();

    if (immediate) {
      setErrorToast(null);
      return;
    }

    setErrorToast((currentToast) =>
      currentToast ? { ...currentToast, isExiting: true } : currentToast
    );

    errorToastExitTimeoutRef.current = window.setTimeout(() => {
      setErrorToast(null);
      errorToastExitTimeoutRef.current = null;
    }, ERROR_TOAST_EXIT_MS);
  }

  function showErrorToast(message: string) {
    clearErrorToastTimers();

    const nextToastId = Date.now();
    setErrorToast({
      id: nextToastId,
      message,
      isExiting: false,
    });

    errorToastTimeoutRef.current = window.setTimeout(() => {
      setErrorToast((currentToast) =>
        currentToast && currentToast.id === nextToastId
          ? { ...currentToast, isExiting: true }
          : currentToast
      );

      errorToastExitTimeoutRef.current = window.setTimeout(() => {
        setErrorToast((currentToast) =>
          currentToast && currentToast.id === nextToastId ? null : currentToast
        );
        errorToastExitTimeoutRef.current = null;
      }, ERROR_TOAST_EXIT_MS);

      errorToastTimeoutRef.current = null;
    }, ERROR_TOAST_DURATION_MS);
  }

  function appendConversationMessages(messages: ConversationMessage[]) {
    setConversationMessages((previousMessages) => [
      ...previousMessages.map((message): ConversationMessage => {
        if (message.tone === 'active') {
          return { ...message, tone: 'default' };
        }

        return message;
      }),
      ...messages,
    ]);
  }
}

export default function WelcomePage() {
  const { theme, isThemeReady } = useTheme();
  const [hasMountedSurface, setHasMountedSurface] = useState(false);

  useEffect(() => {
    if (!isThemeReady || hasMountedSurface) {
      return;
    }

    let rafTwo = 0;
    const rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        setHasMountedSurface(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(rafOne);
      if (rafTwo) {
        window.cancelAnimationFrame(rafTwo);
      }
    };
  }, [hasMountedSurface, isThemeReady, theme]);

  if (!hasMountedSurface) {
    return <WelcomeSkeleton isLightMode={theme === 'light'} />;
  }

  return <WelcomePageContent />;
}

function AnimatedAgentOsSuffix({ text }: { text: string }) {
  const sharedClipStyle: CSSProperties = {
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  return (
    <span className="relative inline-block align-baseline">
      <span
        className="relative z-[1] inline-block bg-clip-text text-transparent [filter:drop-shadow(0_0_6px_rgba(127,44,255,0.08))_drop-shadow(0_0_12px_rgba(213,31,147,0.05))] motion-safe:animate-[agentOsLiquidFlow_4.8s_cubic-bezier(0.42,0.05,0.58,0.95)_infinite]"
        style={{
          ...sharedClipStyle,
          backgroundImage: [
            'linear-gradient(to bottom right, #7f2cff 0%, #d51f93 58%, #ff6f88 100%)',
            'radial-gradient(circle at 18% 22%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 34%, transparent 58%)',
            'radial-gradient(circle at 78% 70%, rgba(255,182,211,0.22) 0%, rgba(255,182,211,0.08) 28%, transparent 56%)',
            'radial-gradient(circle at 48% 82%, rgba(144,109,255,0.16) 0%, rgba(144,109,255,0.05) 26%, transparent 52%)',
          ].join(','),
          backgroundSize: '220% 220%, 158% 158%, 148% 148%, 150% 150%',
          backgroundPosition: '14% 14%, 18% 22%, 78% 70%, 48% 82%',
        }}
      >
        {text}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 inline-block bg-clip-text text-transparent opacity-40 [filter:blur(0.25px)] [mix-blend-mode:screen] motion-safe:animate-[agentOsLiquidHighlight_3.9s_ease-in-out_infinite]"
        style={{
          ...sharedClipStyle,
          backgroundImage: [
            'radial-gradient(circle at 18% 24%, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.16) 18%, transparent 42%)',
            'radial-gradient(circle at 82% 68%, rgba(255,211,230,0.26) 0%, rgba(255,211,230,0.12) 20%, transparent 44%)',
          ].join(','),
          backgroundSize: '150% 150%, 136% 136%',
          backgroundPosition: '18% 24%, 82% 68%',
        }}
      >
        {text}
      </span>
    </span>
  );
}

function TrustPill({
  label,
  isLightMode,
  icon,
}: {
  label: string;
  isLightMode: boolean;
  icon?: 'custody' | 'passkey' | 'lock';
}) {
  const iconColorClass = isLightMode ? 'text-[#8c56ef]' : 'text-[#ff97bc]';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.82rem] sm:px-3.5 sm:py-2 sm:text-sm ${
        isLightMode
          ? 'border-[#161c29]/10 bg-white/72 text-[#273042]/78'
          : 'border-[#d96eff]/16 bg-[linear-gradient(135deg,rgba(116,40,189,0.18),rgba(231,55,132,0.08))] text-white/[0.74]'
      }`}
    >
      {icon ? (
        <span
          className={`inline-flex h-4 w-4 items-center justify-center ${iconColorClass}`}
          aria-hidden="true"
        >
          {icon === 'custody' ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <path
                d="M12 3.5 5.75 6.1v4.55c0 4.12 2.58 6.86 6.25 8.85 3.67-1.99 6.25-4.73 6.25-8.85V6.1L12 3.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M9.4 11.9 11.2 13.7l3.5-3.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : icon === 'passkey' ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <circle
                cx="8.25"
                cy="11"
                r="2.75"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M11 11h7.25m-2 0v2m-2-2v1.6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <path
                d="M8.25 10V8.75a3.75 3.75 0 1 1 7.5 0V10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <rect
                x="6.25"
                y="10"
                width="11.5"
                height="9"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          )}
        </span>
      ) : (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isLightMode ? 'bg-[#b476ff]' : 'bg-[#ff8fb0]'
          }`}
        />
      )}
      {label}
    </span>
  );
}

function ErrorToast({
  message,
  isExiting,
  isLightMode,
}: {
  message: string;
  isExiting: boolean;
  isLightMode: boolean;
}) {
  return (
    <div
      className={`pointer-events-auto w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border shadow-[0_16px_42px_rgba(16,8,18,0.18)] backdrop-blur-xl ${
        isLightMode
          ? 'border-red-500/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,245,247,0.88))] text-[#311318]'
          : 'border-red-400/18 bg-[linear-gradient(180deg,rgba(40,18,24,0.9),rgba(24,12,16,0.88))] text-red-50'
      } ${
        isExiting
          ? 'motion-safe:animate-[toastOut_320ms_cubic-bezier(0.22,1,0.36,1)_forwards]'
          : 'motion-safe:animate-[toastIn_320ms_cubic-bezier(0.22,1,0.36,1)]'
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            isLightMode
              ? 'border-red-500/16 bg-red-500/10 text-red-600'
              : 'border-red-400/18 bg-red-500/12 text-red-200'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              d="M12 8v4m0 3.5h.01M10.29 3.86 1.82 18a1.25 1.25 0 0 0 1.07 1.88h18.22A1.25 1.25 0 0 0 22.18 18l-8.47-14.14a1.25 1.25 0 0 0-2.42 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-medium uppercase tracking-[0.18em] ${
              isLightMode ? 'text-red-700/72' : 'text-red-100/58'
            }`}
          >
            Wallet Error
          </p>
          <p
            className={`mt-1 text-sm leading-6 ${
              isLightMode ? 'text-[#3c1a20]' : 'text-red-50/92'
            }`}
          >
            {message}
          </p>
        </div>
      </div>
      <div
        className={`h-1 w-full origin-left bg-[linear-gradient(90deg,#ff6a88,#ff8c7a,#ffb07c)] ${
          !isExiting
            ? 'motion-safe:animate-[toastCountdown_4.2s_linear_forwards]'
            : ''
        }`}
      />
    </div>
  );
}

function ConversationBubble({
  role,
  title,
  body,
  tone,
  isLightMode,
}: {
  role: 'assistant' | 'user';
  title?: string;
  body: string;
  tone: 'default' | 'active' | 'warning' | 'success';
  isLightMode: boolean;
}) {
  const isUser = role === 'user';
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [displayedBody, setDisplayedBody] = useState(() =>
    isUser ? body : ''
  );
  const [isStreaming, setIsStreaming] = useState(!isUser && body.length > 0);
  const bubbleTone = isUser
    ? isLightMode
      ? 'border-[#b48cff]/32 bg-[linear-gradient(135deg,rgba(180,140,255,0.14),rgba(255,143,186,0.08))] text-[#171b24]'
      : 'border-[#9d6cff]/38 bg-[linear-gradient(135deg,rgba(146,102,255,0.18),rgba(255,122,170,0.1))] text-white'
    : tone === 'warning'
      ? isLightMode
        ? 'border-amber-400/28 bg-[rgba(245,158,11,0.12)] text-[#5f4307]'
        : 'border-amber-400/34 bg-[rgba(245,158,11,0.14)] text-amber-50'
    : tone === 'success'
      ? isLightMode
        ? 'border-emerald-400/24 bg-[rgba(16,185,129,0.11)] text-[#17573f]'
        : 'border-emerald-400/30 bg-[rgba(16,185,129,0.12)] text-emerald-50'
      : tone === 'active'
        ? isLightMode
          ? 'border-[#d96eff]/28 bg-[linear-gradient(135deg,rgba(128,44,255,0.14),rgba(237,38,137,0.08))] text-[#2a1835]'
          : 'border-[#d96eff]/32 bg-[linear-gradient(135deg,rgba(128,44,255,0.22),rgba(237,38,137,0.14))] text-white'
        : isLightMode
          ? 'border-[#151a27]/10 bg-[rgba(255,255,255,0.74)] text-[#171b24]'
          : 'border-white/[0.14] bg-[rgba(255,255,255,0.06)] text-white/[0.9]';

  useEffect(() => {
    if (isUser) {
      return;
    }

    if (typeof window !== 'undefined') {
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      if (prefersReducedMotion) {
        const frameId = window.requestAnimationFrame(() => {
          setDisplayedBody(body);
          setIsStreaming(false);
        });

        return () => {
          window.cancelAnimationFrame(frameId);
        };
      }
    }

    if (!body.length) {
      const frameId = window.requestAnimationFrame(() => {
        setIsStreaming(false);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    let currentIndex = 0;
    const intervalId = window.setInterval(() => {
      currentIndex = Math.min(currentIndex + AI_STREAM_STEP, body.length);
      setDisplayedBody(body.slice(0, currentIndex));

      if (currentIndex >= body.length) {
        window.clearInterval(intervalId);
        setIsStreaming(false);
        return;
      }
    }, AI_STREAM_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [body, isUser]);

  useEffect(() => {
    const bubble = bubbleRef.current;
    const viewport = bubble?.closest('.conversation-scrollbar');

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [displayedBody]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        ref={bubbleRef}
        className={`max-w-[92%] rounded-[20px] border-[1.5px] px-3.5 py-2.5 sm:max-w-[88%] sm:rounded-[22px] sm:px-4 sm:py-3 ${bubbleTone}`}
      >
        <div className="flex items-center gap-2 text-[0.62rem] font-medium uppercase tracking-[0.18em] sm:text-[0.68rem] sm:tracking-[0.2em]">
          <span
            className={`h-2 w-2 rounded-full ${
              isUser
                ? isLightMode
                  ? 'bg-[#b874ff]'
                  : 'bg-[#ff98b4]'
                : tone === 'warning'
                  ? 'bg-amber-300 motion-safe:animate-pulse'
                : tone === 'success'
                  ? 'bg-emerald-300'
                  : tone === 'active'
                    ? 'bg-[#db76ff] motion-safe:animate-pulse'
                    : isLightMode
                      ? 'bg-[#747e94]'
                      : 'bg-[#d88cff]/55'
            }`}
          />
          <span
            className={
              isUser
                ? isLightMode
                  ? 'text-[#5f6780]'
                  : 'text-white/[0.54]'
                : isLightMode
                  ? 'text-[#6b7387]'
                  : 'text-white/[0.42]'
            }
          >
            {isUser ? 'User' : 'Agent'}
          </span>
        </div>
        {title ? (
          <p className="mt-2 text-[0.92rem] font-medium text-current sm:text-sm">
            {title}
          </p>
        ) : null}
        <p
          className={`mt-2 whitespace-pre-line break-all text-[0.92rem] leading-5 [overflow-wrap:anywhere] sm:text-sm sm:leading-6 ${
            isUser
              ? isLightMode
                ? 'text-[#171b24]'
                : 'text-white'
              : tone === 'warning'
                ? isLightMode
                  ? 'text-[#5f4307]'
                  : 'text-amber-50'
              : tone === 'success'
                ? isLightMode
                  ? 'text-[#17573f]'
                  : 'text-emerald-50'
                : isLightMode
                  ? 'text-[#2f3747]'
                  : 'text-white/[0.78]'
          }`}
          style={{
            fontFamily:
              tone === 'success'
                ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                : 'var(--font-space-grotesk)',
          }}
        >
          {displayedBody}
          {!isUser && isStreaming ? (
            <span className="ml-0.5 inline-block h-[1.05em] w-px align-[-0.16em] bg-current opacity-70 motion-safe:animate-pulse" />
          ) : null}
        </p>
      </div>
    </div>
  );
}

function inferIntent(prompt: string) {
  const normalized = prompt.toLowerCase();

  if (normalized.includes('rebalance')) {
    return 'Rebalance';
  }

  if (normalized.includes('claim')) {
    return 'Claim';
  }

  if (normalized.includes('swap')) {
    return 'Swap';
  }

  if (normalized.includes('send')) {
    return 'Send';
  }

  if (normalized.includes('stake')) {
    return 'Stake';
  }

  if (normalized.includes('bridge')) {
    return 'Bridge';
  }

  return 'Execute';
}

function createMockHash(prompt: string) {
  const digest = sha256(
    new TextEncoder().encode(`${prompt}:${Date.now().toString(16)}`)
  );

  return `0x${toHex(digest).slice(0, 64)}`;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function withArticle(word: string) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}
