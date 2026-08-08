'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { getTokenBalances } from '@/services/dex-swap';
import type { Address } from 'viem';
import { AGENT_CREDITS_STATS } from '@/config/agent-credits';
import { useTheme } from '@/contexts/ThemeContext';
import TransactionAuthModal from '@/components/TransactionAuthModal';
import {
  confirmAgentAction,
  getStoredAgentConversation,
  getStoredAgentConversations,
  sendAgentMessage,
  type StoredConversationDetail,
  submitClientToolResult,
  sweepAgentSandbox,
} from '@/services/ai';
import { fetchDapps } from '@/services/dapps';
import { getInviteCode, getInvitees, getStats } from '@/services/referral';
import { executeSwap } from '@/services/dex-swap';
import { sendTransaction } from '@/wallet/chain';

// ─── Types ─────────────────────────────────────────────────────────────────

type Model = 'gpt-5.1' | 'gpt-4o-mini';

/** Display message shown in the chat UI */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  isError?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  sandboxKey?: string;     // 64-char hex, no 0x prefix
  sandboxAddress?: string; // 0x address
}

/** State while waiting for the user to confirm a destructive tool */
interface PendingConfirmation {
  convId: string;
  toolUseId?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  executionMode?: 'backend_sandbox' | 'client_wallet';
}

type SettingsTab = 'credits' | 'tasks' | 'payments' | 'telegram';

interface InviteFriend {
  wallet: string;
  joinedAt: string;
  reward: number;
  status: 'Active';
}

type AssetMentionSymbol = 'MON' | 'USDC' | 'LAM' | 'USDT';
type DAppMentionName = string;

const MODEL_OPTIONS: { value: Model; label: string }[] = [
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-4o-mini', label: 'GPT-4o-mini' },
];

const STORAGE_KEY = 'injpass_agent_conversations';
const SANDBOX_MODE_KEY = 'injpass_sandbox_mode';

const TOKEN_ICONS: Record<string, string> = {
  MON: '/injswap.png',
  USDT: '/USDT_Logo.png',
  USDC: '/USDC_Logo.png',
};

interface DAppMentionMeta {
  prompt: string;
  label: string;
  themeKey?: string;
}

const DAPP_TONE_PRESETS: Record<string, { light: string; dark: string }> = {
  violet: {
    light: 'border-violet-200/90 bg-violet-500/10 text-violet-700',
    dark: 'border-violet-400/30 bg-violet-500/12 text-violet-200',
  },
  sky: {
    light: 'border-sky-200/90 bg-sky-500/10 text-sky-700',
    dark: 'border-sky-400/30 bg-sky-500/12 text-sky-200',
  },
  emerald: {
    light: 'border-emerald-200/90 bg-emerald-500/10 text-emerald-700',
    dark: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200',
  },
  amber: {
    light: 'border-amber-200/90 bg-amber-500/10 text-amber-700',
    dark: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
  },
  cyan: {
    light: 'border-cyan-200/90 bg-cyan-500/10 text-cyan-700',
    dark: 'border-cyan-400/30 bg-cyan-500/12 text-cyan-200',
  },
  fuchsia: {
    light: 'border-fuchsia-200/90 bg-fuchsia-500/10 text-fuchsia-700',
    dark: 'border-fuchsia-400/30 bg-fuchsia-500/12 text-fuchsia-200',
  },
};

const DAPP_TONE_KEYS = Object.keys(DAPP_TONE_PRESETS);

// ─── Helpers ───────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function privateKeyToHex(privateKey: Uint8Array): `0x${string}` {
  return `0x${Array.from(privateKey)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`;
}

function formatWalletLabel(walletAddress: string | null, walletName: string | null): string {
  if (walletName) return walletName;
  if (!walletAddress) return 'Unknown wallet';
  return `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`;
}

function formatJoinedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 10);
}

function normalizeAssetMentionSymbol(symbol?: string): AssetMentionSymbol | null {
  if (!symbol) return null;
  if (symbol === 'NINJA') return 'LAM';
  if (symbol === 'MON' || symbol === 'USDC' || symbol === 'LAM' || symbol === 'USDT') {
    return symbol;
  }
  return null;
}

function normalizeDAppMentionName(name?: string | null): string | null {
  const normalized = (name ?? '').trim();
  return normalized ? normalized : null;
}

function normalizeDAppMentionPrompt(prompt?: string | null): string | null {
  const normalized = normalizeDAppMentionName(prompt);
  if (!normalized) return null;
  const plain = normalized.startsWith('@') ? normalized.slice(1) : normalized;
  const compact = plain.replace(/\s+/g, '');
  return compact ? `@${compact}` : null;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDAppTone(themeKey: string | undefined, name: string, isLight: boolean): string {
  const normalizedThemeKey = themeKey?.trim().toLowerCase();
  const fallbackKey = DAPP_TONE_KEYS[hashString(name.toLowerCase()) % DAPP_TONE_KEYS.length] ?? 'violet';
  const key = normalizedThemeKey && DAPP_TONE_PRESETS[normalizedThemeKey] ? normalizedThemeKey : fallbackKey;
  const preset = DAPP_TONE_PRESETS[key] ?? DAPP_TONE_PRESETS.violet;
  return isLight ? preset.light : preset.dark;
}

function buildDAppMentionMeta(name: string): DAppMentionMeta {
  const cleanName = name.trim();
  const compact = cleanName.replace(/\s+/g, '');
  return {
    prompt: `@${compact}`,
    label: `@${cleanName}`,
  };
}

function getConversationStorageKey(walletAddress?: string | null): string {
  const normalized = walletAddress?.trim().toLowerCase();
  return normalized ? `${STORAGE_KEY}:${normalized}` : `${STORAGE_KEY}:anonymous`;
}

function loadConversations(walletAddress?: string | null): Conversation[] {
  try {
    const raw = localStorage.getItem(getConversationStorageKey(walletAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      messages: Array.isArray(c.messages) ? c.messages : [],
      sandboxKey: c.sandboxKey,
      sandboxAddress: c.sandboxAddress,
    }));
  } catch {
    return [];
  }
}

// ─── Sandbox helpers ────────────────────────────────────────────────────────

function loadSandboxModePreference(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(SANDBOX_MODE_KEY);
  return val === null || val === 'true'; // default: enabled
}

function saveConversations(
  convs: Conversation[],
  walletAddress?: string | null,
) {
  try {
    localStorage.setItem(
      getConversationStorageKey(walletAddress),
      JSON.stringify(convs),
    );
  } catch { /* storage full */ }
}

function restoreMessagesFromStoredConversation(
  detail: StoredConversationDetail,
): ChatMessage[] {
  const restored: ChatMessage[] = [];

  for (const message of detail.messages) {
    if (message.role === 'user') {
      const hasToolResult =
        Array.isArray(message.toolResult) && message.toolResult.length > 0;

      if (hasToolResult) {
        continue;
      }

      const text = typeof message.content === 'string' ? message.content.trim() : '';
      if (!text) {
        continue;
      }

      restored.push({
        id: `restored-user-${message.id}`,
        role: 'user',
        content: text,
      });
      continue;
    }

    if (message.role === 'assistant') {
      const raw = typeof message.content === 'string' ? message.content.trim() : '';
      if (!raw) {
        continue;
      }

      let assistantText = raw;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const textBlocks = parsed
            .filter((block) => block && typeof block === 'object' && block.type === 'text')
            .map((block) => String(block.text ?? '').trim())
            .filter(Boolean);
          assistantText = textBlocks.join('\n').trim();
        }
      } catch {
        assistantText = raw;
      }

      if (!assistantText) {
        continue;
      }

      restored.push({
        id: `restored-assistant-${message.id}`,
        role: 'assistant',
        content: assistantText,
      });
    }
  }

  return restored;
}

async function restoreConversationsFromBackend(
  walletAddress: string,
): Promise<Conversation[]> {
  const summaries = await getStoredAgentConversations();
  if (summaries.length === 0) {
    return [];
  }

  const details = await Promise.all(
    summaries.map((summary) => getStoredAgentConversation(summary.id)),
  );

  return details
    .filter((detail): detail is StoredConversationDetail => Boolean(detail))
    .map((detail) => ({
      id: detail.conversation.id,
      title: detail.conversation.title?.trim() || 'New chat',
      createdAt: new Date(detail.conversation.createdAt).getTime() || Date.now(),
      messages: restoreMessagesFromStoredConversation(detail),
      sandboxAddress: undefined,
      sandboxKey: undefined,
    }))
    .filter((conversation) => conversation.messages.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Hash Mahjong game logic (ported from hash-mahjong-two.vercel.app) ──────

const HM_TILE: Record<string, string> = {
  '0': '🀆', '1': '🀇', '2': '🀈', '3': '🀉', '4': '🀊',
  '5': '🀋', '6': '🀌', '7': '🀍', '8': '🀎', '9': '🀏',
  a: '🀐', b: '🀑', c: '🀒', d: '🀓', e: '🀄', f: '🀅',
};
const HM_GAME_ADDRESS = '0x6cd6592b7d2a9b1e59aa60a6138434d2fe4cd062';
const HM_PLAY_COST    = '0.000001'; // INJ per round

interface HMRule { id: number; name: string; payout: string }

function hmCounts(s: string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of s) m[c] = (m[c] || 0) + 1;
  return m;
}
function hmPairs(c: Record<string, number>)   { return Object.values(c).filter(v => v === 2).length; }
function hmTriples(c: Record<string, number>) { return Object.values(c).filter(v => v === 3).length; }
function hmHasAtLeast(c: Record<string, number>, n: number) { return Object.values(c).some(v => v >= n); }
function hmHasExact(c: Record<string, number>, n: number)   { return Object.values(c).some(v => v === n); }
function hmCountExact(c: Record<string, number>, n: number) { return Object.values(c).filter(v => v === n).length; }
function hmHexVal(ch: string) { const v = parseInt(ch, 16); return Number.isFinite(v) ? v : null; }
function hmStraight(s: string, len: number) {
  const a = s.split('').map(hmHexVal);
  for (let i = 0; i <= a.length - len; i++) {
    let asc = true, desc = true;
    for (let j = 1; j < len; j++) {
      if (a[i+j] !== (a[i] as number) + j) asc = false;
      if (a[i+j] !== (a[i] as number) - j) desc = false;
    }
    if (asc || desc) return true;
  }
  return false;
}
function hmDouble4(s: string) {
  const a = s.split('').map(hmHexVal), runs: [number,number][] = [];
  for (let i = 0; i <= 6; i++) {
    let asc = true, desc = true;
    for (let j = 1; j < 4; j++) {
      if (a[i+j] !== (a[i] as number)+j) asc = false;
      if (a[i+j] !== (a[i] as number)-j) desc = false;
    }
    if (asc || desc) runs.push([i, i+3]);
  }
  for (let x = 0; x < runs.length; x++)
    for (let y = x+1; y < runs.length; y++)
      if (runs[x][1] < runs[y][0] || runs[y][1] < runs[x][0]) return true;
  return false;
}

const HM_RULES: { id: number; name: string; payout: string; test: (s: string, c: Record<string,number>) => boolean }[] = [
  { id: 1,  name: 'Tenfold Harmony',   payout: '10000x', test: (_, c) => hmHasAtLeast(c, 10) },
  { id: 2,  name: 'Ninefold Harmony',  payout: '2000x',  test: (_, c) => hmHasAtLeast(c, 9)  },
  { id: 3,  name: 'Eightfold Harmony', payout: '500x',   test: (_, c) => hmHasAtLeast(c, 8)  },
  { id: 4,  name: 'Sevenfold Harmony', payout: '200x',   test: (_, c) => hmHasAtLeast(c, 7)  },
  { id: 5,  name: 'Sixfold Harmony',   payout: '80x',    test: (_, c) => hmHasAtLeast(c, 6)  },
  { id: 6,  name: 'Fivefold Harmony',  payout: '30x',    test: (_, c) => hmHasAtLeast(c, 5)  },
  { id: 7,  name: 'Double Quads',      payout: '200x',   test: (_, c) => hmCountExact(c, 4) >= 2 },
  { id: 8,  name: 'Quad + Triple',     payout: '120x',   test: (_, c) => hmHasExact(c, 4) && hmHasExact(c, 3) },
  { id: 9,  name: 'Three Triples',     payout: '90x',    test: (_, c) => hmTriples(c) >= 3   },
  { id: 10, name: 'Two Triples',       payout: '35x',    test: (_, c) => hmTriples(c) >= 2   },
  { id: 11, name: 'Five Pairs',        payout: '25x',    test: (_, c) => hmPairs(c) === 5 && Object.keys(c).length === 5 },
  { id: 12, name: 'Four Pairs',        payout: '10x',    test: (_, c) => hmPairs(c) === 4    },
  { id: 13, name: 'Full House',        payout: '20x',    test: (_, c) => hmTriples(c) >= 1 && hmPairs(c) >= 1 },
  { id: 14, name: 'Any Triple',        payout: '5x',     test: (_, c) => hmTriples(c) >= 1   },
  { id: 15, name: 'Straight-5',        payout: '15x',    test: (s)    => hmStraight(s, 5)    },
  { id: 16, name: 'Double Straight-4', payout: '30x',    test: (s)    => hmDouble4(s)        },
  { id: 17, name: 'Palindrome',        payout: '50x',    test: (s)    => s === s.split('').reverse().join('') },
  { id: 18, name: 'Alternating AB',    payout: '40x',    test: (s)    => s.length === 10 && s[0] !== s[1] && [...s].every((c,i) => c === s[i%2===0?0:1]) },
];

function hmEvaluate(seed10: string): HMRule | null {
  const c = hmCounts(seed10);
  for (const r of HM_RULES) if (r.test(seed10, c)) return { id: r.id, name: r.name, payout: r.payout };
  return null;
}

function hmPlayResult(txHash: string) {
  const seed10 = txHash.replace(/^0x/i, '').slice(-10).toLowerCase();
  const tiles   = seed10.split('').map(h => HM_TILE[h] ?? '?').join('');
  const rule    = hmEvaluate(seed10);
  return { seed10, tiles, win: !!rule, rule };
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function AgentsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { isUnlocked, address, isCheckingSession, privateKey, resetTxAuth } = useWallet();

  const [isEmbedded] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1'
  );
  const [isCompactEmbedded] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('compact') === '1'
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [assetMentions, setAssetMentions] = useState<AssetMentionSymbol[]>([]);
  const [dappMentions, setDappMentions] = useState<DAppMentionName[]>([]);
  const [dappMentionMetaMap, setDappMentionMetaMap] = useState<Record<string, DAppMentionMeta>>({});
  const [isAssetDropActive, setIsAssetDropActive] = useState(false);
  const [model, setModel] = useState<Model>('gpt-5.1');
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showAgentAuthModal, setShowAgentAuthModal] = useState(false);
  const [postAgentAuthAction, setPostAgentAuthAction] = useState<'send' | 'swap' | null>(null);
  const [showInviteManager, setShowInviteManager] = useState(false);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [sandboxModeEnabled, setSandboxModeEnabled] = useState<boolean>(() => loadSandboxModePreference());

  const navigateApp = useCallback((path: string) => {
    if (typeof window !== 'undefined' && isEmbedded && window.top) {
      window.top.location.assign(path);
      return;
    }

    router.push(path);
  }, [isEmbedded, router]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('credits');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [liveInviteCode, setLiveInviteCode] = useState('');
  const [invitedByCode, setInvitedByCode] = useState<string | null>(null);
  const [invitedFriends, setInvitedFriends] = useState<InviteFriend[]>([]);
  const [totalRewards, setTotalRewards] = useState(0);

  // Sandbox
  const [sandboxBalances, setSandboxBalances] = useState<{ MON: string; USDT: string; USDC: string } | null>(null);
  const [harvestLoading, setHarvestLoading] = useState(false);
  const [showSandboxPanel, setShowSandboxPanel] = useState(false);
  const [showSandboxKey, setShowSandboxKey] = useState(false);
  const [conversationStorageReady, setConversationStorageReady] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirmPrimaryButtonRef = useRef<HTMLButtonElement>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConv?.messages ?? [];
  const inviteCode = liveInviteCode || '';
  const inviteLink = inviteCode ? `https://injpass.com/welcome?invite=${inviteCode}` : 'https://injpass.com/welcome';
  const totalInviteCredits = totalRewards;
  const activeInviteCount = invitedFriends.length;
  const isLight = theme === 'light';
  const isCompactStage = isCompactEmbedded && isEmbedded;
  const hasEmbeddedAgentAccess = isEmbedded ? !!address : isUnlocked && !!address;
  const assetMentionTone: Record<AssetMentionSymbol, string> = isLight
    ? {
        MON: 'border-violet-200/90 bg-violet-500/10 text-violet-700',
        USDC: 'border-sky-200/90 bg-sky-500/10 text-sky-700',
        LAM: 'border-amber-200/90 bg-amber-500/10 text-amber-700',
        USDT: 'border-emerald-200/90 bg-emerald-500/10 text-emerald-700',
      }
    : {
        MON: 'border-violet-400/30 bg-violet-500/12 text-violet-200',
        USDC: 'border-sky-400/30 bg-sky-500/12 text-sky-200',
        LAM: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
        USDT: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200',
      };
  const getMentionMeta = useCallback((name: string): DAppMentionMeta => {
    return dappMentionMetaMap[name] ?? buildDAppMentionMeta(name);
  }, [dappMentionMetaMap]);
  const rootShellClass = `overflow-hidden ${isLight ? 'text-slate-900' : 'text-white'} ${
    isCompactStage
      ? 'relative h-full min-h-0 bg-transparent p-0'
      : isEmbedded
      ? isLight
        ? 'grid h-full min-h-0 gap-4 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_36%),linear-gradient(180deg,#f8fbff,#eef4ff)] p-3 md:p-4 xl:grid-cols-[310px_minmax(0,1fr)]'
        : 'grid h-full min-h-0 gap-4 bg-[#060b14] p-3 md:p-4 xl:grid-cols-[310px_minmax(0,1fr)]'
      : isLight
        ? 'flex h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,#f8fbff,#eef4ff)]'
        : 'flex h-screen bg-black'
  }`;
  const sidebarShellClass = isCompactEmbedded && isEmbedded
    ? `${isLight
      ? 'absolute inset-y-3 left-3 z-30 w-[290px] rounded-[1.75rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,246,255,0.94))] shadow-[0_20px_70px_rgba(148,163,184,0.2)] flex flex-col overflow-hidden'
      : 'absolute inset-y-3 left-3 z-30 w-[290px] rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,#0a101d,#090d16)] shadow-[0_20px_70px_rgba(0,0,0,0.28)] flex flex-col overflow-hidden'
    } transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-[115%]'}`
    : isEmbedded
    ? isLight
      ? 'min-h-0 h-full rounded-[1.75rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,246,255,0.92))] shadow-[0_20px_70px_rgba(148,163,184,0.18)] flex flex-col overflow-hidden'
      : 'min-h-0 h-full rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,#0a101d,#090d16)] shadow-[0_20px_70px_rgba(0,0,0,0.24)] flex flex-col overflow-hidden'
    : `fixed md:relative z-30 md:z-auto top-0 left-0 h-full w-72 flex-shrink-0 ${
        isLight
          ? 'bg-white/88 border-r border-slate-200/80 backdrop-blur-xl flex flex-col'
          : 'bg-[#0a0a0a] border-r border-white/10 flex flex-col'
      } transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`;
  const mainShellClass = `min-w-0 h-full relative overflow-hidden flex flex-col ${
    isCompactEmbedded && isEmbedded
      ? 'bg-transparent border-0 rounded-none shadow-none'
      : isEmbedded
      ? isLight
        ? 'rounded-[1.75rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(241,245,255,0.92))] shadow-[0_20px_70px_rgba(148,163,184,0.18)]'
        : 'rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,#090d17,#070b13)] shadow-[0_20px_70px_rgba(0,0,0,0.24)]'
      : 'flex-1'
  }`;
  const headerShellClass = `flex items-center gap-3 ${isCompactStage ? (isLight ? 'border-b border-slate-200/80' : 'border-b border-white/10') : `border-b ${isLight ? 'border-slate-200/80' : 'border-white/10'}`} flex-shrink-0 ${
    isCompactEmbedded && isEmbedded
      ? isLight
        ? 'px-3 py-3 bg-transparent sm:px-4'
        : 'px-3 py-3 bg-transparent sm:px-4'
      : isEmbedded
      ? isLight
        ? 'px-4 py-3 bg-white/70 sm:px-5 sm:py-4'
        : 'px-4 py-3 bg-white/[0.02] sm:px-5 sm:py-4'
      : isLight
        ? 'px-4 py-3 bg-white/72 backdrop-blur-xl'
        : 'px-4 py-3 bg-black/50 backdrop-blur-sm'
  }`;
  const compactModalClass = isLight
    ? 'bg-[linear-gradient(180deg,#ffffff,#f5f8ff)] border border-slate-200/80 rounded-2xl w-full max-w-sm shadow-[0_20px_60px_rgba(148,163,184,0.24)] overflow-hidden'
    : 'bg-[#111] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden';
  const inviteModalClass = isLight
    ? 'flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f6f9ff)] shadow-[0_24px_80px_rgba(148,163,184,0.24)]'
    : 'flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#090909] shadow-2xl';
  const settingsModalClass = isLight
    ? 'w-full max-w-5xl h-[88vh] rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f6f9ff)] shadow-[0_24px_80px_rgba(148,163,184,0.24)] overflow-hidden flex'
    : 'w-full max-w-5xl h-[88vh] rounded-3xl border border-white/15 bg-[#090909] shadow-2xl overflow-hidden flex';

  const copyInviteCode = useCallback(() => {
    navigator.clipboard.writeText(inviteCode);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1800);
  }, [inviteCode]);

  const copyInviteLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink);
    setInviteLinkCopied(true);
    window.setTimeout(() => setInviteLinkCopied(false), 1800);
  }, [inviteLink]);

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEmbedded && !isCheckingSession && !hasEmbeddedAgentAccess) {
      navigateApp('/welcome');
    }
  }, [hasEmbeddedAgentAccess, isCheckingSession, isEmbedded, navigateApp]);

  // ── Load persisted history per wallet ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadConversationState() {
      if (!address) {
        setConversations([]);
        setActiveId(null);
        setConversationStorageReady(false);
        return;
      }

      const saved = loadConversations(address);
      if (cancelled) return;

      if (saved.length > 0) {
        setConversations(saved);
        setActiveId(saved[0].id);
        setConversationStorageReady(true);
        return;
      }

      const restored = await restoreConversationsFromBackend(address);
      if (cancelled) return;

      setConversations(restored);
      setActiveId(restored.length > 0 ? restored[0].id : null);
      saveConversations(restored, address);
      setConversationStorageReady(true);
    }

    void loadConversationState();

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRunning]);

  useEffect(() => {
    let mounted = true;

    async function loadDAppMentionMeta() {
      const { dapps } = await fetchDapps();
      if (!mounted || dapps.length === 0) return;

      const next: Record<string, DAppMentionMeta> = {};
      for (const dapp of dapps) {
        const name = normalizeDAppMentionName(dapp.name);
        if (!name) continue;
        const base = buildDAppMentionMeta(name);
        const prompt = normalizeDAppMentionPrompt(dapp.mentionPrompt);
        const label = normalizeDAppMentionName(dapp.mentionLabel);
        const themeKey = normalizeDAppMentionName(dapp.mentionThemeKey);
        next[name] = {
          prompt: prompt ?? base.prompt,
          label: label ? (label.startsWith('@') ? label : `@${label}`) : base.label,
          themeKey: themeKey ?? undefined,
        };
      }

      setDappMentionMetaMap((current) => ({ ...next, ...current }));
    }

    void loadDAppMentionMeta();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleAssetMentionMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; symbol?: string; dapp?: string } | undefined;
      if (!data) return;
      const normalizedSymbol = normalizeAssetMentionSymbol(data.symbol);
      const normalizedDapp = normalizeDAppMentionName(data.dapp);
      if (data.type === 'injpass:add-asset-mention' && normalizedSymbol) {
        setAssetMentions((current) => current.includes(normalizedSymbol) ? current : [...current, normalizedSymbol]);
      }
      if (data.type === 'injpass:add-dapp-mention' && normalizedDapp) {
        setDappMentions((current) => current.includes(normalizedDapp) ? current : [...current, normalizedDapp]);
        setDappMentionMetaMap((current) => (
          current[normalizedDapp]
            ? current
            : { ...current, [normalizedDapp]: buildDAppMentionMeta(normalizedDapp) }
        ));
      }
      textareaRef.current?.focus();
    };

    window.addEventListener('message', handleAssetMentionMessage);
    return () => {
      window.removeEventListener('message', handleAssetMentionMessage);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  useEffect(() => {
    if (!conversationStorageReady || !address) {
      return;
    }

    saveConversations(conversations, address);
  }, [address, conversationStorageReady, conversations]);

  useEffect(() => {
    if (!showInviteManager) return;

    let mounted = true;

    async function loadReferralData() {
      const [code, stats, invitees] = await Promise.all([
        getInviteCode(),
        getStats(),
        getInvitees(),
      ]);

      if (!mounted) return;

      setLiveInviteCode(code || stats.inviteCode || '');
      setInvitedByCode(stats.invitedBy || null);
      setTotalRewards(Number(stats.totalRewards) || 0);
      setInvitedFriends(
        invitees.map((invitee) => ({
          wallet: formatWalletLabel(invitee.walletAddress, invitee.walletName),
          joinedAt: formatJoinedAt(invitee.joinedAt),
          reward: Number(invitee.reward) || 0,
          status: 'Active',
        })),
      );
    }

    void loadReferralData();

    return () => {
      mounted = false;
    };
  }, [showInviteManager]);

  // Close sandbox panel when switching conversations
  useEffect(() => { setShowSandboxPanel(false); setShowSandboxKey(false); }, [activeId]);

  // Poll sandbox wallet balance
  useEffect(() => {
    const sandboxAddr = activeConv?.sandboxAddress;
    if (!sandboxAddr || !sandboxModeEnabled) { setSandboxBalances(null); return; }
    let alive = true;
    async function refresh() {
      try {
        const bals = await getTokenBalances(['MON', 'USDT', 'USDC'], sandboxAddr as Address);
        if (alive) setSandboxBalances({ MON: bals.MON ?? '0', USDT: bals.USDT ?? '0', USDC: bals.USDC ?? '0' });
      } catch { /* silent */ }
    }
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { alive = false; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeConv?.sandboxAddress, sandboxModeEnabled]);

  // ─── Conversation management ────────────────────────────────────────────

  function newConversation() {
    const id = uid();
    const conv: Conversation = {
      id, title: 'New chat', createdAt: Date.now(), messages: [],
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(id);
    setSidebarOpen(false);
  }

  function setSandboxMode(nextValue: boolean) {
    setSandboxModeEnabled(nextValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SANDBOX_MODE_KEY, nextValue ? 'true' : 'false');
    }

    setPendingConfirm(null);
    setShowSandboxPanel(false);
    setShowSandboxKey(false);
    newConversation();
  }

  function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const remaining = conversations.filter((c) => c.id !== id);
      return remaining.length > 0 ? remaining[0].id : null;
    });
  }

  function updateConv(id: string, updater: (c: Conversation) => Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }

  function appendDisplay(convId: string, msg: ChatMessage) {
    updateConv(convId, (c) => ({ ...c, messages: [...c.messages, msg] }));
  }

  // ─── Sandbox harvest ─────────────────────────────────────────────────────

  async function harvestSandbox() {
    if (!activeId) return;
    setHarvestLoading(true);
    try {
      const result = await sweepAgentSandbox({ conversationId: activeId });
      if (!result.ok) {
        throw new Error(result.error || 'Sandbox sweep failed');
      }

      const transfers = result.result?.transfers ?? [];
      appendDisplay(activeId, {
        id: uid(),
        role: 'assistant',
        content: transfers.length > 0
          ? `Sweep complete — transferred ${transfers.map((item) => `${Number(item.amount).toFixed(item.symbol === 'MON' ? 4 : 2)} ${item.symbol}`).join(', ')} back to your main wallet.`
          : 'Nothing to sweep — the sandbox wallet balance is too low to cover gas fees or already empty.',
      });

      if (activeConv?.sandboxAddress) {
        const nb = await getTokenBalances(['MON', 'USDT', 'USDC'], activeConv.sandboxAddress as Address);
        setSandboxBalances({ MON: nb.MON ?? '0', USDT: nb.USDT ?? '0', USDC: nb.USDC ?? '0' });
      }
    } catch (err) {
      appendDisplay(activeId, {
        id: uid(),
        role: 'assistant',
        content: `❌ Sweep failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        isError: true,
      });
    } finally {
      setHarvestLoading(false);
      setShowSandboxPanel(false);
    }
  }

  // ─── Core agent loop ─────────────────────────────────────────────────────
  // Runs until the model returns a final text response with no more tool calls.
  // Destructive tools (swap, send) pause and wait for the confirmation modal.

  const runLoop = useCallback(async (convId: string, userText: string) => {
    setIsRunning(true);

    try {
      const result = await sendAgentMessage({
        conversationId: convId,
        message: userText,
        model,
        sandboxMode: sandboxModeEnabled,
      });

      if (!result.ok) {
        throw new Error(result.error || 'AI error');
      }

      if (result.sandboxAddress) {
        updateConv(convId, (current) => ({
          ...current,
          sandboxAddress: result.sandboxAddress ?? current.sandboxAddress,
        }));
      }

      for (const message of result.messages ?? []) {
        appendDisplay(convId, {
          id: uid(),
          role: message.role,
          content: message.content,
          isError: message.isError,
        });
      }

      if (result.pendingConfirmation) {
        setPendingConfirm({
          convId,
          toolUseId: result.pendingConfirmation.toolUseId,
          toolName: result.pendingConfirmation.toolName,
          toolInput: result.pendingConfirmation.toolInput,
          executionMode: result.pendingConfirmation.executionMode,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      appendDisplay(convId, { id: uid(), role: 'assistant', content: `❌ Error: ${msg}`, isError: true });
    } finally {
      setIsRunning(false);
    }
  }, [model, sandboxModeEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Confirm destructive tool ────────────────────────────────────────────

  async function executeClientWalletPendingAction(currentPending: PendingConfirmation) {
    if (!currentPending.toolUseId) {
      throw new Error('Missing client tool use id');
    }
    if (!privateKey || !address) {
      throw new Error('Unlock your main wallet first to sign this transaction.');
    }

    let resultPayload: Record<string, unknown>;
    if (currentPending.toolName === 'execute_swap') {
      const { fromToken, toToken, amount, slippage } = currentPending.toolInput as {
        fromToken: string;
        toToken: string;
        amount: string;
        slippage?: number;
      };
      const txHash = await executeSwap({
        fromToken,
        toToken,
        amountIn: amount,
        slippage: slippage ?? 0.5,
        userAddress: address as Address,
        privateKey: privateKeyToHex(privateKey),
      });
      resetTxAuth();
      resultPayload = {
        success: true,
        txHash,
        explorerUrl: `https://blockscout.injective.network/tx/${txHash}`,
      };
    } else if (currentPending.toolName === 'send_token') {
      const { toAddress, amount } = currentPending.toolInput as {
        toAddress: string;
        amount: string;
      };
      const txHash = await sendTransaction(privateKey, toAddress, amount);
      resetTxAuth();
      resultPayload = {
        success: true,
        txHash,
        explorerUrl: `https://blockscout.injective.network/tx/${txHash}`,
      };
    } else {
      throw new Error(`Unsupported client wallet action: ${currentPending.toolName}`);
    }

    const result = await submitClientToolResult({
      conversationId: currentPending.convId,
      toolUseId: currentPending.toolUseId,
      result: JSON.stringify(resultPayload),
    });

    if (!result.ok) {
      throw new Error(result.error || 'Client tool result submit failed');
    }

    for (const message of result.messages ?? []) {
      appendDisplay(currentPending.convId, {
        id: uid(),
        role: message.role,
        content: message.content,
        isError: message.isError,
      });
    }

    setPendingConfirm(result.pendingConfirmation ? {
      convId: currentPending.convId,
      toolUseId: result.pendingConfirmation.toolUseId,
      toolName: result.pendingConfirmation.toolName,
      toolInput: result.pendingConfirmation.toolInput,
      executionMode: result.pendingConfirmation.executionMode,
    } : null);
  }

  async function handleConfirm() {
    if (!pendingConfirm) return;
    setConfirmLoading(true);
    try {
      if (pendingConfirm.executionMode === 'client_wallet') {
        if (!privateKey || !address) {
          setShowAgentAuthModal(true);
          setPostAgentAuthAction(
            pendingConfirm.toolName === 'execute_swap' ? 'swap' : 'send',
          );
          return;
        }

        await executeClientWalletPendingAction(pendingConfirm);
        return;
      }

      const result = await confirmAgentAction({
        conversationId: pendingConfirm.convId,
        approve: true,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Confirmation failed');
      }

      if (result.sandboxAddress) {
        updateConv(pendingConfirm.convId, (current) => ({
          ...current,
          sandboxAddress: result.sandboxAddress ?? current.sandboxAddress,
        }));
      }

      for (const message of result.messages ?? []) {
        appendDisplay(pendingConfirm.convId, {
          id: uid(),
          role: message.role,
          content: message.content,
          isError: message.isError,
        });
      }

      setPendingConfirm(result.pendingConfirmation ? {
        convId: pendingConfirm.convId,
        toolUseId: result.pendingConfirmation.toolUseId,
        toolName: result.pendingConfirmation.toolName,
        toolInput: result.pendingConfirmation.toolInput,
        executionMode: result.pendingConfirmation.executionMode,
      } : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed';
      appendDisplay(pendingConfirm.convId, {
        id: uid(),
        role: 'assistant',
        content: `❌ Error: ${msg}`,
        isError: true,
      });
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleAgentAuthSuccess() {
    setShowAgentAuthModal(false);
  }

  useEffect(() => {
    if (!postAgentAuthAction || !pendingConfirm || !privateKey) {
      return;
    }

    const actionMatches =
      (postAgentAuthAction === 'swap' && pendingConfirm.toolName === 'execute_swap') ||
      (postAgentAuthAction === 'send' && pendingConfirm.toolName === 'send_token');

    if (!actionMatches) {
      setPostAgentAuthAction(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setConfirmLoading(true);
      try {
        await executeClientWalletPendingAction(pendingConfirm);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Confirmation failed';
          appendDisplay(pendingConfirm.convId, {
            id: uid(),
            role: 'assistant',
            content: `❌ Error: ${msg}`,
            isError: true,
          });
        }
      } finally {
        if (!cancelled) {
          setConfirmLoading(false);
          setPostAgentAuthAction(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pendingConfirm, postAgentAuthAction, privateKey]);

  useEffect(() => {
    if (!pendingConfirm || showAgentAuthModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.requestAnimationFrame(() => {
      confirmPrimaryButtonRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingConfirm, showAgentAuthModal]);

  async function handleCancel() {
    if (!pendingConfirm) return;
    setConfirmLoading(true);
    try {
      const result = await confirmAgentAction({
        conversationId: pendingConfirm.convId,
        approve: false,
      });

      for (const message of result.messages ?? []) {
        appendDisplay(pendingConfirm.convId, {
          id: uid(),
          role: message.role,
          content: message.content,
          isError: message.isError,
        });
      }
    } finally {
      setPendingConfirm(null);
      setConfirmLoading(false);
    }
  }

  // ─── Send message ────────────────────────────────────────────────────────

  async function handleSend() {
    const mentionText = [
      ...dappMentions.map((dapp) => getMentionMeta(dapp).prompt),
      ...assetMentions.map((symbol) => `$${symbol}`),
    ].join(' ');
    const text = [mentionText, input.trim()].filter(Boolean).join(' ').trim();
    if (!text || isRunning) return;
    setInput('');
    setAssetMentions([]);
    setDappMentions([]);

    let convId = activeId;
    if (!convId) {
      const id = uid();
      const conv: Conversation = { id, title: text.slice(0, 40), createdAt: Date.now(), messages: [] };
      setConversations((prev) => [conv, ...prev]);
      setActiveId(id);
      convId = id;
    } else if (messages.length === 0) {
      updateConv(convId, (c) => ({ ...c, title: text.slice(0, 40) }));
    }

    // Add user message
    appendDisplay(convId, { id: uid(), role: 'user', content: text });
    await runLoop(convId, text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleAssetDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const symbol = normalizeAssetMentionSymbol(event.dataTransfer.getData('application/x-injpass-asset'));
    const rawDapp = event.dataTransfer.getData('application/x-injpass-dapp');
    const plainText = event.dataTransfer.getData('text/plain');
    const plainTextDapp = plainText.startsWith('injpass-dapp:')
      ? plainText.slice('injpass-dapp:'.length)
      : '';
    const dapp = normalizeDAppMentionName(rawDapp || plainTextDapp);

    if (symbol) {
      setAssetMentions((current) => current.includes(symbol) ? current : [...current, symbol]);
    }

    if (dapp) {
      setDappMentions((current) => current.includes(dapp) ? current : [...current, dapp]);
      setDappMentionMetaMap((current) => (
        current[dapp]
          ? current
          : { ...current, [dapp]: buildDAppMentionMeta(dapp) }
      ));
    }

    setIsAssetDropActive(false);
    textareaRef.current?.focus();
  }

  function removeAssetMention(symbol: AssetMentionSymbol) {
    setAssetMentions((current) => current.filter((item) => item !== symbol));
    textareaRef.current?.focus();
  }

  function removeDAppMention(dapp: DAppMentionName) {
    setDappMentions((current) => current.filter((item) => item !== dapp));
    textareaRef.current?.focus();
  }

  // ─── Render helpers ──────────────────────────────────────────────────────

  function formatToolResult(name: string, raw: string): string {
    try {
      const parsed = JSON.parse(raw);
      return `🔧 **${name}**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
    } catch {
      return `🔧 **${name}**: ${raw}`;
    }
  }

  function renderMessageContent(content: string) {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCode = false;
    let codeLines: string[] = [];
    let keyIdx = 0;

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (!inCode) { inCode = true; codeLines = []; }
        else {
          elements.push(
            <pre key={keyIdx++} className="bg-white/5 border border-white/10 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-green-300 whitespace-pre-wrap break-all">
              {codeLines.join('\n')}
            </pre>
          );
          inCode = false;
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      elements.push(
        <p key={keyIdx++} className="mb-1 leading-relaxed break-all">
          {renderInline(line)}
        </p>
      );
    }
    return <div className="text-sm">{elements}</div>;
  }

  function renderInline(text: string): React.ReactNode {
    return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={i} className="bg-white/10 px-1 rounded text-xs font-mono text-blue-300 break-all">{part.slice(1, -1)}</code>;
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch)
        return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">{linkMatch[1]}</a>;
      return part;
    });
  }

  function toolConfirmLabel(name: string, input: Record<string, unknown>) {
    if (name === 'execute_swap') {
      const expected = input.expectedOutput
        ? ` → ~${Number(input.expectedOutput).toFixed(4)} ${input.toToken}`
        : ` → ${input.toToken}`;
      return `Swap ${input.amount} ${input.fromToken}${expected}`;
    }
    if (name === 'send_token') {
      const addr = String(input.toAddress);
      return `Send ${input.amount} MON to ${addr.slice(0, 10)}...${addr.slice(-6)}`;
    }
    if (name === 'play_hash_mahjong') return 'Play Hash Mahjong × 1 round (0.000001 MON)';
    if (name === 'play_hash_mahjong_multi') {
      const rounds = Math.min(Math.max(1, Number(input.rounds) || 5), 20);
      return `Play Hash Mahjong × ${rounds} rounds (${(rounds * 0.000001).toFixed(6)} MON total)`;
    }
    return name;
  }

  if (isCheckingSession) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-[linear-gradient(180deg,#f8fbff,#eef4ff)]' : 'bg-black'}`}>
        <div className={`w-8 h-8 border-2 rounded-full animate-spin ${isLight ? 'border-slate-300 border-t-slate-700' : 'border-white/20 border-t-white'}`} />
      </div>
    );
  }

  if (!hasEmbeddedAgentAccess) {
    if (isEmbedded) {
      return <div className={rootShellClass} />;
    }
    return null;
  }

  // ─── UI ─────────────────────────────────────────────────────────────────

  return (
    <div className={rootShellClass}>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (!isEmbedded || isCompactEmbedded) && (
        <div
          className={`${isCompactEmbedded ? 'absolute' : 'fixed'} inset-0 bg-black/60 z-20 md:hidden`}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {(!isEmbedded || isCompactEmbedded) && (
      <aside className={sidebarShellClass}>
        {isCompactStage ? (
          <div className={`flex items-center justify-between gap-3 px-4 py-4 ${isLight ? 'border-b border-slate-200/80' : 'border-b border-white/10'}`}>
            <div className="min-w-0">
              <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>History</div>
              <div className={`mt-1 text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Recent Chats</div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${isLight ? 'hover:bg-slate-900/[0.05]' : 'hover:bg-white/10'}`}
              title="Close history"
            >
              <svg className={`h-4 w-4 ${isLight ? 'text-slate-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className={`${isEmbedded ? 'p-5' : 'p-4'} border-b ${isLight ? 'border-slate-200/80' : 'border-white/10'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-sm">Agents</span>
                  {isEmbedded && (
                    <p className="mt-1 text-xs leading-5 text-gray-400">
                      Wallet copilots, conversations, and invite rewards in one workspace.
                    </p>
                  )}
                </div>
              </div>
              {!isEmbedded && (
                <button onClick={newConversation} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="New chat">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>

            {isEmbedded && (
              <button
                onClick={newConversation}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">New chat</p>
                    <p className="mt-1 text-xs text-gray-400">Start a fresh agent session inside this container.</p>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${isCompactStage ? 'scrollbar-hide px-2 py-2 space-y-1.5' : isEmbedded ? 'px-3 py-3 space-y-1.5' : 'py-2 space-y-0.5 px-2'}`}>
          {conversations.length === 0 ? (
            isCompactStage ? (
              <div className={`rounded-2xl border px-4 py-6 text-center ${isLight ? 'border-slate-200/80 bg-slate-900/[0.03]' : 'border-white/10 bg-white/[0.03]'}`}>
                <p className={`text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>No chat history yet</p>
              </div>
            ) : isEmbedded ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                <p className="text-sm font-medium text-white">No conversations yet</p>
                <p className="mt-2 text-xs leading-5 text-gray-400">Start a new agent thread to inspect balances, submit swaps, or review recent activity.</p>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-600 text-xs"><p>No conversations yet</p></div>
            )
          ) : conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center justify-between gap-2 px-3 py-3 rounded-2xl cursor-pointer transition-colors border ${
                conv.id === activeId
                  ? 'bg-white/10 border-white/15'
                  : 'border-transparent hover:bg-white/5 hover:border-white/10'
              }`}
              onClick={() => { setActiveId(conv.id); setSidebarOpen(false); }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-xs truncate text-gray-300">{conv.title}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all flex-shrink-0"
              >
                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {!isCompactStage && (
        <div className={`border-t ${isLight ? 'border-slate-200/80' : 'border-white/10'} space-y-3 ${isEmbedded ? `${isLight ? 'p-4 bg-slate-900/[0.03]' : 'p-4 bg-black/20'}` : 'p-4'}`}>
          <button
            onClick={() => { setShowInviteManager(true); setSidebarOpen(false); }}
            className="w-full rounded-2xl border border-white/15 bg-gradient-to-r from-white/[0.06] via-white/[0.03] to-transparent hover:from-white/[0.12] hover:via-white/[0.05] hover:to-white/[0.03] transition-all px-3 py-3 text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] leading-tight font-semibold text-white tracking-[-0.01em]">
                  Share AgentOS with Friends
                </p>
                <p className="text-[11px] mt-1 text-blue-200/90 font-medium tracking-wide">
                  Inviter +10 / Invitee +10 NINJA
                </p>
              </div>
              <div className="relative w-11 h-11 rounded-2xl border border-[#6e5dff]/30 bg-gradient-to-br from-[#4c3af9]/28 via-white/[0.08] to-transparent shadow-[0_0_28px_rgba(76,58,249,0.16)] group-hover:border-[#8b7bff]/55 group-hover:shadow-[0_0_34px_rgba(76,58,249,0.24)] transition-all flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.18),transparent_42%)] opacity-90" />
                <svg className="relative w-5.5 h-5.5 text-white/95 transition-transform group-hover:scale-105" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M8 9.5l7-2.5M8.4 10.7l6.2 4.1M15.2 8.5v4.8" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M17.2 7H20m0 0l-1.8-1.8M20 7l-1.8 1.8" />
                  <circle cx="6.5" cy="10" r="1.65" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="6.7" r="1.65" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="15.7" r="1.65" fill="currentColor" stroke="none" />
                </svg>
              </div>
            </div>
          </button>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="6" width="20" height="14" rx="2" strokeWidth={2} />
                  <path d="M2 10h20" strokeWidth={2} strokeLinecap="round" />
                  <circle cx="18" cy="15" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-mono text-gray-400 truncate">
                  {address?.slice(0, 8)}...{address?.slice(-6)}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-gray-500">Monad Testnet</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setShowAgentSettings(true); setSidebarOpen(false); }}
              className="w-8 h-8 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.14] transition-colors flex items-center justify-center flex-shrink-0"
              title="Agent settings"
            >
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l1.21.47a1 1 0 00.86 0l1.21-.47a1 1 0 011.35.936l.083 1.295a1 1 0 00.49.82l1.117.663a1 1 0 01.37 1.353l-.64 1.129a1 1 0 000 .98l.64 1.129a1 1 0 01-.37 1.353l-1.117.663a1 1 0 00-.49.82l-.083 1.295a1 1 0 01-1.35.936l-1.21-.47a1 1 0 00-.86 0l-1.21.47a1 1 0 01-1.35-.936l-.083-1.295a1 1 0 00-.49-.82l-1.117-.663a1 1 0 01-.37-1.353l.64-1.129a1 1 0 000-.98l-.64-1.129a1 1 0 01.37-1.353l1.117-.663a1 1 0 00.49-.82l.083-1.295z" />
                <circle cx="12" cy="12" r="3" strokeWidth={2} />
              </svg>
            </button>
          </div>
        </div>
        )}
      </aside>
      )}

      {/* Main chat area */}
      <div className={mainShellClass}>

        {/* Top bar */}
        <header className={headerShellClass}>
          {(!isEmbedded || isCompactEmbedded) && (
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${isCompactEmbedded ? '' : 'md:hidden'}`}
              title={isCompactStage ? 'Conversation history' : 'Open conversations'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isCompactStage ? (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h12" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h12" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 18h12" />
                    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
                  </>
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}
          {!isEmbedded && (
            <button onClick={() => navigateApp('/dashboard')} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {isEmbedded ? (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Agent Workspace</div>
                <div className={`mt-1 ${isCompactStage ? 'text-[13px]' : 'text-sm'} font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {activeConv?.title ?? 'New chat'}
                </div>
              </div>
              {isCompactStage ? (
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <div className={`rounded-xl border px-2.5 py-2 ${
                    isLight
                      ? 'border-slate-200/80 bg-slate-900/[0.03]'
                      : 'border-white/10 bg-white/5'
                  }`}>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as Model)}
                      className={`bg-transparent text-[11px] font-medium outline-none ${isLight ? 'text-slate-600' : 'text-gray-300'}`}
                    >
                      {MODEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className={isLight ? 'bg-white text-slate-900' : 'bg-black'}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={newConversation}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors ${
                      isLight
                        ? 'border-slate-200/80 bg-slate-900/[0.03] text-slate-700 hover:bg-slate-900/[0.06]'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    New chat
                  </button>
                </div>
              ) : (
                <button
                  onClick={newConversation}
                  className={`p-2 rounded-xl border transition-colors ${
                    isLight
                      ? 'border-slate-200/80 bg-slate-900/[0.03] hover:bg-slate-900/[0.06]'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <svg className={`w-5 h-5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex-1 text-center">
                <span className="font-semibold text-sm">{activeConv?.title ?? 'New chat'}</span>
              </div>
              <button onClick={newConversation} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </>
          )}
        </header>

        {/* Messages */}
          <div className={`min-h-0 flex-1 ${isCompactStage ? (messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto scrollbar-hide') : 'overflow-y-auto'} ${isCompactStage ? '' : isEmbedded ? (isLight ? 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.05),transparent_36%)]' : 'bg-transparent') : ''}`}>
          {messages.length === 0 ? (
            isCompactStage ? (
              <div className="flex h-full min-h-0 flex-col px-3 py-3 sm:px-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                        isLight
                          ? 'border-slate-200/80 bg-slate-900/[0.03] text-slate-500'
                          : 'border-white/10 bg-white/[0.04] text-gray-400'
                      }`}>
                        No conversations yet
                      </div>
                      <h2 className={`mt-3 text-[23px] font-bold tracking-tight sm:text-[25px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        <span className="lambda-gradient">AgentOS</span>
                      </h2>
                      <p className={`mt-2 max-w-xl text-[12px] leading-5 sm:text-[13px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        AI-powered wallet assistant for balances, swaps, transfers, and quick Monad checks.
                      </p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isLight ? 'border border-slate-200/80 bg-slate-900/[0.03]' : 'border border-white/10 bg-white/5'}`}>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                      </svg>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      'What is my wallet address?',
                      'Show my balances',
                      'Swap all MON to USDT',
                      'Show my recent transactions',
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                        className={`text-left rounded-[1rem] border px-3 py-2.5 text-[12px] leading-5 transition-colors ${
                          isLight
                            ? 'border-slate-200/80 bg-slate-900/[0.03] text-slate-600 hover:bg-slate-900/[0.05]'
                            : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
              </div>
            ) : isEmbedded ? (
              <div className="h-full p-5 md:p-6">
                <div className="grid h-full min-h-[420px] gap-4 xl:grid-cols-[minmax(0,1.12fr)_340px]">
                  <section className={`rounded-[1.75rem] border p-6 md:p-7 flex flex-col ${isLight ? 'border-slate-200/80 bg-white/78 shadow-[0_18px_50px_rgba(148,163,184,0.14)]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${isLight ? 'bg-slate-900/[0.03] border border-slate-200/80' : 'bg-white/5 border border-white/10'}`}>
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight"><span className="lambda-gradient">λ</span> Agent</h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-gray-400">
                      AI-powered wallet assistant. Ask it to check balances, swap tokens, send MON, or explain anything on Monad without leaving this dashboard stage.
                    </p>

                    <div className="mt-8 grid gap-3 md:grid-cols-2">
                      {[
                        'What is my wallet address?',
                        'Show my balances',
                        'Swap all MON to USDT',
                        'Show my recent transactions',
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                          className={`text-left px-4 py-4 rounded-2xl border text-sm transition-colors ${isLight ? 'bg-slate-900/[0.03] hover:bg-slate-900/[0.05] border-slate-200/80 text-slate-600' : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    <div className="mt-auto pt-8 text-xs text-gray-500">
                      AI can make mistakes. Always verify transactions before confirming.
                    </div>
                  </section>

                  <aside className={`rounded-[1.75rem] border p-5 md:p-6 flex flex-col ${isLight ? 'border-slate-200/80 bg-white/78 shadow-[0_18px_50px_rgba(148,163,184,0.14)]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Session</div>
                      <div className="mt-2 text-sm font-semibold text-white">{address?.slice(0, 8)}...{address?.slice(-6)}</div>
                      <div className="mt-1 text-xs text-gray-400">Monad Testnet</div>
                    </div>

                    <div className={`mt-6 rounded-2xl border p-4 ${isLight ? 'border-slate-200/80 bg-slate-900/[0.03]' : 'border-white/10 bg-black/20'}`}>
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Suggested Flow</div>
                      <div className="mt-3 space-y-3 text-sm text-gray-300">
                        <p>1. Start a new chat.</p>
                        <p>2. Ask the agent to inspect or simulate a wallet action.</p>
                        <p>3. Review the transaction before confirming.</p>
                      </div>
                    </div>

                    <button
                      onClick={() => { setShowInviteManager(true); setSidebarOpen(false); }}
                      className="mt-6 rounded-2xl border border-[#6e5dff]/25 bg-gradient-to-br from-[#4c3af9]/18 via-white/[0.04] to-transparent px-4 py-4 text-left transition-all hover:border-[#8b7bff]/40 hover:bg-[#4c3af9]/20"
                    >
                      <div className="text-sm font-semibold text-white">Share AgentOS with Friends</div>
                      <div className="mt-1 text-xs text-blue-200/80">Open the referral panel and track reward activations.</div>
                    </button>
                  </aside>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${isLight ? 'bg-slate-900/[0.03] border border-slate-200/80' : 'bg-white/5 border border-white/10'}`}>
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold mb-2"><span className="lambda-gradient">λ</span> Agent</h2>
                <p className="text-gray-400 text-sm max-w-sm mb-8">
                  AI-powered wallet assistant. Ask me to check balances, swap tokens, send MON, or explain anything on Monad.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm">
                  {[
                    'What is my wallet address?',
                    'Show my balances',
                    'Swap all MON to USDT',
                    'Show my recent transactions',
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${isLight ? 'bg-slate-900/[0.03] hover:bg-slate-900/[0.05] border-slate-200/80 text-slate-600' : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )
            ) : (
            <div className={`${isCompactStage ? 'mx-auto flex min-h-full max-w-none flex-col justify-end px-4 py-4' : `${isEmbedded ? 'max-w-4xl' : 'max-w-3xl'} mx-auto px-4 py-6`}`}>
              <div className={isCompactStage ? 'space-y-4' : 'space-y-6'}>
                {messages.filter((msg) => msg.role !== 'tool').map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${
                      msg.role === 'user' ? 'bg-white text-black' : 'bg-white/10'
                    }`}>
                      {msg.role === 'user' ? 'U' : <span className="lambda-gradient">λ</span>}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user' ? 'bg-white text-black rounded-tr-sm'
                      : msg.isError ? 'bg-red-500/10 border border-red-500/20 text-red-200 rounded-tl-sm'
                      : isLight ? 'bg-slate-900/[0.03] border border-slate-200/80 text-slate-700 rounded-tl-sm' : 'bg-white/5 border border-white/10 text-gray-100 rounded-tl-sm'
                    }`}>
                      {msg.role === 'user'
                        ? <p className="text-sm">{msg.content}</p>
                        : renderMessageContent(msg.content)
                      }
                    </div>
                  </div>
                ))}

                {isRunning && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                      <span className="lambda-gradient">λ</span>
                    </div>
                    <div className={`rounded-2xl rounded-tl-sm px-4 py-3 ${isLight ? 'bg-slate-900/[0.03] border border-slate-200/80' : 'bg-white/5 border border-white/10'}`}>
                      <div className="flex gap-1 items-center h-5">
                        {[0, 150, 300].map((d) => (
                          <div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* ── Confirmation modal ── */}
        {pendingConfirm && (
          <div
            className={`fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity sm:items-center ${
              showAgentAuthModal ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            aria-hidden={showAgentAuthModal}
          >
            <div
              className={compactModalClass}
              role="dialog"
              aria-modal="true"
              aria-labelledby="agent-confirm-title"
              tabIndex={-1}
            >
              <div className={`px-5 pt-5 pb-4 border-b ${isLight ? 'border-slate-200/80' : 'border-white/10'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 id="agent-confirm-title" className="font-bold text-sm">Confirm Transaction</h3>
                    <p className="text-xs text-gray-400">AI Agent is requesting approval</p>
                  </div>
                </div>
              </div>

              {/* Swap visual */}
              {pendingConfirm.toolName === 'execute_swap' && (() => {
                const { fromToken, toToken, amount, expectedOutput } = pendingConfirm.toolInput as {
                  fromToken: string; toToken: string; amount: string; expectedOutput?: string;
                };
                return (
                  <div className={`px-5 py-4 border-b ${isLight ? 'border-slate-200/80' : 'border-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
                        <div className="flex items-center justify-center mb-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={TOKEN_ICONS[fromToken] ?? ''} alt={fromToken} className="w-8 h-8 object-contain" />
                        </div>
                        <div className="text-base font-bold">{amount}</div>
                        <div className="text-xs text-gray-400">{fromToken}</div>
                      </div>
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </div>
                      <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
                        <div className="flex items-center justify-center mb-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={TOKEN_ICONS[toToken] ?? ''} alt={toToken} className="w-8 h-8 object-contain" />
                        </div>
                        <div className="text-base font-bold">
                          {expectedOutput ? `~${Number(expectedOutput).toFixed(4)}` : '…'}
                        </div>
                        <div className="text-xs text-gray-400">{toToken}</div>
                      </div>
                    </div>
                    {pendingConfirm.toolInput.slippage != null && (
                      <div className="mt-3 flex justify-between text-xs text-gray-500">
                        <span>Slippage</span><span>{String(pendingConfirm.toolInput.slippage)}%</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Send visual */}
              {pendingConfirm.toolName === 'send_token' && (() => {
                const { toAddress, amount } = pendingConfirm.toolInput as { toAddress: string; amount: string };
                return (
                  <div className={`px-5 py-4 border-b ${isLight ? 'border-slate-200/80' : 'border-white/10'}`}>
                    <div className="text-center mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/injswap.png" alt="MON" className="w-10 h-10 object-contain mx-auto mb-1" />
                      <div className="text-2xl font-bold">{amount} MON</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <div className="text-xs text-gray-400 mb-1">To address</div>
                      <div className="text-xs font-mono text-white break-all">{toAddress}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Hash Mahjong visual */}
              {(pendingConfirm.toolName === 'play_hash_mahjong' || pendingConfirm.toolName === 'play_hash_mahjong_multi') && (() => {
                const rounds = pendingConfirm.toolName === 'play_hash_mahjong'
                  ? 1
                  : Math.min(Math.max(1, Number(pendingConfirm.toolInput.rounds) || 5), 20);
                const totalCost = (rounds * 0.000001).toFixed(6);
                return (
                  <div className={`px-5 py-4 border-b ${isLight ? 'border-slate-200/80' : 'border-white/10'}`}>
                    <div className="text-center mb-3">
                      <div className="text-3xl mb-2">🀄</div>
                      <div className="text-lg font-bold">{rounds === 1 ? 'Hash Mahjong' : `Hash Mahjong × ${rounds} rounds`}</div>
                      <div className="text-sm text-gray-400 mt-1">Cost: {totalCost} MON</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-xs text-gray-400 text-center">
                      Tiles are derived from your on-chain tx hash. 18 win patterns supported.
                    </div>
                  </div>
                );
              })()}

              <div className="px-5 py-3">
                <div className="text-xs text-gray-400 mb-3">
                  {toolConfirmLabel(pendingConfirm.toolName, pendingConfirm.toolInput)}
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <p className="text-xs text-gray-400">Private key never leaves your device. Signed locally.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleCancel} disabled={confirmLoading} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-sm transition-colors">
                    Cancel
                  </button>
                  <button
                    ref={confirmPrimaryButtonRef}
                    onClick={handleConfirm}
                    disabled={confirmLoading}
                    className="flex-1 py-3 rounded-xl bg-white hover:bg-gray-100 text-black font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {confirmLoading && <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />}
                    {confirmLoading ? 'Processing…' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invite manager */}
        {showInviteManager && (
          <div
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm p-4 sm:p-6 lg:p-10 flex items-start justify-center overflow-y-auto"
            onClick={() => setShowInviteManager(false)}
          >
            <div
              className={inviteModalClass}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`px-6 sm:px-8 py-5 border-b flex items-center justify-between ${isLight ? 'border-slate-200/80' : 'border-white/10'}`}>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">Share AgentOS with Friends</h3>
                  <p className="text-sm text-gray-400 mt-1">Invite friends, track activations, and earn rewards.</p>
                </div>
                <button
                  onClick={() => setShowInviteManager(false)}
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid min-h-0 grid-cols-1 items-start gap-4 p-5 sm:p-6 lg:grid-cols-[340px_minmax(0,1fr)]">
                <section className="min-h-0">
                  <div className={`flex min-h-0 flex-col rounded-[1.8rem] border p-5 ${
                    isLight
                      ? 'border-violet-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,255,0.92))]'
                      : 'border-[#6e5dff]/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]'
                  }`}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-500">Invite Code</div>
                    <div className={`mt-3 rounded-2xl border px-4 py-4 font-mono text-xl font-semibold tracking-[0.16em] ${
                      isLight ? 'border-slate-200/80 bg-white text-slate-900' : 'border-white/10 bg-black/25 text-white'
                    }`}>
                      {inviteCode || '--------'}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      <button
                        onClick={copyInviteCode}
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                          isLight
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'bg-white text-black hover:bg-gray-100'
                        }`}
                        style={{
                          color: isLight ? '#ffffff' : '#111827',
                          WebkitTextFillColor: isLight ? '#ffffff' : '#111827',
                        }}
                      >
                        <span style={{ color: isLight ? '#ffffff' : '#111827', WebkitTextFillColor: isLight ? '#ffffff' : '#111827' }}>
                          {inviteCopied ? 'Copied' : 'Copy Code'}
                        </span>
                      </button>
                      <button
                        onClick={copyInviteLink}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                          isLight
                            ? 'border-slate-200/80 bg-white/80 text-slate-700 hover:bg-white'
                            : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        {inviteLinkCopied ? 'Link Copied' : 'Copy Link'}
                      </button>
                    </div>

                    <div className={`mt-3 rounded-2xl border px-4 py-3 ${
                      isLight ? 'border-slate-200/80 bg-white/80' : 'border-white/10 bg-black/20'
                    }`}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">Link</div>
                      <p className={`mt-2 break-all text-xs leading-5 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>{inviteLink}</p>
                    </div>
                    <div className="mt-4">
                      <div className={`rounded-[1.35rem] border px-4 py-4 ${
                        isLight ? 'border-slate-200/80 bg-white/82' : 'border-white/10 bg-white/[0.03]'
                      }`}>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Referral Route</p>
                        <p className={`mt-2 text-sm leading-6 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                          Share the code or the link. Both route into the same AgentOS referral flow.
                        </p>
                        <p className={`mt-2 text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                          Invited by: {invitedByCode || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={`flex min-h-0 flex-col rounded-[1.8rem] border overflow-hidden ${
                  isLight ? 'border-slate-200/80 bg-white/80' : 'border-white/10 bg-white/[0.03]'
                }`}>
                  <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${
                    isLight ? 'border-slate-200/80' : 'border-white/10'
                  }`}>
                    <div>
                      <h4 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Invited Friends</h4>
                      <p className="mt-1 text-xs text-gray-400">Activation status and reward totals.</p>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      isLight ? 'border-slate-200/80 bg-slate-900/[0.03] text-slate-500' : 'border-white/10 bg-white/[0.04] text-gray-300'
                    }`}>
                      {invitedFriends.length} total
                    </div>
                  </div>

                  <div className={`grid grid-cols-[132px_132px_minmax(0,1fr)] gap-3 px-5 py-4 ${
                    isLight ? 'border-b border-slate-200/80 bg-white/70' : 'border-b border-white/10 bg-black/10'
                  }`}>
                    <div className={`rounded-[1.1rem] border px-4 py-3 ${
                      isLight ? 'border-slate-200/80 bg-white/82' : 'border-white/10 bg-white/[0.03]'
                    }`}>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Invited</p>
                      <p className={`mt-1 text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{invitedFriends.length}</p>
                      <p className="mt-1 text-xs text-gray-400">{activeInviteCount} active</p>
                    </div>
                    <div className={`rounded-[1.1rem] border px-4 py-3 ${
                      isLight ? 'border-slate-200/80 bg-white/82' : 'border-white/10 bg-white/[0.03]'
                    }`}>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">NINJA</p>
                      <p className={`mt-1 text-2xl font-semibold ${isLight ? 'text-violet-700' : 'text-blue-300'}`}>{totalInviteCredits.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-gray-400">earned</p>
                    </div>
                    <div className={`rounded-[1.1rem] border px-4 py-3 ${
                      isLight ? 'border-slate-200/80 bg-slate-900/[0.03]' : 'border-white/10 bg-black/20'
                    }`}>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Referral Notes</p>
                      <p className={`mt-1 text-sm leading-6 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                        Rewards are credited on successful wallet registration with a valid invite code.
                      </p>
                    </div>
                  </div>

                  <div className={`grid grid-cols-[minmax(0,1.45fr)_132px_132px_90px] gap-3 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] ${
                    isLight ? 'border-b border-slate-200/80 text-slate-400' : 'border-b border-white/10 text-gray-500'
                  }`}>
                    <span>Wallet</span>
                    <span>Joined</span>
                    <span>Reward</span>
                    <span className="text-right">Status</span>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {invitedFriends.length === 0 ? (
                      <div className={`px-5 py-8 text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        No invited friends yet.
                      </div>
                    ) : invitedFriends.map((friend, index) => (
                      <div
                        key={`${friend.wallet}-${friend.joinedAt}`}
                        className={`grid grid-cols-[minmax(0,1.45fr)_132px_132px_90px] items-center gap-3 px-5 py-4 ${
                          index !== invitedFriends.length - 1
                            ? isLight ? 'border-b border-slate-200/80' : 'border-b border-white/10'
                            : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className={`truncate font-mono text-sm ${isLight ? 'text-slate-700' : 'text-gray-100'}`}>{friend.wallet}</div>
                        </div>

                        <div className="text-xs text-gray-400">{friend.joinedAt}</div>

                        <div className={`text-sm font-semibold ${friend.reward > 0 ? (isLight ? 'text-violet-700' : 'text-blue-300') : 'text-gray-400'}`}>
                          {friend.reward > 0 ? `+${friend.reward.toLocaleString()} NINJA` : 'No reward yet'}
                        </div>

                        <div className="text-right">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            isLight
                              ? 'border-emerald-400/35 bg-emerald-500/8 text-emerald-600'
                              : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                          }`}>
                            {friend.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agent settings */}
        {showAgentSettings && (
          <div
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm p-4 sm:p-6 lg:p-10 flex items-center justify-center"
            onClick={() => setShowAgentSettings(false)}
          >
            <div
              className={settingsModalClass}
              onClick={(e) => e.stopPropagation()}
            >
              <aside className={`w-[220px] border-r p-4 flex flex-col ${isLight ? 'border-slate-200/80 bg-slate-900/[0.03]' : 'border-white/10 bg-white/[0.02]'}`}>
                <div className="mb-5 px-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Settings</p>
                  <p className="text-sm font-semibold text-white mt-1">Agent Control Center</p>
                </div>
                {[
                  { key: 'credits' as SettingsTab, label: 'Passbits Balance' },
                  { key: 'tasks' as SettingsTab, label: 'Earn Passbits' },
                  { key: 'payments' as SettingsTab, label: 'AI Payments' },
                  { key: 'telegram' as SettingsTab, label: 'Telegram' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveSettingsTab(item.key)}
                    className={`text-left px-3 py-2.5 rounded-xl text-sm transition-colors mb-1 ${activeSettingsTab === item.key ? (isLight ? 'bg-[#4c3af9]/12 text-[#312e81] border border-[#8b7bff]/30' : 'bg-[#4c3af9]/25 text-white border border-[#6e5dff]/40') : (isLight ? 'text-slate-600 hover:bg-slate-900/[0.03] border border-transparent' : 'text-gray-300 hover:bg-white/5 border border-transparent')}`}
                  >
                    {item.label}
                  </button>
                ))}
                <div className="mt-auto pt-4">
                  <button
                    onClick={() => setShowAgentSettings(false)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </aside>

              <section className="flex-1 overflow-y-auto p-6 sm:p-8">
                {activeSettingsTab === 'credits' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">Passbits Balance</h3>
                      <p className="text-sm text-gray-400 mt-1">Track current Passbits and upcoming reward tiers.</p>
                    </div>
                    <div className="rounded-2xl border border-blue-400/25 bg-gradient-to-r from-[#4c3af9]/25 to-transparent p-6">
                      <p className="text-xs uppercase tracking-[0.2em] text-blue-200/80">Available</p>
                      <p className="mt-2 text-4xl font-bold">{AGENT_CREDITS_STATS.available.toLocaleString()}</p>
                      <p className="text-sm text-gray-300 mt-2">
                        {AGENT_CREDITS_STATS.unlockGap.toLocaleString()} Passbits to unlock {AGENT_CREDITS_STATS.unlockLabel}.
                      </p>
                      <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#4c3af9] to-blue-400" style={{ width: `${AGENT_CREDITS_STATS.unlockProgress}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { title: 'This Week', value: AGENT_CREDITS_STATS.weeklyDelta },
                        { title: 'Spent on AI', value: AGENT_CREDITS_STATS.spentOnAi },
                        { title: 'Referral Bonus', value: AGENT_CREDITS_STATS.referralBonus },
                      ].map((item) => (
                        <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs text-gray-400">{item.title}</p>
                          <p className="text-xl font-semibold mt-1">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSettingsTab === 'tasks' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">Tasks to Earn Passbits</h3>
                      <p className="text-sm text-gray-400 mt-1">Complete daily and growth tasks to increase Passbits.</p>
                    </div>
                    <div className="space-y-3">
                      {[
                        { title: 'Complete first on-chain swap', reward: '+300', action: 'Start' },
                        { title: 'Invite one activated friend', reward: '+1,000', action: 'View Invite' },
                        { title: 'Bind Telegram notification', reward: '+200', action: 'Configure' },
                      ].map((task) => (
                        <div key={task.title} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{task.title}</p>
                            <p className="text-xs text-blue-200 mt-1">{task.reward} Passbits</p>
                          </div>
                          <button className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-xs font-semibold hover:bg-white/10 transition-colors">
                            {task.action}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSettingsTab === 'payments' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">AI Virtual Payments</h3>
                      <p className="text-sm text-gray-400 mt-1">Configure spending guardrails for autonomous agent actions.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Daily Spend Limit</p>
                          <p className="text-xs text-gray-400 mt-1">Hard limit for all AI-triggered transactions.</p>
                        </div>
                        <span className="text-sm font-semibold text-blue-300">25 MON / day</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Auto-approve Micro Tx</p>
                          <p className="text-xs text-gray-400 mt-1">Skip confirmation for tx under 0.2 MON.</p>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[11px] border border-emerald-400/40 text-emerald-300 bg-emerald-500/10">Enabled</span>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Emergency Freeze</p>
                          <p className="text-xs text-gray-400 mt-1">Pause all AI spending immediately.</p>
                        </div>
                        <button className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/30 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-colors">
                          Freeze
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeSettingsTab === 'telegram' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">Telegram Integration</h3>
                      <p className="text-sm text-gray-400 mt-1">Configure notifications and bot commands for your agent wallet.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Binding Status</p>
                          <p className="text-xs text-gray-400 mt-1">@injpass_alert_bot not connected.</p>
                        </div>
                        <button className="px-3 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-gray-100 transition-colors">
                          Connect Telegram
                        </button>
                      </div>
                      <div className="h-px bg-white/10" />
                      <div className="space-y-2 text-xs text-gray-300">
                        <p>1. Open Telegram and search <span className="font-semibold text-white">@injpass_alert_bot</span></p>
                        <p>2. Send <span className="font-semibold text-white">/bind {inviteCode}</span> to verify wallet ownership</p>
                        <p>3. Enable alerts: tx confirmations, low Passbits, and AI payment events</p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className={`relative z-10 flex-shrink-0 border-t ${isLight ? 'border-slate-200/80' : 'border-white/10'} ${isCompactStage ? 'bg-transparent px-3 pt-5 pb-1.5' : isEmbedded ? (isLight ? 'bg-white/70 p-5' : 'bg-white/[0.02] p-5') : (isLight ? 'bg-white/72 backdrop-blur-xl p-4' : 'bg-black/80 backdrop-blur-sm p-4')}`}>
          <div className={`${isCompactStage ? 'max-w-none' : isEmbedded ? 'max-w-4xl' : 'max-w-3xl'} mx-auto`}>
            {isCompactStage && (
              <div className="mb-3.5 flex flex-wrap items-center justify-start gap-1.5">
                <button
                  type="button"
                  onClick={() => setSandboxMode(true)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    sandboxModeEnabled
                      ? isLight
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-emerald-400/30 bg-emerald-400/12 text-emerald-300'
                      : isLight
                        ? 'border-slate-200/80 bg-white/70 text-slate-500'
                        : 'border-white/10 bg-white/[0.04] text-gray-400'
                  }`}
                >
                  Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setSandboxMode(false)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    !sandboxModeEnabled
                      ? isLight
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-amber-400/30 bg-amber-400/12 text-amber-300'
                      : isLight
                        ? 'border-slate-200/80 bg-white/70 text-slate-500'
                        : 'border-white/10 bg-white/[0.04] text-gray-400'
                  }`}
                >
                  Main Wallet
                </button>
                <div className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                  isLight
                    ? 'border-slate-200/80 bg-white/70 text-slate-500'
                    : 'border-white/10 bg-white/[0.04] text-gray-300'
                }`}>
                  {address?.slice(0, 8)}...{address?.slice(-6)}
                </div>
                <div className={`rounded-full border px-2.5 py-1 text-[10px] ${
                  isLight
                    ? 'border-slate-200/80 bg-white/70 text-slate-500'
                    : 'border-white/10 bg-white/[0.04] text-gray-400'
                }`}>
                  Monad Testnet
                </div>
                <button
                  onClick={() => { setShowInviteManager(true); setSidebarOpen(false); }}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all ${
                    isLight
                      ? 'border-violet-200/90 bg-[linear-gradient(135deg,rgba(139,92,246,0.10),rgba(59,130,246,0.06))] text-violet-700 hover:border-violet-300 hover:bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(59,130,246,0.10))]'
                      : 'border-[#6e5dff]/25 bg-gradient-to-r from-[#4c3af9]/18 via-white/[0.04] to-transparent text-white hover:border-[#8b7bff]/40 hover:bg-[#4c3af9]/20'
                  }`}
                  disabled={true}
                >
                  Invite
                </button>
                {activeConv?.sandboxAddress && (
                  <button
                    onClick={() => setShowSandboxPanel((p) => !p)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      sandboxModeEnabled
                        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20'
                        : 'border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                    }`}
                  >
                    {sandboxModeEnabled ? 'Sandbox' : 'Main Wallet'} · {activeConv.sandboxAddress.slice(0, 8)}…{activeConv.sandboxAddress.slice(-6)}
                  </button>
                )}
              </div>
            )}

            {/* Sandbox / takeover address badge — click to flip card */}
            {activeConv?.sandboxAddress && !isCompactStage && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <button
                  onClick={() => setShowSandboxPanel(p => !p)}
                  className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors ${
                    sandboxModeEnabled
                      ? 'text-emerald-400/90 bg-emerald-400/10 border border-emerald-400/25 hover:bg-emerald-400/20'
                      : 'text-amber-400/90 bg-amber-400/10 border border-amber-400/25 hover:bg-amber-400/20'
                  }`}
                >
                  {sandboxModeEnabled ? 'Sandbox' : 'Main Wallet'} · {activeConv.sandboxAddress.slice(0, 10)}…{activeConv.sandboxAddress.slice(-6)}
                </button>
              </div>
            )}

            {/* Flip card: front = input, back = balance panel (flips top-to-bottom) */}
            <div style={{ perspective: '900px' }}>
              <div
                style={{
                  transformStyle: 'preserve-3d',
                  transform: showSandboxPanel ? 'rotateX(180deg)' : 'rotateX(0deg)',
                  transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                }}
              >
                {/* ── Front face: normal input bar ── */}
                <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as React.CSSProperties}>
                  <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 px-1 ${isCompactStage ? 'hidden' : ''}`}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSandboxMode(true)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                          sandboxModeEnabled
                            ? isLight
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-emerald-400/30 bg-emerald-400/12 text-emerald-300'
                            : isLight
                              ? 'border-slate-200/80 bg-white/80 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                              : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
                        }`}
                      >
                        Sandbox Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setSandboxMode(false)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                          !sandboxModeEnabled
                            ? isLight
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-amber-400/30 bg-amber-400/12 text-amber-300'
                            : isLight
                              ? 'border-slate-200/80 bg-white/80 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                              : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
                        }`}
                      >
                        Main Wallet Mode
                      </button>
                    </div>
                    <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                      Mode switch starts a new chat so signing behavior matches the session.
                    </div>
                  </div>
                  <div
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes('application/x-injpass-asset') ||
                        event.dataTransfer.types.includes('application/x-injpass-dapp') ||
                        event.dataTransfer.types.includes('text/plain')
                      ) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                        setIsAssetDropActive(true);
                      }
                    }}
                    onDragLeave={() => setIsAssetDropActive(false)}
                    onDrop={handleAssetDrop}
                    className={`rounded-2xl transition-all ${isLight ? 'bg-white/84 border border-slate-200/80 focus-within:border-slate-300 shadow-sm' : 'bg-white/5 border border-white/15 focus-within:border-white/30'} ${
                      isAssetDropActive
                        ? isLight
                          ? 'border-violet-300 bg-violet-50/80 shadow-[0_0_0_1px_rgba(167,139,250,0.35)]'
                          : 'border-violet-400/45 bg-violet-500/10 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]'
                        : ''
                    }`}
                  >
                    <div className={`flex items-end gap-3 ${isCompactStage ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
                      {!isCompactStage && (
                        <>
                          <select
                            value={model}
                            onChange={(e) => setModel(e.target.value as Model)}
                            className={`bg-transparent text-xs border-none outline-none cursor-pointer transition-colors py-1 pr-1 flex-shrink-0 ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-gray-400 hover:text-white'}`}
                          >
                            {MODEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value} className={isLight ? 'bg-white text-slate-900' : 'bg-black'}>{opt.label}</option>
                            ))}
                          </select>
                          <div className={`w-px h-5 flex-shrink-0 self-center ${isLight ? 'bg-slate-200/80' : 'bg-white/15'}`} />
                        </>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
                          {dappMentions.map((dapp) => {
                            const mention = getMentionMeta(dapp);
                            const tone = getDAppTone(mention.themeKey, dapp, isLight);
                            return (
                              <button
                                key={dapp}
                                type="button"
                                onClick={() => removeDAppMention(dapp)}
                                className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all ${tone}`}
                                title={`Remove ${mention.label}`}
                              >
                                <span>{mention.label}</span>
                                <svg className="h-3 w-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            );
                          })}
                          {assetMentions.map((symbol) => (
                            <button
                              key={symbol}
                              type="button"
                              onClick={() => removeAssetMention(symbol)}
                              className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all ${assetMentionTone[symbol]}`}
                              title={`Remove $${symbol}`}
                            >
                              <span>${symbol}</span>
                              <svg className="h-3 w-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ))}
                          <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isAssetDropActive ? 'Drop asset or dApp here to mention it…' : 'Ask anything about your wallet…'}
                            rows={1}
                            wrap="off"
                            disabled={isRunning || !!pendingConfirm}
                            className={`min-w-[180px] flex-1 bg-transparent text-sm resize-none overflow-x-auto overflow-y-hidden whitespace-nowrap outline-none min-h-[24px] max-h-[24px] py-0 disabled:opacity-50 scrollbar-hide ${isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-white placeholder-gray-500'}`}
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleSend}
                        disabled={(!input.trim() && assetMentions.length === 0 && dappMentions.length === 0) || isRunning || !!pendingConfirm}
                        className="w-8 h-8 rounded-xl bg-white hover:bg-gray-100 disabled:bg-white/20 disabled:cursor-not-allowed text-black flex items-center justify-center transition-all flex-shrink-0 self-end"
                      >
                        {isRunning
                          ? <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" /></svg>
                        }
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Back face: sandbox balance panel ── */}
                <div
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateX(180deg)',
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                  } as React.CSSProperties}
                >
                  <div className={`flex flex-col justify-center gap-2 rounded-2xl px-4 py-3 h-full ${isLight ? 'bg-white/84 border border-slate-200/80 shadow-sm' : 'bg-white/5 border border-white/15'}`}>
                    {/* Row 1: balances + action buttons */}
                    <div className="flex items-center gap-4">
                      {/* Balances */}
                      <div className="flex-1 flex items-center gap-5">
                        {sandboxBalances ? (
                          ['MON', 'USDT', 'USDC'].map(sym => {
                            const raw = sandboxBalances[sym as keyof typeof sandboxBalances] ?? '0';
                            const val = parseFloat(raw);
                            return (
                              <div key={sym} className="text-xs">
                                <span className="text-gray-500 mr-1">{sym}</span>
                                <span className={val > 0 ? 'text-white font-bold' : 'text-gray-600'}>
                                  {sym === 'MON' ? val.toFixed(4) : val.toFixed(2)}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-xs text-gray-600">Loading…</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {activeConv?.sandboxKey && (
                          <button
                            onClick={() => setShowSandboxKey(p => !p)}
                            title={showSandboxKey ? 'Hide private key' : 'Show private key'}
                            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
                              showSandboxKey
                                ? 'bg-white/15 border-white/30'
                                : 'bg-white/5 hover:bg-white/10 border-white/10'
                            }`}
                          >
                            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                            </svg>
                          </button>
                        )}
                        {/* Sweep / withdraw */}
                        <button
                          onClick={() => !harvestLoading && harvestSandbox()}
                          disabled={harvestLoading || !activeConv?.sandboxAddress}
                          title={activeConv?.sandboxAddress ? 'Sweep all funds to your real wallet' : 'No sandbox wallet attached to this conversation'}
                          className="w-8 h-8 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 flex items-center justify-center transition-all disabled:opacity-40"
                        >
                          {harvestLoading
                            ? <div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                            : <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                              </svg>
                          }
                        </button>
                        {/* Close */}
                        <button
                          onClick={() => { setShowSandboxPanel(false); setShowSandboxKey(false); }}
                          title="Close"
                          className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Row 2: private key (visible only when toggled) */}
                    {showSandboxKey && activeConv?.sandboxKey && (
                      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
                        <span className="flex-1 text-[10px] font-mono text-gray-400 break-all select-all leading-relaxed">
                          {activeConv.sandboxKey}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(activeConv.sandboxKey ?? '')}
                          title="Copy private key"
                          className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                        >
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <p className={`mt-1.5 text-center ${isCompactStage ? 'text-[10px]' : 'text-xs'} ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>
                AI can make mistakes. Always verify transactions before confirming.
            </p>
          </div>
        </div>
      </div>

      <TransactionAuthModal
        isOpen={showAgentAuthModal}
        onClose={() => {
          setShowAgentAuthModal(false);
          setPostAgentAuthAction(null);
        }}
        onSuccess={handleAgentAuthSuccess}
        transactionType={postAgentAuthAction ?? 'send'}
      />
    </div>
  );
}
