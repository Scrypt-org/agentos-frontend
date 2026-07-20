'use client';

import type { DragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
} from 'viem';
import { getEthereumAddress, getInjectiveAddress } from '@injectivelabs/sdk-ts';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import { usePin } from '@/contexts/PinContext';
import {
  MINI_APP_FRAME_CLASS,
  MINI_APP_PANEL_CLASS,
  mainContentOverflowClass,
} from '@/lib/mini-app-layout';
import type { DApp } from '@/config/dapps';
import {
  getMiniAppManifest,
  isAllowedMiniAppOrigin,
  resolveMiniAppAgentUrl,
  resolveMiniAppUrl,
  type MiniAppManifest,
} from '@/config/mini-apps';
import {
  compileCreativeContracts,
  confirmAgentAction,
  createCreativeBuild,
  createCreativeBuildStream,
  createCreativePlan,
  deleteStoredAgentConversation,
  getAgentSandboxDetails,
  getStoredAgentConversation,
  getStoredAgentConversations,
  generateTaskProgressSteps,
  searchStoredAgentConversations,
  sendAgentMessage,
  sendPublicAgentMessage,
  submitClientToolResult,
  sweepAgentSandbox,
  syncAgentConversation,
  type AgentPendingConfirmation,
  type CreativeBuild,
  type CreativeCompileResponse,
  type CreativePlan,
  type CreativePlanNode,
  type StoredConversationSummary,
  type StoredConversationSearchResult,
} from '@/services/ai';
import {
  deleteCloudDriveFile,
  decryptCloudDriveFile,
  downloadCloudDriveCiphertext,
  encryptCloudDriveFile,
  getCloudDrive,
  markCloudDriveFileAnchored,
  uploadCloudDriveFile,
  type CloudDriveFile,
  type CloudDriveState,
} from '@/services/cloud-drive';
import {
  deleteInjPassAccount,
  getAccountDeletionStatus,
  signalDeletedPasskey,
  sweepAccountAssets,
  type AccountDeletionStatus,
} from '@/services/account';
import { executeSwap, getTokenBalances } from '@/services/dex-swap';
import { fetchDapps } from '@/services/dapps';
import { getDAppIconUrl } from '@/services/dapp-icons';
import {
  visibleComposerDApps,
  visibleMarketDApps,
  visibleSidebarDApps,
} from '@/services/dapp-visibility';
import { claimDailyCheckIn, getNinjaStatus, getTransactions, type NinjaStatusResponse, type PointsTransaction } from '@/services/points';
import { getUserProfile, type UserProfileResponse } from '@/services/user';
import { authenticateWalletSession } from '@/services/wallet-auth';
import { validateInviteCode } from '@/services/referral';
import { createMySkill, getMySkills, getPublicSkills } from '@/services/skills';
import { consumeGuestChatReply, getGuestChatQuota } from '@/services/guest-chat-quota';
import { getN1NJ4NFTs, getNFTDetails, resolveNFTUri, type NFT } from '@/services/nft';
import { getCatNFTDetails, getCatNFTsForOwner, mintSponsoredCatNFT } from '@/services/catnft';
import { getUserStakingInfo, type StakingInfo } from '@/services/staking';
import {
  executeInjGiftCommand,
  isInjGiftMessage,
  parseInjGiftCommand,
} from '@/services/inj-gift';
import {
  formatMiniAppAgentResult,
  parseMiniAppAgentCommand,
  type MiniAppAgentCommand,
  type MiniAppAgentCommandResult,
} from '@/services/mini-app-commands';
import { handleMiniAppRpc, MiniAppHostError } from '@/services/mini-app-host';
import { getMiniAppFrameKey, getMiniAppSessionAddress } from '@/services/mini-app-session';
import { enterExistingPasskey } from '@/services/passkey-entry';
import { estimateGas, getBalance as getNativeBalance, getGasPrice, sendTransaction, waitForTransaction } from '@/wallet/chain';
import {
  completeLocalWalletSetup,
  createPrfWallet,
  detectPrfSupport,
  importMnemonicWallet,
  markMnemonicBackedUp,
  prepareLocalWalletSetup,
  recoverWallet,
  revealWalletMnemonic,
  unlockWalletKey,
  PrfUnsupportedError,
  type PreparedMnemonicWallet,
  type PrfDetection,
} from '@/wallet/key-management';
import { deleteWallet, deleteWalletByAddress, loadWallet, loadWallets, reconcileWalletStorage, setActiveWallet } from '@/wallet/keystore';
import type { LocalKeystore } from '@/types/wallet';
import { privateKeyToHex } from '@/utils/wallet';
import { INJECTIVE_MAINNET, type GasEstimate } from '@/types/chain';
import { QRCodeSVG } from 'qrcode.react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import MobileSidebarFrame from './MobileSidebarFrame';
import PasskeyWalletActions from './PasskeyWalletActions';

type ShellEntry = 'home' | 'welcome' | 'dashboard';
type ProductMode = 'chat' | 'creative';
type ChatSurface = 'default' | 'dapp-market' | 'campaign' | 'skills' | 'cloud-drive' | 'mini-app';
type WalletTab = 'tokens' | 'nfts' | 'defi' | 'activity';
type WalletExecutionMode = 'sandbox' | 'main';
type AssetWalletView = 'assets' | 'send' | 'receive';
type ProfilePanel = 'menu' | 'language' | 'preferences' | 'tokens';
type PreferenceSection = 'display' | 'security' | 'wallet' | 'account';
type LanguageCode = 'en' | 'de' | 'fr' | 'ko' | 'ja' | 'zh-Hans' | 'zh-Hant';
type ThinkingMode = 'chat' | 'build';
type ReasoningLevel = 'High' | 'Medium' | 'Low';
type AgentModel = 'AgentOS 1.0' | 'AgentOS 1.5';
type CreativeStage = 'guide' | 'plan' | 'building' | 'published';
type FaucetState = 'idle' | 'claiming' | 'verification' | 'ready' | 'needs-wallet' | 'error';
type ModeWorkStatus = 'idle' | 'working' | 'complete';
type DailyCheckInState = 'idle' | 'claiming' | 'claimed' | 'already-claimed' | 'error';
type LamPurchaseState = 'idle' | 'submitting' | 'confirming' | 'complete' | 'error';
type CreativeCompileStatus = 'idle' | 'compiling' | 'success' | 'error' | 'unsupported';
type AccountActionState = 'idle' | 'sweeping' | 'deleting' | 'deleted';
type AuthMethod = 'mnemonic' | 'passkey';
type WalletSetupMethod = 'traditional' | 'passkey';
type TraditionalWalletWizardMode = 'create' | 'recover';
type InviteValidationState = 'idle' | 'checking' | 'valid' | 'invalid';

const INJECTIVE_FAUCET_HCAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_INJECTIVE_FAUCET_HCAPTCHA_SITE_KEY
  || '8c54351a-e2f6-452c-a5fa-35d255d6c11a';

interface InjPassChatShellProps {
  entry?: ShellEntry;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  body: string;
  isError?: boolean;
  action?: 'login';
}

interface ThinkingProgressState {
  steps: string[];
  activeIndex: number;
}

interface DAppMarketItem {
  id: string;
  name: string;
  category: string;
  body: string;
  accent: string;
  url?: string;
  icon?: string;
  prompt?: string;
  aiDriven: boolean;
}

interface MiniAppBrowserTab {
  id: string;
  app: DAppMarketItem | null;
}

interface MiniAppNavigationState {
  path: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface MiniAppAgentRun {
  id: string;
  command: MiniAppAgentCommand;
  manifest: MiniAppManifest;
  src: string;
  baseOverride?: string;
}

interface MiniAppAgentResolver {
  resolve: (result: MiniAppAgentCommandResult) => void;
  reject: (error: Error) => void;
  timer: number;
  cleanupAbort?: () => void;
}

type MiniAppNavigationAction = 'back' | 'forward' | 'home' | 'reload';

const initialMiniAppNavigation: MiniAppNavigationState = {
  path: '/',
  title: '',
  canGoBack: false,
  canGoForward: false,
};

interface WalletActivityItem {
  hash: string;
  timestamp: string;
  method: string;
  status: string;
  confirmations: number | null;
  from?: string;
  to?: string;
}

interface WalletPanelData {
  tokens?: Record<string, string>;
  nfts?: NFT[];
  defi?: StakingInfo;
  activity?: WalletActivityItem[];
}

interface PendingAgentConfirmation extends AgentPendingConfirmation {
  conversationId: string;
}

interface ComposerTrigger {
  symbol: '@' | '#' | '$';
  query: string;
  start: number;
}

interface ComposerSuggestion {
  id: string;
  label: string;
  caption: string;
  symbol: '@' | '#' | '$';
  app?: DAppMarketItem;
}

type ComposerToken = ComposerSuggestion;

interface LocalUnlockResult {
  password: string;
  privateKey: Uint8Array;
}

interface AgentSkill {
  id: string;
  name: string;
  body: string;
  prompt: string;
  app: string;
  popularity: number;
  official?: boolean;
  custom?: boolean;
}

type ComposerDemoKind = 'omisper' | 'inj-gift' | 'bankrupt-elon';

interface ComposerDemoSelection {
  kind: ComposerDemoKind;
  app: string;
  skill: string;
  asset?: string;
}

interface ComposerDemoSegment {
  kind: 'text' | 'app' | 'skill' | 'asset';
  text: string;
}

const walletTabs: Array<{
  id: WalletTab;
  label: string;
}> = [
  { id: 'tokens', label: 'Assets' },
  { id: 'nfts', label: 'NFTs' },
  { id: 'defi', label: 'DeFi' },
  { id: 'activity', label: 'History' },
];

const LAM_PURCHASE_CONTRACT = process.env.NEXT_PUBLIC_CHANCE_CONTRACT_ADDRESS as Address | undefined;
const LAM_PURCHASE_PLANS = [
  { id: 'go', planId: 1, lam: 3, inj: '0.033' },
  { id: 'pro', planId: 2, lam: 12, inj: '0.108' },
  { id: 'max', planId: 3, lam: 30, inj: '0.33' },
] as const;

const LAM_PURCHASE_ABI = [
  {
    type: 'function',
    name: 'plans',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint8' }],
    outputs: [
      { name: 'priceWei', type: 'uint256' },
      { name: 'amount', type: 'uint32' },
      { name: 'cooldownSeconds', type: 'uint32' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'buyChance',
    stateMutability: 'payable',
    inputs: [
      { name: 'planId', type: 'uint8' },
      { name: 'clientRef', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const languageOptions: Array<{
  code: LanguageCode;
  label: string;
  caption: string;
}> = [
  { code: 'en', label: 'English', caption: 'Global default' },
  { code: 'de', label: 'Deutsch', caption: 'German' },
  { code: 'fr', label: 'Français', caption: 'French' },
  { code: 'ko', label: '한국어', caption: 'Korean' },
  { code: 'ja', label: '日本語', caption: 'Japanese' },
  { code: 'zh-Hans', label: '中文（简体）', caption: 'Simplified Chinese' },
  { code: 'zh-Hant', label: '中文（繁體）', caption: 'Traditional Chinese' },
];

const shellCopyEn = {
  modeChat: 'Interact',
  modeCreate: 'Build',
  brandSubtitle: 'AI wallet for Injective',
  newChat: 'New chat',
  searchChats: 'Search chats',
  wallet: 'Wallet',
  assets: 'Assets',
  send: 'Send',
  receive: 'Receive',
  recipient: 'Recipient',
  amount: 'Amount',
  evmAddress: 'EVM address',
  cosmosAddress: 'Cosmos address',
  copyAddress: 'Copy address',
  copied: 'Copied',
  reviewTransfer: 'Review transfer',
  confirmAndSend: 'Confirm and send',
  sending: 'Sending...',
  gasEstimate: 'Estimated network fee',
  gasLimit: 'Gas limit',
  insufficientBalance: 'Insufficient INJ balance.',
  invalidRecipient: 'Enter a valid EVM or Cosmos address.',
  invalidAmount: 'Enter a valid INJ amount.',
  walletLocked: 'Unlock your wallet before sending assets.',
  receiveEvmNote: 'Receive assets on Injective EVM. Always verify the network before transferring.',
  receiveCosmosNote: 'Use this Injective Cosmos address for compatible Cosmos transfers.',
  open: 'Open',
  closed: 'Closed',
  view: 'view',
  drag: 'drag',
  dappMarket: 'Apps',
  campaign: 'Campaign',
  campaignTitle: 'Make Elon Musk Go Broke',
  campaignBody: 'Start with $50B in simulated capital, trade global markets, use leverage, and see whether you can bankrupt Elon before the market bankrupts you.',
  joinCampaign: 'Start playing',
  skills: 'Skills',
  skillsCaption: 'Reusable AgentOS capabilities for common Injective work.',
  useSkill: 'Use skill',
  createSpace: 'Cloud Drive',
  cloudDriveCaption: '100 MB of private, client-encrypted storage with Injective proof.',
  cloudDriveOpen: 'Open drive',
  cloudDriveUpload: 'Upload',
  cloudDriveEmpty: 'This drive is empty.',
  cloudDriveLogin: 'Log in to open your private Cloud Drive.',
  cloudDriveRoot: 'My INJ Pass Drive',
  cloudDriveStored: 'Encrypted',
  cloudDriveAnchored: 'On Injective',
  cloudDriveAnchor: 'Anchor proof',
  cloudDriveDownload: 'Download',
  cloudDriveDelete: 'Delete',
  cloudDriveBack: 'This PC',
  cloudDriveEncrypting: 'Encrypting in this browser...',
  cloudDriveUploading: 'Uploading encrypted file...',
  cloudDriveAnchoring: 'Writing proof to Injective...',
  searchAllMessages: 'Search every message in your conversations',
  searchNoResults: 'No matching conversation found.',
  searchLogin: 'Log in to search your saved conversations.',
  recent: 'Recent',
  loading: 'Loading',
  totalBalance: 'Total balance',
  sync: 'Sync',
  live: 'Live',
  settings: 'Settings',
  logIn: 'Log in',
  aiTokens: 'AI tokens',
  aiTokensCaption: 'LAM credits and usage',
  language: 'Language',
  languageCaption: 'English, Deutsch, Français, 한국어, 日本語, 简体中文, 繁體中文',
  preferences: 'General',
  preferencesCaption: 'Display, security, wallet, and account',
  account: 'Account',
  accountLogin: 'Log in to manage or delete this INJ Pass account.',
  deleteAccount: 'Delete account',
  deleteAccountBody: 'Permanently remove this INJ Pass account, its server Passkey credential, conversations, skills, and encrypted Cloud Drive files.',
  checkAssets: 'Check assets',
  checkingAssets: 'Checking Injective assets...',
  assetsMustBeCleared: 'Clear every asset before deleting this account.',
  noAssetsRemain: 'No wallet assets remain. This account can be deleted.',
  sweepDestination: 'Destination EVM address',
  sweepDestinationHint: 'Use a regular wallet address you control. All transferable assets will move there.',
  sweepAssets: 'Clear assets',
  manualAssetAction: 'Manual action required',
  deleteConfirmation: 'Type DELETE to confirm',
  irreversible: 'This cannot be undone.',
  deleteRequiresPasskey: 'A fresh system Passkey verification is required for final deletion.',
  passkeyRemovalNote: 'INJ Pass removes the server credential and asks supported passkey providers to remove the system entry. You may still need to remove it manually from your password manager.',
  passkeyRemovalComplete: 'The passkey provider was notified that this credential is no longer valid.',
  accountDeleted: 'Account deleted',
  accountDeletedBody: 'The server account and local wallet were removed. On-chain transactions and file proofs remain public and immutable.',
  returnToLogin: 'Return to login',
  lamWillBeRemoved: 'Remaining LAM credits will be permanently removed.',
  community: 'Community',
  communityCaption: 'Telegram · t.me/injpass',
  support: 'Support',
  supportCaption: 'Ask Eric about INJ Pass',
  searchPlaceholder: 'Search saved conversations',
  history: 'Injective history',
  historyCaption: 'Transactions and approvals',
  back: 'Back',
  selected: 'Selected',
  signOut: 'Sign out',
  display: 'Display',
  theme: 'Theme',
  light: 'Light',
  dark: 'Dark',
  mainWallet: 'Main',
  sandbox: 'Sandbox',
  pinSecurity: 'PIN Security',
  transactionPin: 'Transaction PIN',
  enabled: 'Enabled',
  notSet: 'Not set',
  pinFreeTransactions: 'PIN-free transactions',
  off: 'Off',
  walletActions: 'Wallet Actions',
  managePin: 'Manage transaction PIN',
  resetPin: 'Reset PIN with passkey',
  privateKeyExport: 'Private key export',
  lockWallet: 'Lock wallet',
  session: 'Session',
  checkingSession: 'Checking session',
  walletConnected: 'Wallet connected',
  lightAccess: 'Light access',
  placeholderChat: 'Ask INJ Pass or drop assets / dApps here',
  placeholderCreate: 'Describe the dApp you want to build on Injective',
  titleDAppMarket: 'Apps',
  titleAuthed: 'What should we do on Injective today?',
  titleGuest: 'Start with an Injective task',
  titleCreativeGuide: 'What do you want to create on Injective?',
  titleCreativePlan: 'AgentOS mapped the build',
  titleCreativeBuilding: 'Building your Injective app',
  titleCreativePublished: 'Your source workspace is ready',
  securityTitle: 'Passkey security',
  securityBody: 'Wallet access and sensitive Injective actions use your system Passkey for approval.',
  upgradeWallet: 'Security settings',
  guideActionTitle: 'Say what to do on Injective',
  guideActionBody: 'Send, receive, swap, stake, claim, or ask for your wallet address in one sentence.',
  guideDropTitle: 'Drop assets into chat',
  guideDropBody: 'Bring a token, NFT, transaction, or portfolio item here and let AI explain or act on it.',
  guideDappTitle: 'Hand off a dApp',
  guideDappBody: 'Drop a dApp into the composer and INJ Pass can inspect screens, prepare steps, and route wallet actions.',
  guideReviewTitle: 'Review before signing',
  guideReviewBody: 'The AI prepares the operation; you still approve sensitive wallet actions before anything reaches chain.',
  creativeGuideBody: 'Turn one idea into a working Injective product with architecture, contracts, source, testnet checks, and a live preview.',
  pinnedEmpty: 'Pin apps from the market.',
  noSavedChats: 'No saved chats yet',
  confirmAction: 'Confirm agent action',
  reject: 'Reject',
  confirm: 'Confirm',
  agentThinking: 'Thinking...',
  attached: 'Attached',
  remove: 'Remove',
  close: 'Close',
  reasoning: 'Reasoning',
  model: 'Model',
  active: 'Active',
  aiTokenBalance: 'LAM balance',
  aiTokenStatus: 'Backend points status',
  aiTokenLedger: 'Recent LAM activity',
  noTokenActivity: 'No LAM activity yet',
  dailyCheckIn: 'Daily check-in',
  checkInReward: 'Claim 1 free LAM today',
  checkedIn: 'Checked in today',
  buyLam: 'Buy LAM with INJ',
  buyLamBody: 'Injective payment, credited after confirmation',
  purchasing: 'Purchasing',
  purchaseComplete: 'LAM credited',
  refresh: 'Refresh',
  chanceRemaining: 'Chances',
  cooldown: 'Cooldown',
  inviteCode: 'Invite code',
  memberSince: 'Member since',
  ready: 'Ready',
  lockedTokenHint: 'Log in or unlock your wallet to load LAM credits and AI usage from the backend.',
  agentUnavailable: 'I could not complete that request just now. Please try again in a moment.',
  poweredBy: 'Powered by',
  worksWithAgentOs: 'Works with AgentOS',
  comingSoon: 'Coming soon',
  recoveryPending: 'Recovery phrase not backed up',
  recoveryPendingBody: 'Protect this wallet by recording its 24 recovery words.',
  backUpNow: 'Back up now',
} as const;

type ShellCopyKey = keyof typeof shellCopyEn;
type ShellCopy = Record<ShellCopyKey, string>;

const shellCopyOverrides: Record<LanguageCode, Partial<Record<ShellCopyKey, string>>> = {
  en: {},
  de: {
    modeChat: 'Interaktion',
    modeCreate: 'Build',
    brandSubtitle: 'Injective KI-Wallet',
    newChat: 'Neuer Chat',
    searchChats: 'Chats durchsuchen',
    wallet: 'Wallet',
    recipient: 'Empfängeradresse',
    amount: 'Betrag',
    evmAddress: 'EVM-Adresse',
    cosmosAddress: 'Cosmos-Adresse',
    copyAddress: 'Adresse kopieren',
    copied: 'Kopiert',
    reviewTransfer: 'Transaktion prüfen',
    confirmAndSend: 'Bestätigen und senden',
    sending: 'Wird gesendet...',
    gasEstimate: 'Geschätzte Netzwerkgebühr',
    gasLimit: 'Gas-Limit',
    insufficientBalance: 'INJ-Guthaben reicht nicht aus.',
    invalidRecipient: 'Gib eine gültige EVM- oder Cosmos-Adresse ein.',
    invalidAmount: 'Gib einen gültigen INJ-Betrag ein.',
    walletLocked: 'Entsperre zuerst deine Wallet.',
    receiveEvmNote: 'Empfange Assets über Injective EVM und prüfe vor dem Transfer das Netzwerk.',
    receiveCosmosNote: 'Diese Injective-Cosmos-Adresse ist für kompatible Cosmos-Transfers bestimmt.',
    dappMarket: 'Apps',
    skills: 'Skills',
    skillsCaption: 'Wiederverwendbare AgentOS-Fähigkeiten für Injective.',
    useSkill: 'Skill verwenden',
    createSpace: 'Cloud-Speicher',
    recent: 'Zuletzt',
    logIn: 'Anmelden',
    language: 'Sprache',
    preferences: 'Allgemein',
    preferencesCaption: 'Anzeige, Sicherheit, Wallet und Konto',
    account: 'Konto',
    deleteAccount: 'Konto löschen',
    community: 'Community',
    communityCaption: 'Telegram · t.me/injpass',
    support: 'Support',
    supportCaption: 'Eric zu INJ Pass fragen',
    searchPlaceholder: 'Gespeicherte Chats durchsuchen',
    placeholderChat: 'INJ Pass fragen oder Assets / DApps ablegen',
    placeholderCreate: 'Beschreibe die DApp, die du auf Injective bauen willst',
    titleAuthed: 'Was möchtest du heute auf Injective erledigen?',
    titleGuest: 'Starte mit einer Injective-Aufgabe',
    titleCreativeGuide: 'Was möchtest du auf Injective bauen?',
    titleCreativePlan: 'AgentOS hat den Build geplant',
    agentThinking: 'Thinking...',
    poweredBy: 'Powered by',
  },
  'zh-Hans': {
    modeChat: '交互',
    modeCreate: '创造',
    brandSubtitle: 'Injective AI 钱包',
    newChat: '新建对话',
    searchChats: '搜索对话',
    wallet: '钱包',
    assets: '资产',
    send: '发送',
    receive: '接收',
    recipient: '收款地址',
    amount: '数量',
    evmAddress: 'EVM 地址',
    cosmosAddress: 'Cosmos 地址',
    copyAddress: '复制地址',
    copied: '已复制',
    reviewTransfer: '检查交易',
    confirmAndSend: '确认并发送',
    sending: '发送中...',
    gasEstimate: '预计网络费',
    gasLimit: 'Gas 上限',
    insufficientBalance: 'INJ 余额不足。',
    invalidRecipient: '请输入有效的 EVM 或 Cosmos 地址。',
    invalidAmount: '请输入有效的 INJ 数量。',
    walletLocked: '请先解锁钱包再发送资产。',
    receiveEvmNote: '通过 Injective EVM 接收资产，转账前请确认网络。',
    receiveCosmosNote: '此 Injective Cosmos 地址可用于兼容的 Cosmos 转账。',
    open: '已展开',
    closed: '已折叠',
    view: '查看',
    drag: '拖拽',
    dappMarket: '应用',
    campaign: '活动',
    campaignTitle: '让马斯克倾家荡产',
    campaignBody: '带着 500 亿美元模拟资金进入全球市场，买卖资产、使用杠杆，看看是你先让马斯克倾家荡产，还是市场先让你爆仓。',
    joinCampaign: '开始挑战',
    skills: '技能',
    skillsCaption: '用于常见 Injective 操作的可复用 AgentOS 能力。',
    useSkill: '使用技能',
    createSpace: '云盘',
    cloudDriveCaption: '100 MB 私密空间：文件只在本机加密，并将完整性凭证写入 Injective。',
    cloudDriveOpen: '打开云盘',
    cloudDriveUpload: '上传文件',
    cloudDriveEmpty: '云盘还是空的。',
    cloudDriveLogin: '登录后即可打开你的私密云盘。',
    cloudDriveRoot: '我的 INJ Pass 云盘',
    cloudDriveStored: '已加密',
    cloudDriveAnchored: '已上 Injective',
    cloudDriveAnchor: '写入链上凭证',
    cloudDriveDownload: '下载',
    cloudDriveDelete: '删除',
    cloudDriveBack: '此电脑',
    cloudDriveEncrypting: '正在本机加密...',
    cloudDriveUploading: '正在上传密文...',
    cloudDriveAnchoring: '正在写入 Injective 凭证...',
    recent: '最近',
    loading: '加载中',
    totalBalance: '总余额',
    sync: '同步中',
    live: '实时',
    settings: '设置',
    logIn: '登录',
    aiTokens: 'AI Token',
    aiTokensCaption: 'LAM 余额与使用记录',
    language: '语言',
    languageCaption: '英语、德语、法语、韩语、日语、简体中文、繁体中文',
    preferences: '通用',
    preferencesCaption: '显示、安全、钱包与账户',
    account: '账户',
    accountLogin: '登录后即可管理或删除此 INJ Pass 账户。',
    deleteAccount: '删除账户',
    deleteAccountBody: '永久删除此 INJ Pass 账户、服务端 Passkey 凭据、对话、技能和云盘密文。',
    checkAssets: '检查资产',
    checkingAssets: '正在检查 Injective 资产...',
    assetsMustBeCleared: '删除前必须清空您的全部资产。',
    noAssetsRemain: '钱包资产已清空，可以删除账户。',
    sweepDestination: '目标 EVM 地址',
    sweepDestinationHint: '请输入您控制的普通钱包地址，可即时转移的资产会全部发送到这里。',
    sweepAssets: '一键清空',
    manualAssetAction: '需要手动处理',
    deleteConfirmation: '输入 DELETE 确认',
    irreversible: '此操作不可恢复。',
    deleteRequiresPasskey: '最终删除前需要重新进行一次系统 Passkey 验证。',
    passkeyRemovalNote: 'INJ Pass 会删除服务端凭据，并通知支持该能力的 Passkey 管理器移除系统凭据；部分系统仍需在密码管理器中手动删除。',
    passkeyRemovalComplete: '已通知系统 Passkey 管理器此凭据不再有效。',
    accountDeleted: '账户已删除',
    accountDeletedBody: '服务端账户和本地钱包已经移除。链上交易和文件存证属于公开且不可更改的数据，无法删除。',
    returnToLogin: '返回登录',
    lamWillBeRemoved: '剩余 LAM 将被永久清除。',
    community: '社群',
    communityCaption: 'Telegram · t.me/injpass',
    support: '支持',
    supportCaption: '向 Eric 咨询 INJ Pass',
    searchPlaceholder: '搜索已保存的对话',
    searchAllMessages: '搜索所有对话正文',
    searchNoResults: '没有找到包含该内容的对话。',
    searchLogin: '登录后即可搜索已保存的对话。',
    history: 'Injective 历史',
    historyCaption: '交易与授权记录',
    back: '返回',
    selected: '已选择',
    signOut: '退出登录',
    display: '显示',
    theme: '主题',
    light: '浅色',
    dark: '夜间',
    mainWallet: 'Main',
    sandbox: 'Sandbox',
    pinSecurity: 'PIN 安全',
    transactionPin: '交易 PIN',
    enabled: '已启用',
    notSet: '未设置',
    pinFreeTransactions: '免 PIN 交易窗口',
    off: '关闭',
    walletActions: '钱包操作',
    managePin: '管理交易 PIN',
    resetPin: '用 Passkey 重置 PIN',
    privateKeyExport: '导出私钥',
    lockWallet: '锁定钱包',
    session: '会话',
    checkingSession: '检查会话中',
    walletConnected: '钱包已连接',
    lightAccess: '轻量访问',
    placeholderChat: '询问 INJ Pass，或拖入资产 / DApp',
    placeholderCreate: '描述你想在 Injective 上构建的 DApp',
    titleDAppMarket: '应用',
    titleAuthed: '今天想在 Injective 做什么？',
    titleGuest: '从一个 Injective 任务开始',
    titleCreativeGuide: '你想在 Injective 上创造什么？',
    titleCreativePlan: 'AgentOS 已生成构建图谱',
    titleCreativeBuilding: '正在构建你的 Injective 应用',
    titleCreativePublished: '你的应用可以预览了',
    securityTitle: 'Passkey 安全',
    securityBody: '钱包访问和敏感 Injective 操作会调用系统 Passkey，由你本人确认后执行。',
    upgradeWallet: '安全设置',
    guideActionTitle: '直接说 Injective 操作',
    guideActionBody: '发送、接收、兑换、质押、领取，或者一句话查询自己的钱包地址。',
    guideDropTitle: '把资产拖进聊天框',
    guideDropBody: '把 Token、NFT、交易或资产组合拖进来，让 AI 解释、检查或接手下一步。',
    guideDappTitle: '把 DApp 交给 AI',
    guideDappBody: '拖入 DApp 后，INJ Pass 可以检查页面、准备步骤，并路由钱包操作。',
    guideReviewTitle: '签名前确认',
    guideReviewBody: 'AI 会准备操作，但敏感钱包行为仍由你确认后才会上链。',
    creativeGuideBody: '从一个想法开始，AgentOS 会梳理产品架构、合约、前后端源码、测试网检查与实时预览。',
    pinnedEmpty: '在市场里固定应用。',
    noSavedChats: '暂无已保存对话',
    confirmAction: '确认 Agent 操作',
    reject: '拒绝',
    confirm: '确认',
    agentThinking: 'Thinking...',
    attached: '已附加',
    remove: '移除',
    close: '关闭',
    reasoning: '推理强度',
    model: '模型',
    active: '当前',
    aiTokenBalance: 'LAM 余额',
    aiTokenStatus: '后端点数状态',
    aiTokenLedger: '最近 LAM 流水',
    noTokenActivity: '暂无 LAM 流水',
    dailyCheckIn: '每日签到',
    checkInReward: '今天免费领取 1 LAM',
    checkedIn: '今日已签到',
    buyLam: '使用 INJ 购买 LAM',
    buyLamBody: 'Injective 支付，确认后自动到账',
    purchasing: '购买中',
    purchaseComplete: 'LAM 已到账',
    refresh: '刷新',
    chanceRemaining: '机会次数',
    cooldown: '冷却',
    inviteCode: '邀请码',
    memberSince: '注册时间',
    ready: '可用',
    lockedTokenHint: '登录或解锁钱包后，即可从后端加载 LAM 余额和 AI 使用记录。',
    agentUnavailable: '这次请求暂时没有完成，请稍后再试。',
    poweredBy: 'Powered by',
    worksWithAgentOs: '已支持 AgentOS',
    comingSoon: '即将支持 AgentOS',
    recoveryPending: '助记词尚未备份',
    recoveryPendingBody: '请记录 24 个恢复词，以便在设备丢失时恢复钱包。',
    backUpNow: '立即备份',
  },
  fr: {
    modeChat: 'Interagir',
    modeCreate: 'Créer',
    brandSubtitle: 'Portefeuille IA pour Injective',
    newChat: 'Nouvelle conversation',
    searchChats: 'Rechercher',
    wallet: 'Portefeuille',
    assets: 'Actifs',
    send: 'Envoyer',
    receive: 'Recevoir',
    recipient: 'Adresse du destinataire',
    amount: 'Montant',
    evmAddress: 'Adresse EVM',
    cosmosAddress: 'Adresse Cosmos',
    copyAddress: 'Copier l’adresse',
    copied: 'Copiée',
    reviewTransfer: 'Vérifier la transaction',
    confirmAndSend: 'Confirmer et envoyer',
    sending: 'Envoi en cours...',
    gasEstimate: 'Frais réseau estimés',
    gasLimit: 'Limite de gas',
    insufficientBalance: 'Solde INJ insuffisant.',
    invalidRecipient: 'Saisissez une adresse EVM ou Cosmos valide.',
    invalidAmount: 'Saisissez un montant INJ valide.',
    walletLocked: 'Déverrouillez votre portefeuille avant l’envoi.',
    receiveEvmNote: 'Recevez des actifs sur Injective EVM. Vérifiez toujours le réseau avant le transfert.',
    receiveCosmosNote: 'Utilisez cette adresse Injective Cosmos pour les transferts Cosmos compatibles.',
    dappMarket: 'Applications',
    campaign: 'Campagne',
    skills: 'Compétences',
    createSpace: 'Cloud Drive',
    cloudDriveCaption: '100 Mo de stockage privé, chiffré côté client, avec preuve Injective.',
    cloudDriveOpen: 'Ouvrir le disque',
    cloudDriveUpload: 'Importer',
    cloudDriveEmpty: 'Ce disque est vide.',
    cloudDriveLogin: 'Connectez-vous pour ouvrir votre Cloud Drive privé.',
    cloudDriveRoot: 'Mon disque INJ Pass',
    cloudDriveStored: 'Chiffré',
    cloudDriveAnchored: 'Sur Injective',
    cloudDriveAnchor: 'Ancrer la preuve',
    cloudDriveDownload: 'Télécharger',
    cloudDriveDelete: 'Supprimer',
    cloudDriveBack: 'Ce PC',
    searchAllMessages: 'Rechercher dans tous les messages',
    searchNoResults: 'Aucune conversation correspondante.',
    searchLogin: 'Connectez-vous pour rechercher vos conversations enregistrées.',
    recent: 'Récent',
    settings: 'Paramètres',
    logIn: 'Se connecter',
    aiTokens: 'Jetons IA',
    language: 'Langue',
    languageCaption: 'Anglais, allemand, français, coréen, japonais, chinois simplifié et traditionnel',
    preferences: 'Général',
    preferencesCaption: 'Affichage, sécurité, portefeuille et compte',
    community: 'Communauté',
    support: 'Assistance',
    searchPlaceholder: 'Rechercher dans les conversations',
    back: 'Retour',
    selected: 'Sélectionné',
    signOut: 'Se déconnecter',
    display: 'Affichage',
    theme: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    placeholderChat: 'Demandez à INJ Pass ou déposez des actifs / DApps',
    placeholderCreate: 'Décrivez la DApp à créer sur Injective',
    titleAuthed: 'Que voulez-vous faire sur Injective aujourd’hui ?',
    titleGuest: 'Commencez par une tâche Injective',
    titleCreativeGuide: 'Que voulez-vous créer sur Injective ?',
    titleCreativePlan: 'AgentOS a préparé le plan de création',
    agentThinking: 'Thinking...',
    close: 'Fermer',
    remove: 'Retirer',
    refresh: 'Actualiser',
    poweredBy: 'Powered by',
  },
  'zh-Hant': {
    modeChat: '互動',
    modeCreate: '創造',
    brandSubtitle: 'Injective AI 錢包',
    newChat: '新增對話',
    searchChats: '搜尋對話',
    wallet: '錢包',
    recipient: '收款地址',
    amount: '數量',
    evmAddress: 'EVM 地址',
    cosmosAddress: 'Cosmos 地址',
    copyAddress: '複製地址',
    copied: '已複製',
    reviewTransfer: '檢查交易',
    confirmAndSend: '確認並發送',
    sending: '發送中...',
    gasEstimate: '預計網路費',
    gasLimit: 'Gas 上限',
    insufficientBalance: 'INJ 餘額不足。',
    invalidRecipient: '請輸入有效的 EVM 或 Cosmos 地址。',
    invalidAmount: '請輸入有效的 INJ 數量。',
    walletLocked: '請先解鎖錢包。',
    receiveEvmNote: '透過 Injective EVM 接收資產，轉帳前請確認網路。',
    receiveCosmosNote: '此 Injective Cosmos 地址可用於相容的 Cosmos 轉帳。',
    open: '已展開',
    closed: '已折疊',
    dappMarket: '應用',
    skills: '技能',
    skillsCaption: '用於常見 Injective 操作的可重用 AgentOS 能力。',
    useSkill: '使用技能',
    createSpace: '雲端硬碟',
    cloudDriveCaption: '100 MB 私密空間：檔案只在本機加密，並將完整性憑證寫入 Injective。',
    cloudDriveOpen: '開啟雲端硬碟',
    cloudDriveUpload: '上傳檔案',
    cloudDriveEmpty: '雲端硬碟還是空的。',
    cloudDriveLogin: '登入後即可開啟你的私密雲端硬碟。',
    cloudDriveRoot: '我的 INJ Pass 雲端硬碟',
    cloudDriveStored: '已加密',
    cloudDriveAnchored: '已上 Injective',
    cloudDriveAnchor: '寫入鏈上憑證',
    cloudDriveDownload: '下載',
    cloudDriveDelete: '刪除',
    cloudDriveBack: '此電腦',
    cloudDriveEncrypting: '正在本機加密...',
    cloudDriveUploading: '正在上傳密文...',
    cloudDriveAnchoring: '正在寫入 Injective 憑證...',
    preferences: '一般',
    preferencesCaption: '顯示、安全、錢包與帳戶',
    account: '帳戶',
    deleteAccount: '刪除帳戶',
    assetsMustBeCleared: '刪除前必須清空全部資產。',
    sweepAssets: '一鍵清空',
    community: '社群',
    communityCaption: 'Telegram · t.me/injpass',
    support: '支援',
    supportCaption: '向 Eric 諮詢 INJ Pass',
    searchPlaceholder: '搜尋已儲存的對話',
    searchAllMessages: '搜尋所有對話正文',
    searchNoResults: '沒有找到包含該內容的對話。',
    searchLogin: '登入後即可搜尋已儲存的對話。',
    language: '語言',
    totalBalance: '總餘額',
    logIn: '登入',
    settings: '設定',
    placeholderChat: '詢問 INJ Pass，或拖入資產 / DApp',
    placeholderCreate: '描述你想在 Injective 上構建的 DApp',
    titleAuthed: '今天想在 Injective 做什麼？',
    titleGuest: '從一個 Injective 任務開始',
    titleCreativeGuide: '你想在 Injective 上創造什麼？',
    titleCreativePlan: 'AgentOS 已生成構建圖譜',
    agentThinking: 'Thinking...',
    poweredBy: 'Powered by',
    aiTokens: 'AI Token',
    aiTokensCaption: 'LAM 餘額與使用紀錄',
    close: '關閉',
    remove: '移除',
    refresh: '刷新',
  },
  ja: {
    modeChat: '操作',
    modeCreate: 'Build',
    brandSubtitle: 'Injective の AI ウォレット',
    newChat: '新規チャット',
    searchChats: 'チャット検索',
    wallet: 'ウォレット',
    recipient: '受取アドレス',
    amount: '数量',
    evmAddress: 'EVM アドレス',
    cosmosAddress: 'Cosmos アドレス',
    copyAddress: 'アドレスをコピー',
    copied: 'コピー済み',
    reviewTransfer: '送金内容を確認',
    confirmAndSend: '確認して送信',
    sending: '送信中...',
    gasEstimate: '推定ネットワーク手数料',
    gasLimit: 'Gas 上限',
    insufficientBalance: 'INJ 残高が不足しています。',
    invalidRecipient: '有効な EVM または Cosmos アドレスを入力してください。',
    invalidAmount: '有効な INJ 数量を入力してください。',
    walletLocked: '先にウォレットをロック解除してください。',
    receiveEvmNote: 'Injective EVM で資産を受け取ります。送金前にネットワークを確認してください。',
    receiveCosmosNote: 'この Injective Cosmos アドレスは対応する Cosmos 送金に使用できます。',
    open: '展開中',
    closed: '折りたたみ',
    dappMarket: 'アプリ',
    skills: 'スキル',
    skillsCaption: 'Injective の作業に使える再利用可能な AgentOS 機能。',
    useSkill: 'スキルを使う',
    createSpace: 'クラウドドライブ',
    recent: '最近',
    totalBalance: '合計残高',
    settings: '設定',
    logIn: 'ログイン',
    aiTokens: 'AI トークン',
    language: '言語',
    preferences: '一般',
    preferencesCaption: '表示、セキュリティ、ウォレット、アカウント',
    account: 'アカウント',
    deleteAccount: 'アカウントを削除',
    community: 'コミュニティ',
    communityCaption: 'Telegram · t.me/injpass',
    support: 'サポート',
    supportCaption: 'Eric に INJ Pass を相談',
    searchPlaceholder: '保存したチャットを検索',
    placeholderChat: 'INJ Pass に聞く、または資産 / DApp をドロップ',
    placeholderCreate: 'Injective で作りたい DApp を説明',
    titleAuthed: '今日は Injective で何をしますか？',
    titleGuest: 'Injective のタスクから始める',
    titleCreativeGuide: 'Injective で何を作りますか？',
    titleCreativePlan: 'AgentOS がビルド図を作成しました',
    agentThinking: 'Thinking...',
    poweredBy: 'Powered by',
    close: '閉じる',
    remove: '削除',
    refresh: '更新',
  },
  ko: {
    modeChat: '상호작용',
    modeCreate: 'Build',
    brandSubtitle: 'Injective AI 지갑',
    newChat: '새 채팅',
    searchChats: '채팅 검색',
    wallet: '지갑',
    recipient: '받는 주소',
    amount: '수량',
    evmAddress: 'EVM 주소',
    cosmosAddress: 'Cosmos 주소',
    copyAddress: '주소 복사',
    copied: '복사됨',
    reviewTransfer: '전송 검토',
    confirmAndSend: '확인 후 보내기',
    sending: '전송 중...',
    gasEstimate: '예상 네트워크 수수료',
    gasLimit: 'Gas 한도',
    insufficientBalance: 'INJ 잔액이 부족합니다.',
    invalidRecipient: '올바른 EVM 또는 Cosmos 주소를 입력하세요.',
    invalidAmount: '올바른 INJ 수량을 입력하세요.',
    walletLocked: '먼저 지갑 잠금을 해제하세요.',
    receiveEvmNote: 'Injective EVM으로 자산을 받습니다. 전송 전에 네트워크를 확인하세요.',
    receiveCosmosNote: '이 Injective Cosmos 주소는 호환되는 Cosmos 전송에 사용할 수 있습니다.',
    open: '열림',
    closed: '닫힘',
    dappMarket: '앱',
    skills: '스킬',
    skillsCaption: 'Injective 작업에 재사용할 수 있는 AgentOS 기능입니다.',
    useSkill: '스킬 사용',
    createSpace: '클라우드 드라이브',
    recent: '최근',
    totalBalance: '총 잔액',
    settings: '설정',
    logIn: '로그인',
    aiTokens: 'AI 토큰',
    language: '언어',
    preferences: '일반',
    preferencesCaption: '화면, 보안, 지갑 및 계정',
    account: '계정',
    deleteAccount: '계정 삭제',
    community: '커뮤니티',
    communityCaption: 'Telegram · t.me/injpass',
    support: '지원',
    supportCaption: 'Eric에게 INJ Pass 문의',
    searchPlaceholder: '저장된 채팅 검색',
    placeholderChat: 'INJ Pass에 묻거나 자산 / DApp을 드롭',
    placeholderCreate: 'Injective에서 만들 DApp을 설명',
    titleAuthed: '오늘 Injective에서 무엇을 할까요?',
    titleGuest: 'Injective 작업으로 시작하기',
    titleCreativeGuide: 'Injective에서 무엇을 만들까요?',
    titleCreativePlan: 'AgentOS가 빌드 그래프를 만들었습니다',
    agentThinking: 'Thinking...',
    poweredBy: 'Powered by',
    close: '닫기',
    remove: '제거',
    refresh: '새로고침',
  },
};

const pinFreeWindows = [0, 1, 5, 15, 30, 60] as const;
const QUICK_MENU_AUTO_HIDE_MS = 850;
const reasoningOptions: ReasoningLevel[] = ['High', 'Medium', 'Low'];
const agentModelOptions: AgentModel[] = ['AgentOS 1.5', 'AgentOS 1.0'];
const erc721TransferAbi = [{
  type: 'function',
  name: 'safeTransferFrom',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
  ],
  outputs: [],
}] as const;

const dappMarketApps: DAppMarketItem[] = [
  {
    id: 'eric-mfer',
    name: 'eric mfer',
    category: 'NFTs',
    body: 'A CC0 tribute NFT collection inspired by mfers, with AgentOS-assisted discovery, minting, and collection actions.',
    accent: 'from-violet-400 to-fuchsia-500',
    icon: '/eric-mfer.png',
    prompt: 'Help me explore the eric mfer CC0 tribute NFT collection and prepare a supported mint or collection action.',
    aiDriven: true,
  },
  {
    id: 'bankrupt-elon-musk',
    name: 'Bankrupt Elon Musk',
    category: 'Campaign',
    body: 'Start with $50B, trade hundreds of global assets, use leverage, and compete on the loss leaderboard.',
    accent: 'from-amber-300 to-rose-500',
    icon: '/bankrupt-elon-musk.png',
    prompt: 'Use Bankrupt Elon Musk to show my simulated balance, inspect my portfolio, trade an asset, or check my ranking.',
    aiDriven: true,
  },
  {
    id: 'omisper',
    name: 'Omisper',
    category: 'AI',
    body: 'AI-assisted discovery and execution workflows for the Injective ecosystem.',
    accent: 'from-fuchsia-400 to-rose-500',
    icon: '/omisper.png',
    aiDriven: true,
  },
  {
    id: 'inj-gift',
    name: 'INJ Gift',
    category: 'Payments',
    body: 'Create and claim Injective gifts through guided AgentOS actions.',
    accent: 'from-emerald-400 to-cyan-500',
    icon: '/NINJA.png',
    aiDriven: true,
  },
  {
    id: 'helix',
    name: 'Helix',
    category: 'Exchange',
    body: 'Spot, perpetuals, portfolio review, and trading workflows.',
    accent: 'from-cyan-400 to-blue-500',
    url: 'https://helixapp.com',
    icon: getDAppIconUrl('https://helixapp.com'),
    aiDriven: false,
  },
  {
    id: 'injective-hub',
    name: 'Injective Hub',
    category: 'Governance & Staking',
    body: 'Governance, staking, portfolio routes, and core Injective account actions.',
    accent: 'from-indigo-400 to-sky-500',
    url: 'https://hub.injective.network',
    icon: '/injlogo.png',
    aiDriven: false,
  },
  {
    id: 'n1nj4',
    name: 'N1nj4',
    category: 'NFT Marketplace',
    body: 'Discover Injective NFT collections, ownership, listings, and marketplace activity.',
    accent: 'from-zinc-600 to-black',
    url: 'https://n1nj4.com',
    icon: '/N1NJ4.png',
    aiDriven: false,
  },
  {
    id: 'rarible',
    name: 'Rarible',
    category: 'Multichain NFT Marketplace',
    body: 'Browse multichain NFT collections, listings, ownership, and offers.',
    accent: 'from-yellow-300 to-lime-400',
    url: 'https://rarible.com',
    icon: getDAppIconUrl('https://rarible.com'),
    aiDriven: false,
  },
  {
    id: 'talis',
    name: 'Talis',
    category: 'NFTs',
    body: 'NFT collection browsing, listing review, ownership checks, and offers.',
    accent: 'from-pink-400 to-rose-500',
    url: 'https://talis.art',
    icon: getDAppIconUrl('https://talis.art'),
    aiDriven: false,
  },
  {
    id: 'choice',
    name: 'Choice',
    category: 'DEX Aggregator & Vaults',
    body: 'Compare swap routes, vault positions, liquidity, and execution options.',
    accent: 'from-cyan-400 to-violet-500',
    url: 'https://choice.exchange',
    icon: getDAppIconUrl('https://choice.exchange'),
    aiDriven: false,
  },
  {
    id: 'paradyze',
    name: 'Paradyze',
    category: 'Yield & Structured Products',
    body: 'Explore structured yield strategies, positions, rewards, and risk.',
    accent: 'from-fuchsia-400 to-indigo-500',
    url: 'https://paradyze.io',
    icon: getDAppIconUrl('https://paradyze.io'),
    aiDriven: false,
  },
  {
    id: 'name-service',
    name: 'Name Service',
    category: '.inj Domain Names',
    body: 'Search, register, and manage human-readable Injective domain names.',
    accent: 'from-blue-400 to-indigo-500',
    url: 'https://injective.name',
    icon: getDAppIconUrl('https://injective.name'),
    aiDriven: false,
  },
  {
    id: 'hydro',
    name: 'Hydro',
    category: 'Staking',
    body: 'Liquid staking, yield routes, reward checks, and position actions.',
    accent: 'from-emerald-400 to-teal-500',
    url: 'https://hydro.injective.network',
    icon: getDAppIconUrl('https://hydro.injective.network'),
    aiDriven: false,
  },
  {
    id: 'dojoswap',
    name: 'DojoSwap',
    category: 'AMM',
    body: 'Swap routes, liquidity pools, token discovery, and fee review.',
    accent: 'from-amber-300 to-orange-500',
    url: 'https://dojo.trading',
    icon: getDAppIconUrl('https://dojo.trading'),
    aiDriven: false,
  },
  {
    id: 'injscan',
    name: 'InjScan',
    category: 'Explorer',
    body: 'Transactions, address history, approvals, and contract inspection.',
    accent: 'from-slate-400 to-zinc-700',
    url: 'https://injscan.com',
    icon: getDAppIconUrl('https://injscan.com'),
    aiDriven: false,
  },
  {
    id: 'blockscout',
    name: 'Blockscout',
    category: 'Explorer',
    body: 'Injective EVM contracts, transactions, token transfers, and verification checks.',
    accent: 'from-lime-400 to-emerald-500',
    url: 'https://blockscout.injective.network',
    icon: getDAppIconUrl('https://blockscout.injective.network'),
    aiDriven: false,
  },
];

const comingSoonDAppOrder = [
  'Helix',
  'Injective Hub',
  'N1nj4',
  'Rarible',
  'Talis',
  'Choice',
  'Paradyze',
  'Name Service',
  'Hydro',
  'DojoSwap',
  'InjScan',
  'Blockscout',
] as const;

const composerSkills: AgentSkill[] = [
  {
    id: 'injective-portfolio-lens',
    name: 'Portfolio Lens',
    body: 'Inspect Injective assets, positions, exposure, and recent changes.',
    prompt: 'Analyze my complete Injective portfolio and highlight the most important changes and risks.',
    app: 'Injective',
    popularity: 9820,
    official: true,
  },
  {
    id: 'injective-transaction-guard',
    name: 'Transaction Guard',
    body: 'Review approvals and transaction intent before wallet confirmation.',
    prompt: 'Review my recent approvals and explain which permissions I should revoke or keep.',
    app: 'Injective',
    popularity: 8740,
    official: true,
  },
  {
    id: 'injective-research',
    name: 'Injective Research',
    body: 'Turn ecosystem activity and protocol data into a concise research brief.',
    prompt: 'Prepare a concise research brief on the most important recent Injective ecosystem activity.',
    app: 'Injective',
    popularity: 8120,
    official: true,
  },
  {
    id: 'injective-contract-studio',
    name: 'Contract Studio',
    body: 'Shape a contract idea into requirements, architecture, and a build plan.',
    prompt: 'Help me turn my smart contract idea into clear requirements and an Injective build plan.',
    app: 'Injective EVM',
    popularity: 7650,
    official: true,
  },
  {
    id: 'helix-swap-route',
    name: 'Swap Route Guard',
    body: 'Compare route, slippage, price impact, and approvals before a swap.',
    prompt: 'Use Helix to prepare the safest swap route and explain slippage and approvals before signing.',
    app: 'Helix',
    popularity: 6410,
  },
  {
    id: 'inj-gift-group-gift',
    name: 'Group Gift',
    body: 'Prepare an INJ red packet for a group and review the distribution.',
    prompt: 'Use INJ Gift to create a group red packet funded with INJ and show me the distribution before signing.',
    app: 'INJ Gift',
    popularity: 5930,
  },
  {
    id: 'omisper-scheduled-message',
    name: 'Encrypted Messenger',
    body: 'Send a private or group message and inspect the encrypted inbox or conversation history.',
    prompt: 'Use Omisper to send an encrypted message, check my inbox, or read my recent history with an address.',
    app: 'Omisper',
    popularity: 4870,
  },
  {
    id: 'bankrupt-elon-market-order',
    name: 'Market Order',
    body: 'Inspect a simulated market asset, buy or sell it, and report the updated portfolio.',
    prompt: 'Use Bankrupt Elon Musk to show my balance and help me buy or sell a supported market asset.',
    app: 'Bankrupt Elon Musk',
    popularity: 4220,
  },
  {
    id: 'eric-mfer-collection-lens',
    name: 'Collection Lens',
    body: 'Inspect Eric mfer ownership, traits, listings, and collection activity.',
    prompt: 'Open Eric mfer and summarize the collection, my holdings, traits, and current listings.',
    app: 'eric mfer',
    popularity: 3180,
  },
];

const chatShortcutsByLanguage: Record<LanguageCode, string[]> = {
  en: ['Show my wallet address', 'Send 5 INJ to a contact', 'Swap USDT to INJ', 'Open this dApp and claim rewards', 'Review my approvals', 'Show all my assets', 'Check my recent activity', 'Receive INJ into Main'],
  de: ['Meine Wallet-Adresse anzeigen', '5 INJ an einen Kontakt senden', 'USDT in INJ tauschen', 'Diese dApp öffnen und Belohnungen abholen', 'Meine Freigaben prüfen', 'Alle Assets anzeigen', 'Letzte Aktivitäten prüfen', 'INJ in Main empfangen'],
  fr: ['Afficher mon adresse', 'Envoyer 5 INJ à un contact', 'Échanger USDT contre INJ', 'Ouvrir cette DApp et réclamer les récompenses', 'Vérifier mes autorisations', 'Afficher tous mes actifs', 'Voir mon activité récente', 'Recevoir des INJ dans Main'],
  ko: ['내 지갑 주소 보기', '연락처에 5 INJ 보내기', 'USDT를 INJ로 스왑', '이 dApp을 열고 보상 받기', '내 승인 내역 검토', '모든 자산 보기', '최근 활동 확인', 'Main으로 INJ 받기'],
  ja: ['ウォレットアドレスを表示', '連絡先に 5 INJ を送る', 'USDT を INJ にスワップ', 'この dApp を開いて報酬を受け取る', '承認履歴を確認', 'すべての資産を表示', '最近の履歴を確認', 'Main で INJ を受け取る'],
  'zh-Hans': ['显示我的钱包地址', '向联系人发送 5 INJ', '将 USDT 兑换为 INJ', '打开这个 DApp 并领取奖励', '检查我的授权', '查看我的全部资产', '检查最近的操作记录', '用 Main 接收 INJ'],
  'zh-Hant': ['顯示我的錢包地址', '向聯絡人發送 5 INJ', '將 USDT 兌換為 INJ', '開啟這個 DApp 並領取獎勵', '檢查我的授權', '查看我的全部資產', '檢查最近的操作紀錄', '用 Main 接收 INJ'],
};

const newUserGuideLabelByLanguage: Record<LanguageCode, string> = {
  en: 'New user guide',
  de: 'Einführung',
  fr: 'Guide de démarrage',
  ko: '초보자 가이드',
  ja: '初心者ガイド',
  'zh-Hans': '新手引导',
  'zh-Hant': '新手引導',
};

const createOwnSkillCtaByLanguage: Record<LanguageCode, string> = {
  en: 'Want to create your own skill?',
  de: 'Möchtest du deinen eigenen Skill erstellen?',
  fr: 'Envie de créer votre propre compétence ?',
  ko: '나만의 스킬을 만들고 싶나요?',
  ja: '自分だけのスキルを作りませんか？',
  'zh-Hans': '想创造自己的技能吗？',
  'zh-Hant': '想創作自己的技能嗎？',
};

const creativeShortcutsByLanguage: Record<LanguageCode, string[]> = {
  en: ['NFT marketplace', 'Airdrop skill', 'Mahjong game', 'Treasury flow', 'Token launch'],
  de: ['NFT-Marktplatz', 'Airdrop-Skill', 'Mahjong-Spiel', 'Treasury-Ablauf', 'Token-Launch'],
  fr: ['Marché NFT', 'Compétence airdrop', 'Jeu de mah-jong', 'Flux de trésorerie', 'Lancement de token'],
  ko: ['NFT 마켓', '에어드롭 스킬', '마작 게임', '트레저리 흐름', '토큰 출시'],
  ja: ['NFT マーケット', 'エアドロップスキル', '麻雀ゲーム', 'トレジャリーフロー', 'トークン公開'],
  'zh-Hans': ['NFT 市场', '空投技能', '麻将游戏', '金库工作流', '代币发行'],
  'zh-Hant': ['NFT 市場', '空投技能', '麻將遊戲', '金庫工作流', '代幣發行'],
};

const creativeSkillDemoDataByLanguage: Record<LanguageCode, Array<{ app: string; skill: string }>> = {
  en: [{ app: 'Omisper', skill: 'Direct Message' }, { app: 'INJ Gift', skill: 'Group Gift' }, { app: 'Bankrupt Elon Musk', skill: 'Market Order' }],
  de: [{ app: 'Omisper', skill: 'Direktnachricht' }, { app: 'INJ Gift', skill: 'Gruppengeschenk' }, { app: 'Bankrupt Elon Musk', skill: 'Marktorder' }],
  fr: [{ app: 'Omisper', skill: 'Message direct' }, { app: 'INJ Gift', skill: 'Cadeau groupé' }, { app: 'Bankrupt Elon Musk', skill: 'Ordre de marché' }],
  ko: [{ app: 'Omisper', skill: '개인 메시지' }, { app: 'INJ Gift', skill: '그룹 선물' }, { app: 'Bankrupt Elon Musk', skill: '시장 주문' }],
  ja: [{ app: 'Omisper', skill: 'ダイレクトメッセージ' }, { app: 'INJ Gift', skill: '一斉ギフト' }, { app: 'Bankrupt Elon Musk', skill: '成行注文' }],
  'zh-Hans': [{ app: 'Omisper', skill: '单点发送' }, { app: 'INJ Gift', skill: '群发红包' }, { app: 'Bankrupt Elon Musk', skill: '市场买卖' }],
  'zh-Hant': [{ app: 'Omisper', skill: '單點傳送' }, { app: 'INJ Gift', skill: '群發紅包' }, { app: 'Bankrupt Elon Musk', skill: '市場買賣' }],
};

function formatCreativeSkillDemoSegments(
  language: LanguageCode,
  example: { app: string; skill: string },
): ComposerDemoSegment[] {
  const app = { kind: 'app' as const, text: `@${example.app}` };
  const skill = { kind: 'skill' as const, text: `#${example.skill}` };
  if (language === 'ko') return [{ kind: 'text', text: '' }, app, { kind: 'text', text: '용 ' }, skill, { kind: 'text', text: ' 스킬을 만들어 줘.' }];
  if (language === 'ja') return [app, { kind: 'text', text: ' 向けに ' }, skill, { kind: 'text', text: ' スキルを作って。' }];
  if (language === 'de') return [{ kind: 'text', text: 'Erstelle ' }, skill, { kind: 'text', text: ' für ' }, app, { kind: 'text', text: '.' }];
  if (language === 'fr') return [{ kind: 'text', text: 'Créer ' }, skill, { kind: 'text', text: ' pour ' }, app, { kind: 'text', text: '.' }];
  if (language === 'en') return [{ kind: 'text', text: 'Create ' }, skill, { kind: 'text', text: ' for ' }, app, { kind: 'text', text: '.' }];
  if (language === 'zh-Hant') return [{ kind: 'text', text: '為 ' }, app, { kind: 'text', text: ' 創作一個 ' }, skill, { kind: 'text', text: ' 技能。' }];
  return [{ kind: 'text', text: '为 ' }, app, { kind: 'text', text: ' 创作一个 ' }, skill, { kind: 'text', text: ' 技能。' }];
}

const guestSlogansByLanguage: Record<LanguageCode, string[]> = {
  en: ['Start with an Injective task', 'What will you do on Injective today?', 'Onchain finance is happening on Injective', 'Make Injective Great Again', 'In Eric We Trust', 'Put your next idea on Injective'],
  de: ['Starte mit einer Injective-Aufgabe', 'Was machst du heute auf Injective?', 'Onchain-Finanzwelt entsteht auf Injective', 'Make Injective Great Again', 'In Eric We Trust', 'Bring deine nächste Idee auf Injective'],
  fr: ['Commencez par une tâche Injective', 'Que ferez-vous sur Injective aujourd’hui ?', 'La finance on-chain se construit sur Injective', 'Make Injective Great Again', 'In Eric We Trust', 'Placez votre prochaine idée sur Injective'],
  ko: ['Injective 작업으로 시작하기', '오늘 Injective에서 무엇을 할까요?', '온체인 금융은 Injective에서 일어나고 있습니다', 'Make Injective Great Again', 'In Eric We Trust', '다음 아이디어를 Injective에 올리세요'],
  ja: ['Injective のタスクから始める', '今日は Injective で何をしますか？', 'オンチェーン金融は Injective で動いている', 'Make Injective Great Again', 'In Eric We Trust', '次のアイデアを Injective へ'],
  'zh-Hans': ['从一个 Injective 任务开始', '今天想在 Injective 做点什么？', '链上金融正在 Injective 上发生', 'Make Injective Great Again', 'In Eric We Trust', '把下一个好点子放到 Injective'],
  'zh-Hant': ['從一個 Injective 任務開始', '今天想在 Injective 做點什麼？', '鏈上金融正在 Injective 上發生', 'Make Injective Great Again', 'In Eric We Trust', '把下一個好點子放到 Injective'],
};

const buildGuideByLanguage: Record<LanguageCode, { intro: string; cards: Array<{ title: string; body: string }> }> = {
  en: {
    intro: 'Create more than apps: describe an NFT, Solidity protocol, game, automation, workflow, or reusable AgentOS skill and build it on Injective Testnet.',
    cards: [
      { title: 'Create an app', body: 'Turn a product or game idea into a previewable interface and working source.' },
      { title: 'Create on-chain assets', body: 'Generate NFT, token, marketplace, and protocol contracts in Solidity.' },
      { title: 'Create an AgentOS skill', body: 'Package a repeatable action, analysis, or automation as a reusable skill.' },
      { title: 'Compile on Testnet', body: 'Preview the frontend, compile contracts, run checks, and prepare a reviewed release.' },
    ],
  },
  de: {
    intro: 'Erstelle mehr als Apps: NFT, Solidity-Protokolle, Spiele, Automationen, Workflows oder wiederverwendbare AgentOS-Skills auf Injective Testnet.',
    cards: [
      { title: 'App erstellen', body: 'Produkt- oder Spielideen in Vorschau und funktionierenden Quellcode verwandeln.' },
      { title: 'Onchain-Assets erstellen', body: 'NFT-, Token-, Marktplatz- und Protokollverträge in Solidity generieren.' },
      { title: 'AgentOS-Skill erstellen', body: 'Wiederholbare Aktionen und Automationen als Skill verpacken.' },
      { title: 'Auf Testnet kompilieren', body: 'Frontend prüfen, Contracts kompilieren und Veröffentlichung vorbereiten.' },
    ],
  },
  fr: {
    intro: 'Créez plus que des applications : NFT, protocoles Solidity, jeux, automatisations, workflows ou compétences AgentOS réutilisables sur Injective Testnet.',
    cards: [
      { title: 'Créer une application', body: 'Transformez une idée de produit ou de jeu en interface prévisualisable et en code fonctionnel.' },
      { title: 'Créer des actifs on-chain', body: 'Générez les contrats Solidity pour NFT, jetons, marketplaces et protocoles.' },
      { title: 'Créer une compétence AgentOS', body: 'Regroupez une action, une analyse ou une automatisation récurrente dans une compétence réutilisable.' },
      { title: 'Compiler sur Testnet', body: 'Prévisualisez le frontend, compilez les contrats, lancez les contrôles et préparez la publication.' },
    ],
  },
  ko: {
    intro: '앱뿐 아니라 NFT, Solidity 프로토콜, 게임, 자동화, 워크플로와 재사용 가능한 AgentOS 스킬을 Injective Testnet에서 만드세요.',
    cards: [
      { title: '앱 만들기', body: '제품과 게임 아이디어를 미리보기 가능한 화면과 소스로 만듭니다.' },
      { title: '온체인 자산 만들기', body: 'NFT, 토큰, 마켓과 프로토콜 Solidity 컨트랙트를 생성합니다.' },
      { title: 'AgentOS 스킬 만들기', body: '반복 작업과 자동화를 재사용 가능한 스킬로 만듭니다.' },
      { title: 'Testnet에서 컴파일', body: '프론트엔드를 미리보고 컨트랙트와 검사를 실행합니다.' },
    ],
  },
  ja: {
    intro: 'アプリだけでなく、NFT、Solidity プロトコル、ゲーム、自動化、ワークフロー、再利用可能な AgentOS スキルを Injective Testnet 上で作れます。',
    cards: [
      { title: 'アプリを作る', body: 'プロダクトやゲームをプレビュー可能な画面とソースにします。' },
      { title: 'オンチェーン資産を作る', body: 'NFT、トークン、市場、プロトコルの Solidity を生成します。' },
      { title: 'AgentOS スキルを作る', body: '反復操作や自動化を再利用可能なスキルにします。' },
      { title: 'Testnet でコンパイル', body: 'プレビュー、コントラクトのコンパイル、検査を実行します。' },
    ],
  },
  'zh-Hans': {
    intro: '创造的不只是应用：你可以制作 NFT、Solidity 协议、游戏、自动化工作流，或一个可复用的 AgentOS 技能，并在 Injective Testnet 上验证。',
    cards: [
      { title: '创造一个应用', body: '把产品或游戏想法变成可以预览的界面和真实源码。' },
      { title: '创造链上资产', body: '生成 NFT、Token、市场和协议需要的 Solidity 合约。' },
      { title: '创造 AgentOS 技能', body: '把重复操作、分析或自动化封装成可复用技能。' },
      { title: '在 Testnet 编译', body: '预览前端、编译合约、运行检查，再准备发布。' },
    ],
  },
  'zh-Hant': {
    intro: '創造的不只是應用：你可以製作 NFT、Solidity 協議、遊戲、自動化工作流程，或可重用的 AgentOS 技能，並在 Injective Testnet 驗證。',
    cards: [
      { title: '創造一個應用', body: '把產品或遊戲想法變成可預覽的介面與真實原始碼。' },
      { title: '創造鏈上資產', body: '生成 NFT、Token、市場和協議需要的 Solidity 合約。' },
      { title: '創造 AgentOS 技能', body: '把重複操作、分析或自動化封裝成可重用技能。' },
      { title: '在 Testnet 編譯', body: '預覽前端、編譯合約、執行檢查，再準備發布。' },
    ],
  },
};

const creativeIntroByLanguage: Record<LanguageCode, Array<{ title: string; body: string }>> = {
  en: [
    { title: 'Create complete applications', body: 'Describe a product or game and AgentOS will map its interface, Solidity contracts, services, and preview.' },
    { title: 'Create on-chain objects', body: 'Build NFTs, tokens, marketplaces, protocols, and other programmable assets for Injective EVM Testnet.' },
    { title: 'Create reusable skills', body: 'Mention an @application, then package a new action or automation as an AgentOS skill for that app.' },
  ],
  de: [
    { title: 'Komplette Anwendungen erstellen', body: 'AgentOS plant Oberfläche, Solidity-Verträge, Dienste und Vorschau für Produkt- oder Spielideen.' },
    { title: 'Onchain-Objekte erstellen', body: 'NFTs, Token, Marktplätze und Protokolle für Injective EVM Testnet bauen.' },
    { title: 'Wiederverwendbare Skills erstellen', body: 'Eine @App nennen und eine neue Aktion oder Automation als AgentOS-Skill dafür erstellen.' },
  ],
  fr: [
    { title: 'Créer des applications complètes', body: 'Décrivez un produit ou un jeu : AgentOS structure son interface, ses contrats Solidity, ses services et sa prévisualisation.' },
    { title: 'Créer des objets on-chain', body: 'Créez des NFT, jetons, marketplaces, protocoles et autres actifs programmables sur Injective EVM Testnet.' },
    { title: 'Créer des compétences réutilisables', body: 'Mentionnez une @application, puis transformez une action ou une automatisation en compétence AgentOS.' },
  ],
  ko: [
    { title: '완전한 애플리케이션 만들기', body: '아이디어를 설명하면 AgentOS가 UI, Solidity, 서비스와 미리보기를 설계합니다.' },
    { title: '온체인 객체 만들기', body: 'Injective EVM Testnet용 NFT, 토큰, 마켓과 프로토콜을 만듭니다.' },
    { title: '재사용 가능한 스킬 만들기', body: '@앱을 지정하고 그 앱을 위한 새 작업이나 자동화를 AgentOS 스킬로 만듭니다.' },
  ],
  ja: [
    { title: '完全なアプリを作る', body: 'アイデアから UI、Solidity、サービス、プレビューまで AgentOS が設計します。' },
    { title: 'オンチェーンオブジェクトを作る', body: 'Injective EVM Testnet 向けの NFT、トークン、市場、プロトコルを作れます。' },
    { title: '再利用可能なスキルを作る', body: '@アプリを指定し、そのアプリ向けの操作や自動化を AgentOS スキルにします。' },
  ],
  'zh-Hans': [
    { title: '创造完整应用', body: '描述产品或游戏，AgentOS 会规划界面、Solidity 合约、服务和可交互预览。' },
    { title: '创造链上对象', body: '在 Injective EVM Testnet 创建 NFT、Token、市场、协议和其他可编程资产。' },
    { title: '创造可复用技能', body: '先用 @ 指定一个应用，再为它创作新的操作、分析或自动化 AgentOS 技能。' },
  ],
  'zh-Hant': [
    { title: '創造完整應用', body: '描述產品或遊戲，AgentOS 會規劃介面、Solidity 合約、服務和互動預覽。' },
    { title: '創造鏈上物件', body: '在 Injective EVM Testnet 建立 NFT、Token、市場、協議和其他可程式資產。' },
    { title: '創造可重用技能', body: '先用 @ 指定一個應用，再為它創作新的操作、分析或自動化 AgentOS 技能。' },
  ],
};

const creativeIntroControls: Record<LanguageCode, { skip: string; back: string; next: string; done: string }> = {
  en: { skip: 'Skip', back: 'Back', next: 'Next', done: 'Start creating' },
  de: { skip: 'Überspringen', back: 'Zurück', next: 'Weiter', done: 'Jetzt erstellen' },
  fr: { skip: 'Ignorer', back: 'Retour', next: 'Suivant', done: 'Commencer à créer' },
  ko: { skip: '건너뛰기', back: '이전', next: '다음', done: '만들기 시작' },
  ja: { skip: 'スキップ', back: '戻る', next: '次へ', done: '作成を始める' },
  'zh-Hans': { skip: '跳过', back: '上一页', next: '下一页', done: '开始创造' },
  'zh-Hant': { skip: '跳過', back: '上一頁', next: '下一頁', done: '開始創造' },
};

const sandboxIntroByLanguage: Record<LanguageCode, Array<{ title: string; body: string }>> = {
  en: [
    { title: 'A wallet made for experiments', body: 'Sandbox gives each conversation an isolated wallet, so testing never mixes with your Main assets.' },
    { title: 'AgentOS works inside clear boundaries', body: 'The agent can inspect balances and prepare or execute supported test actions, while sensitive steps remain visible.' },
    { title: 'Move results back to Main', body: 'View the Sandbox address or key from the plus menu, then sweep supported assets back to Main in one action.' },
  ],
  de: [
    { title: 'Ein Wallet für Experimente', body: 'Sandbox gibt jeder Unterhaltung ein isoliertes Wallet und trennt Tests von Main.' },
    { title: 'AgentOS arbeitet mit klaren Grenzen', body: 'Der Agent führt unterstützte Testaktionen aus, während sensible Schritte sichtbar bleiben.' },
    { title: 'Ergebnisse zurück zu Main', body: 'Adresse oder Schlüssel im Plus-Menü anzeigen und Assets mit einer Aktion zurückführen.' },
  ],
  fr: [
    { title: 'Un portefeuille pour expérimenter', body: 'Sandbox attribue un portefeuille isolé à chaque conversation afin de séparer les tests des actifs Main.' },
    { title: 'AgentOS agit dans des limites claires', body: 'L’agent peut analyser les soldes et exécuter les tests pris en charge, tout en laissant les étapes sensibles visibles.' },
    { title: 'Rapatrier les résultats vers Main', body: 'Affichez l’adresse ou la clé Sandbox depuis le menu plus, puis transférez les actifs pris en charge vers Main.' },
  ],
  ko: [
    { title: '실험을 위한 지갑', body: 'Sandbox는 대화마다 격리된 지갑을 만들어 Main 자산과 테스트를 분리합니다.' },
    { title: '명확한 경계 안의 AgentOS', body: '지원되는 테스트 작업을 처리하면서 민감한 단계는 항상 보이게 유지합니다.' },
    { title: '결과를 Main으로 이동', body: '더하기 메뉴에서 주소와 키를 확인하고 자산을 한 번에 Main으로 회수합니다.' },
  ],
  ja: [
    { title: '実験専用のウォレット', body: 'Sandbox は会話ごとに隔離ウォレットを作り、Main 資産とテストを分離します。' },
    { title: '明確な境界で動く AgentOS', body: '対応するテスト操作を実行し、重要な手順は常に確認できます。' },
    { title: '結果を Main に戻す', body: 'プラスメニューでアドレスや鍵を確認し、資産を Main へまとめて戻せます。' },
  ],
  'zh-Hans': [
    { title: '一个专门用来实验的钱包', body: '每次对话都有独立的 Sandbox 钱包，测试资产和 Main 资产互不混用。' },
    { title: 'AgentOS 在清晰边界内工作', body: '它可以查看余额并执行支持的测试操作，敏感步骤仍然会明确呈现。' },
    { title: '随时把结果归集到 Main', body: '从加号菜单查看 Sandbox 地址或私钥，并一键把支持的资产提取回 Main。' },
  ],
  'zh-Hant': [
    { title: '一個專門用來實驗的錢包', body: '每次對話都有獨立的 Sandbox 錢包，測試資產和 Main 資產互不混用。' },
    { title: 'AgentOS 在清晰邊界內工作', body: '它可以查看餘額並執行支援的測試操作，敏感步驟仍會明確呈現。' },
    { title: '隨時把結果歸集到 Main', body: '從加號選單查看 Sandbox 地址或私鑰，並一鍵將資產取回 Main。' },
  ],
};

const sandboxIntroControls: Record<LanguageCode, { skip: string; back: string; next: string; done: string }> = {
  en: { skip: 'Skip', back: 'Back', next: 'Next', done: 'Start using Sandbox' },
  de: { skip: 'Überspringen', back: 'Zurück', next: 'Weiter', done: 'Sandbox starten' },
  fr: { skip: 'Ignorer', back: 'Retour', next: 'Suivant', done: 'Utiliser Sandbox' },
  ko: { skip: '건너뛰기', back: '이전', next: '다음', done: 'Sandbox 시작' },
  ja: { skip: 'スキップ', back: '戻る', next: '次へ', done: 'Sandbox を始める' },
  'zh-Hans': { skip: '跳过', back: '上一页', next: '下一页', done: '开始使用 Sandbox' },
  'zh-Hant': { skip: '跳過', back: '上一頁', next: '下一頁', done: '開始使用 Sandbox' },
};

const composerIntroByLanguage: Record<LanguageCode, Array<{ title: string; body: string }>> = {
  en: [
    { title: 'Mention an application with @', body: 'Type @ to find an Injective application and give AgentOS the right application context.' },
    { title: 'Choose a skill with #', body: 'Type # to add a reusable AgentOS skill such as portfolio analysis or transaction review.' },
    { title: 'Reference an asset with $', body: 'Type $ to select a current wallet asset and include its live balance in the task.' },
  ],
  de: [
    { title: 'App mit @ erwähnen', body: 'Mit @ findest du eine Injective-App und gibst AgentOS den passenden Kontext.' },
    { title: 'Skill mit # wählen', body: 'Mit # fügst du einen wiederverwendbaren AgentOS-Skill hinzu.' },
    { title: 'Asset mit $ referenzieren', body: 'Mit $ wählst du ein aktuelles Wallet-Asset samt Kontostand.' },
  ],
  fr: [
    { title: 'Mentionner une application avec @', body: 'Saisissez @ pour trouver une application Injective et transmettre le bon contexte à AgentOS.' },
    { title: 'Choisir une compétence avec #', body: 'Saisissez # pour ajouter une compétence AgentOS réutilisable.' },
    { title: 'Référencer un actif avec $', body: 'Saisissez $ pour choisir un actif du portefeuille et inclure son solde en direct.' },
  ],
  ko: [
    { title: '@로 앱 호출', body: '@를 입력해 Injective 앱을 찾고 AgentOS에 앱 컨텍스트를 전달합니다.' },
    { title: '#으로 스킬 선택', body: '#을 입력해 포트폴리오 분석 같은 AgentOS 스킬을 추가합니다.' },
    { title: '$로 자산 참조', body: '$를 입력해 현재 지갑 자산과 잔액을 작업에 포함합니다.' },
  ],
  ja: [
    { title: '@ でアプリを指定', body: '@ を入力して Injective アプリを検索し、AgentOS にコンテキストを渡します。' },
    { title: '# でスキルを選択', body: '# を入力して分析や取引確認などの AgentOS スキルを追加します。' },
    { title: '$ で資産を参照', body: '$ を入力して現在のウォレット資産と残高をタスクに含めます。' },
  ],
  'zh-Hans': [
    { title: '用 @ 提及应用', body: '输入 @ 搜索 Injective 应用，把正确的应用上下文交给 AgentOS。' },
    { title: '用 # 选择技能', body: '输入 # 添加资产分析、交易检查等可复用的 AgentOS 技能。' },
    { title: '用 $ 引用资产', body: '输入 $ 选择当前钱包资产，并把实时余额带入任务。' },
  ],
  'zh-Hant': [
    { title: '用 @ 提及應用', body: '輸入 @ 搜尋 Injective 應用，把正確的應用上下文交給 AgentOS。' },
    { title: '用 # 選擇技能', body: '輸入 # 加入資產分析、交易檢查等可重用的 AgentOS 技能。' },
    { title: '用 $ 引用資產', body: '輸入 $ 選擇目前錢包資產，並把即時餘額帶入任務。' },
  ],
};

const composerIntroControls: Record<LanguageCode, { skip: string; back: string; next: string; done: string; sandbox: string }> = {
  en: { skip: 'Skip', back: 'Back', next: 'Next', done: 'Close', sandbox: 'Learn Sandbox' },
  de: { skip: 'Überspringen', back: 'Zurück', next: 'Weiter', done: 'Schließen', sandbox: 'Sandbox kennenlernen' },
  fr: { skip: 'Ignorer', back: 'Retour', next: 'Suivant', done: 'Fermer', sandbox: 'Découvrir Sandbox' },
  ko: { skip: '건너뛰기', back: '이전', next: '다음', done: '닫기', sandbox: 'Sandbox 더 알아보기' },
  ja: { skip: 'スキップ', back: '戻る', next: '次へ', done: '閉じる', sandbox: 'Sandbox を詳しく見る' },
  'zh-Hans': { skip: '跳过', back: '上一页', next: '下一页', done: '关闭', sandbox: '继续了解 Sandbox' },
  'zh-Hant': { skip: '跳過', back: '上一頁', next: '下一頁', done: '關閉', sandbox: '繼續了解 Sandbox' },
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getComposerTrigger(value: string): ComposerTrigger | null {
  const match = value.match(/(^|\s)([@#$])([^\s@#$]*)$/);
  if (!match || match.index === undefined) return null;
  return {
    symbol: match[2] as ComposerTrigger['symbol'],
    query: match[3] || '',
    start: match.index + match[1].length,
  };
}

const composerDemoSkillsByLanguage: Record<LanguageCode, Record<ComposerDemoKind, string[]>> = {
  en: {
    omisper: ['Group Chat', 'Direct Message', 'Scheduled Message'],
    'inj-gift': ['Send Gift', 'Receive Gift', 'Group Gift'],
    'bankrupt-elon': ['Check Balance', 'Buy Asset', 'Loss Ranking'],
  },
  de: {
    omisper: ['Gruppenchat', 'Direktnachricht', 'Geplante Nachricht'],
    'inj-gift': ['Geschenk senden', 'Geschenk empfangen', 'Gruppengeschenk'],
    'bankrupt-elon': ['Kontostand prüfen', 'Asset kaufen', 'Verlust-Rang'],
  },
  fr: {
    omisper: ['Discussion de groupe', 'Message direct', 'Message programmé'],
    'inj-gift': ['Envoyer un cadeau', 'Recevoir un cadeau', 'Cadeau groupé'],
    'bankrupt-elon': ['Voir le solde', 'Acheter un actif', 'Classement des pertes'],
  },
  ko: {
    omisper: ['그룹 채팅', '개인 메시지', '예약 전송'],
    'inj-gift': ['선물 보내기', '선물 받기', '그룹 선물'],
    'bankrupt-elon': ['잔액 확인', '자산 매수', '손실 순위'],
  },
  ja: {
    omisper: ['グループチャット', 'ダイレクトメッセージ', '予約送信'],
    'inj-gift': ['ギフト送信', 'ギフト受取', '一斉ギフト'],
    'bankrupt-elon': ['残高確認', '資産購入', '損失ランキング'],
  },
  'zh-Hans': {
    omisper: ['群聊', '单点发送', '定时发送'],
    'inj-gift': ['发送红包', '领取红包', '群发红包'],
    'bankrupt-elon': ['查看余额', '买入资产', '亏损排名'],
  },
  'zh-Hant': {
    omisper: ['群聊', '單點發送', '定時發送'],
    'inj-gift': ['發送紅包', '領取紅包', '群發紅包'],
    'bankrupt-elon': ['查看餘額', '買入資產', '虧損排名'],
  },
};

function getComposerDemoTemplate(language: LanguageCode, kind: ComposerDemoKind): string {
  const templates: Record<LanguageCode, Record<ComposerDemoKind, string>> = {
    en: {
      omisper: 'Use {skill} in {app} to deliver a private P2P message.',
      'inj-gift': 'Use {skill} in {app} to send {asset} gifts to friends.',
      'bankrupt-elon': 'Use {skill} in {app} to manage the simulated market portfolio.',
    },
    de: {
      omisper: 'Nutze {skill} in {app}, um eine private P2P-Nachricht zu senden.',
      'inj-gift': 'Nutze {skill} in {app}, um Freunden {asset} zu schenken.',
      'bankrupt-elon': 'Nutze {skill} in {app}, um das simulierte Marktportfolio zu verwalten.',
    },
    fr: {
      omisper: 'Utilisez {skill} dans {app} pour envoyer un message P2P privé.',
      'inj-gift': 'Utilisez {skill} dans {app} pour offrir des {asset} à vos amis.',
      'bankrupt-elon': 'Utilisez {skill} dans {app} pour gérer le portefeuille de marché simulé.',
    },
    ko: {
      omisper: '{app}에서 {skill}으로 P2P 메시지를 보내 줘.',
      'inj-gift': '{app}에서 {skill}으로 친구들에게 {asset} 선물을 보내 줘.',
      'bankrupt-elon': '{app}에서 {skill}으로 모의 시장 포트폴리오를 관리해 줘.',
    },
    ja: {
      omisper: '{app} で {skill} を使い、P2P メッセージを送信して。',
      'inj-gift': '{app} で {skill} を使い、友人に {asset} ギフトを送って。',
      'bankrupt-elon': '{app} で {skill} を使い、シミュレーション市場のポートフォリオを管理して。',
    },
    'zh-Hans': {
      omisper: '在 {app} 中使用 {skill}，按计划发送一条 P2P 消息。',
      'inj-gift': '在 {app} 中使用 {skill}，把 {asset} 红包发送给朋友。',
      'bankrupt-elon': '在 {app} 中使用 {skill}，管理模拟市场投资组合。',
    },
    'zh-Hant': {
      omisper: '在 {app} 中使用 {skill}，按計畫發送一則 P2P 訊息。',
      'inj-gift': '在 {app} 中使用 {skill}，把 {asset} 紅包發送給朋友。',
      'bankrupt-elon': '在 {app} 中使用 {skill}，管理模擬市場投資組合。',
    },
  };
  return templates[language][kind];
}

function formatComposerDemoSegments(language: LanguageCode, selection: ComposerDemoSelection): ComposerDemoSegment[] {
  const values: Record<'app' | 'skill' | 'asset', string> = {
    app: `@${selection.app}`,
    skill: `#${selection.skill}`,
    asset: selection.asset ? `$${selection.asset}` : '',
  };

  return getComposerDemoTemplate(language, selection.kind)
    .split(/(\{app\}|\{skill\}|\{asset\})/g)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\{(app|skill|asset)\}$/);
      if (!match) return { kind: 'text' as const, text: part };
      const kind = match[1] as 'app' | 'skill' | 'asset';
      return { kind, text: values[kind] };
    })
    .filter((segment) => segment.text);
}

function truncateAddress(address: string | null) {
  if (!address) return 'Guest';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isLanguageCode(value: string | null): value is LanguageCode {
  return languageOptions.some((option) => option.code === value);
}

function readInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';
  const storedLanguage = window.localStorage.getItem('injpass_language');
  if (storedLanguage === 'zh') return 'zh-Hans';
  return isLanguageCode(storedLanguage) ? storedLanguage : 'en';
}

function readInitialWalletExecutionMode(): WalletExecutionMode {
  if (typeof window === 'undefined') return 'sandbox';
  return window.localStorage.getItem('injpass_sandbox_mode') === 'false' ? 'main' : 'sandbox';
}

function uid(prefix = 'msg') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function conversationSummaryCacheKey(address: string) {
  return `injpass_conversation_summaries:${address.toLowerCase()}`;
}

function readCachedConversationSummaries(address: string): StoredConversationSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(conversationSummaryCacheKey(address)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function cacheConversationSummaries(address: string, summaries: StoredConversationSummary[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    conversationSummaryCacheKey(address),
    JSON.stringify(summaries.slice(0, 50)),
  );
}

function conversationPinsKey(address: string) {
  return `injpass_conversation_pins:${address.toLowerCase()}`;
}

function readPinnedConversationIds(address: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(conversationPinsKey(address)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function cachePinnedConversationIds(address: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(conversationPinsKey(address), JSON.stringify(ids));
}

function customSkillsKey(address: string) {
  return `injpass_custom_skills:${address.toLowerCase()}`;
}

function readCustomSkills(address: string): AgentSkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(customSkillsKey(address)) || '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((skill): skill is AgentSkill => Boolean(skill && typeof skill === 'object' && 'id' in skill && 'name' in skill))
      : [];
  } catch {
    return [];
  }
}

function cacheCustomSkills(address: string, skills: AgentSkill[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(customSkillsKey(address), JSON.stringify(skills));
}

function pickRandomShortcuts(shortcuts: string[], count = 4): string[] {
  const shuffled = [...shortcuts];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function pickRotatingSlogan(language: LanguageCode, slogans: string[]): string {
  if (typeof window === 'undefined' || slogans.length === 0) return slogans[0] || '';
  const storageKey = `injpass_last_slogan:${language}`;
  const previous = window.localStorage.getItem(storageKey);
  const candidates = slogans.filter((slogan) => slogan !== previous);
  const next = candidates[Math.floor(Math.random() * candidates.length)] || slogans[0];
  window.localStorage.setItem(storageKey, next);
  return next;
}

function pickRotatingShortcuts(language: LanguageCode, shortcuts: string[], count = 5, includeGuide = false): string[] {
  const guide = newUserGuideLabelByLanguage[language];
  const pickWithGuide = () => includeGuide
    ? pickRandomShortcuts([
      ...pickRandomShortcuts(shortcuts.filter((shortcut) => shortcut !== guide), Math.max(0, count - 1)),
      guide,
    ], count)
    : pickRandomShortcuts(shortcuts.filter((shortcut) => shortcut !== guide), count);
  if (typeof window === 'undefined') return pickWithGuide();
  const storageKey = `injpass_last_shortcuts:${language}:${includeGuide ? 'wallet' : 'guest'}`;
  const previous = window.localStorage.getItem(storageKey);
  let next = pickWithGuide();
  let signature = next.join('|');
  for (let attempt = 0; attempt < 4 && signature === previous; attempt += 1) {
    next = pickWithGuide();
    signature = next.join('|');
  }
  window.localStorage.setItem(storageKey, signature);
  return next;
}

function pickMnemonicVerificationIndexes(wordCount: number, count = 3): number[] {
  const indexes = Array.from({ length: wordCount }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes.slice(0, Math.min(count, wordCount)).sort((left, right) => left - right);
}

function formatAmount(value: string | number, digits = 4) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '0';
  if (Math.abs(numeric) >= 1000) {
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return numeric.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatNFTTokenNumber(tokenId?: string | null) {
  if (!tokenId) return '--';
  return `#${tokenId.padStart(3, '0')}`;
}

function getNFTRarity(nft?: NFT | null) {
  const rarity = nft?.metadata?.attributes?.find((attribute) =>
    /rarity|tier|rank/i.test(attribute.trait_type),
  )?.value;
  if (rarity === undefined || rarity === null || rarity === '') return 'Normal';
  const value = String(rarity);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface EricMferMintCopy {
  complete: string;
  sponsored: string;
  transaction: string;
  login: string;
  noCredits: string;
  failed: string;
  rarity: string;
}

const ericMferMintCopy: Record<LanguageCode, EricMferMintCopy> = {
  en: {
    complete: 'Mint complete. You received',
    sponsored: 'INJ Pass sponsored the network fee for this mint.',
    transaction: 'View transaction',
    login: 'Log in to INJ Pass and unlock a wallet before minting an eric mfer.',
    noCredits: 'This INJ Pass account has already minted its eric mfer.',
    failed: 'The eric mfer mint could not be completed. Please try again.',
    rarity: 'Rarity',
  },
  de: {
    complete: 'Mint abgeschlossen. Du hast erhalten:',
    sponsored: 'INJ Pass hat die Netzwerkgebühr für diesen Mint übernommen.',
    transaction: 'Transaktion ansehen',
    login: 'Melde dich bei INJ Pass an und entsperre eine Wallet, bevor du einen eric mfer mintest.',
    noCredits: 'Dieses INJ Pass Konto hat bereits einen eric mfer gemintet.',
    failed: 'Der eric mfer Mint konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
    rarity: 'Seltenheit',
  },
  fr: {
    complete: 'Mint terminé. Vous avez reçu',
    sponsored: 'INJ Pass a pris en charge les frais réseau de ce mint.',
    transaction: 'Voir la transaction',
    login: 'Connectez-vous à INJ Pass et déverrouillez un portefeuille avant de minter un eric mfer.',
    noCredits: 'Ce compte INJ Pass a déjà minté son eric mfer.',
    failed: 'Le mint eric mfer n’a pas pu être terminé. Réessayez.',
    rarity: 'Rareté',
  },
  ko: {
    complete: '민팅이 완료되었습니다. 받은 NFT:',
    sponsored: '이번 민팅의 네트워크 수수료는 INJ Pass가 지원했습니다.',
    transaction: '트랜잭션 보기',
    login: 'eric mfer를 민팅하려면 INJ Pass에 로그인하고 지갑 잠금을 해제하세요.',
    noCredits: '이 INJ Pass 계정은 이미 eric mfer를 민팅했습니다.',
    failed: 'eric mfer 민팅을 완료하지 못했습니다. 다시 시도하세요.',
    rarity: '희귀도',
  },
  ja: {
    complete: 'ミントが完了しました。獲得したNFT:',
    sponsored: '今回のミントのネットワーク手数料はINJ Passが負担しました。',
    transaction: 'トランザクションを見る',
    login: 'eric mferをミントする前にINJ Passへログインし、ウォレットを解除してください。',
    noCredits: 'このINJ Passアカウントはすでにeric mferをミントしています。',
    failed: 'eric mferのミントを完了できませんでした。もう一度お試しください。',
    rarity: 'レア度',
  },
  'zh-Hans': {
    complete: 'Mint 完成，你获得了',
    sponsored: '本次 Mint 的网络费由 INJ Pass 赞助。',
    transaction: '查看交易',
    login: '请先登录 INJ Pass 并解锁钱包，再 Mint eric mfer。',
    noCredits: '这个 INJ Pass 账户已经 Mint 过一个 eric mfer。',
    failed: 'eric mfer Mint 未能完成，请稍后重试。',
    rarity: '稀有度',
  },
  'zh-Hant': {
    complete: 'Mint 完成，你獲得了',
    sponsored: '本次 Mint 的網路費由 INJ Pass 贊助。',
    transaction: '查看交易',
    login: '請先登入 INJ Pass 並解鎖錢包，再 Mint eric mfer。',
    noCredits: '這個 INJ Pass 帳戶已經 Mint 過一個 eric mfer。',
    failed: 'eric mfer Mint 未能完成，請稍後重試。',
    rarity: '稀有度',
  },
};

function isEricMferMintMessage(message: string) {
  const referencesEricMfer = /@\s*eric[\s_-]*mfer\b/i.test(message);
  const hasMintIntent = /\bmint(?:ing|ed)?\b|\bclaim\b|\bget\s+(?:me\s+)?(?:an?|one)\b|\bprägen\b|\bminten\b|\bfrapper\b|\bminter\b|민팅|민트|발행|ミント|発行|铸造|鑄造|铸一个|鑄一個|挖一个|挖一個|领一个|領一個|领取|領取/i.test(message);
  return referencesEricMfer && hasMintIntent;
}

function formatEricMferMintMessage(
  languageCode: LanguageCode,
  result: { hash: string; tokenId: string | null; gasSponsored?: boolean },
  nft: NFT | null,
) {
  const text = ericMferMintCopy[languageCode];
  const tokenNumber = formatNFTTokenNumber(result.tokenId);
  const name = nft?.name || `eric mfer ${tokenNumber}`;
  const sponsorship = result.gasSponsored ? `\n\n[${text.sponsored}](#injpass-sponsored-mint)` : '';
  const image = nft?.image
    ? `\n\n![${name.replace(/[\[\]]/g, '')}](${nft.image})`
    : '';
  return `${text.complete} **${name}** (${tokenNumber}).${image}\n\n${text.rarity}: **${getNFTRarity(nft)}**.${sponsorship}\n\n[${text.transaction}](https://blockscout.injective.network/tx/${result.hash})`;
}

function localizeEricMferMintError(error: unknown, languageCode: LanguageCode) {
  const message = error instanceof Error ? error.message : String(error);
  const text = ericMferMintCopy[languageCode];
  if (/INJPASS_LOGIN_REQUIRED|unlock|locked|authentication/i.test(message)) return text.login;
  if (/insufficient mint credits|complimentary mint|already.*mint/i.test(message)) return text.noCredits;
  return text.failed;
}

function responseRequiresWalletLogin(message: string) {
  const loginPatterns = [
    /\b(?:please\s+)?(?:log|sign)\s*in\b/i,
    /\b(?:please\s+)?connect\s+(?:your\s+)?wallet\b/i,
    /\b(?:please\s+)?unlock\s+(?:your\s+)?wallet\b/i,
    /\b(?:logged|signed)\s+in\s+(?:first|before|to)\b/i,
    /\b(?:anmelden|einloggen|wallet\s+(?:verbinden|entsperren))\b/i,
    /\b(?:connectez-vous|se\s+connecter|portefeuille\s+(?:connecter|déverrouiller))\b/i,
    /(?:로그인|지갑.{0,12}(?:연결|잠금\s*해제))/,
    /(?:ログイン|ウォレット.{0,12}(?:接続|解除))/,
    /(?:请|請|需要|需|先|必须|必須).{0,16}(?:登录|登入|连接|連接|解锁|解鎖)/,
  ];
  return loginPatterns.some((pattern) => pattern.test(message));
}

function isWalletInteractionRequest(message: string) {
  const walletIntentPatterns = [
    /\b(?:show|check|view|list|get|find|read)\b.{0,48}\b(?:my\s+)?(?:wallet\s+address|balance|assets?|tokens?|nfts?|portfolio|positions?|history|transactions?|approvals?)\b/i,
    /\bmy\b.{0,40}\b(?:wallet|address|balance|assets?|tokens?|nfts?|portfolio|positions?|history|transactions?|approvals?)\b/i,
    /\b(?:send|receive|swap|stake|unstake|claim|mint|transfer|approve|revoke|bridge|deposit|withdraw)\b.{0,64}\b(?:inj|usdt|usdc|xaut|token|nft|asset|wallet|address|dapp)\b/i,
    /(?:显示|顯示|查看|查询|查詢|检查|檢查|列出|发送|發送|接收|收款|兑换|兌換|质押|質押|解质押|解質押|领取|領取|铸造|鑄造|转账|轉帳|授权|授權|撤销|撤銷|跨链|跨鏈|充值|提现|提現).{0,36}(?:我的|我的钱包|我的錢包|钱包|錢包|地址|余额|餘額|资产|資產|代币|代幣|NFT|持仓|持倉|历史|歷史|交易|授权|授權|INJ|USDT|USDC|XAUT)/i,
    /(?:내|나의).{0,24}(?:지갑|주소|잔액|자산|토큰|NFT|거래|내역|승인)/i,
    /(?:私の|自分の).{0,24}(?:ウォレット|アドレス|残高|資産|トークン|NFT|取引|履歴|承認)/i,
    /\b(?:mein|meine|meinen)\b.{0,32}\b(?:wallet|adresse|guthaben|vermögen|token|nft|transaktionen|verlauf)\b/i,
    /\b(?:mon|ma|mes)\b.{0,32}\b(?:portefeuille|adresse|solde|actifs|jetons|nft|transactions|historique)\b/i,
  ];
  return walletIntentPatterns.some((pattern) => pattern.test(message));
}

function shouldOfferWalletLogin(prompt: string, response: string) {
  return responseRequiresWalletLogin(response) || isWalletInteractionRequest(prompt);
}

function getGuestChatQuotaMessage(languageCode: LanguageCode, remaining: number) {
  const messages: Record<LanguageCode, { remaining: (count: number) => string; exhausted: string }> = {
    en: {
      remaining: (count) => `You have ${count} free guest ${count === 1 ? 'reply' : 'replies'} remaining in this browser.`,
      exhausted: 'You have used all 3 free guest replies in this browser. Log in to continue chatting.',
    },
    de: {
      remaining: (count) => `In diesem Browser ${count === 1 ? 'ist noch 1 kostenlose Gastantwort' : `sind noch ${count} kostenlose Gastantworten`} verfügbar.`,
      exhausted: 'Du hast alle 3 kostenlosen Gastantworten in diesem Browser verwendet. Melde dich an, um weiter zu chatten.',
    },
    fr: {
      remaining: (count) => `Il vous reste ${count} réponse${count === 1 ? '' : 's'} gratuite${count === 1 ? '' : 's'} dans ce navigateur.`,
      exhausted: 'Vous avez utilisé les 3 réponses gratuites de ce navigateur. Connectez-vous pour continuer.',
    },
    ko: {
      remaining: (count) => `이 브라우저에서 무료 게스트 답변이 ${count}회 남았습니다.`,
      exhausted: '이 브라우저의 무료 게스트 답변 3회를 모두 사용했습니다. 계속하려면 로그인하세요.',
    },
    ja: {
      remaining: (count) => `このブラウザで無料ゲスト回答をあと${count}回利用できます。`,
      exhausted: 'このブラウザの無料ゲスト回答3回をすべて使用しました。続けるにはログインしてください。',
    },
    'zh-Hans': {
      remaining: (count) => `此浏览器还剩 ${count} 次免费访客对话。`,
      exhausted: '此浏览器的 3 次免费访客对话已用完，请登录后继续。',
    },
    'zh-Hant': {
      remaining: (count) => `此瀏覽器還剩 ${count} 次免費訪客對話。`,
      exhausted: '此瀏覽器的 3 次免費訪客對話已用完，請登入後繼續。',
    },
  };
  return remaining > 0 ? messages[languageCode].remaining(remaining) : messages[languageCode].exhausted;
}

const thinkingFallbacks: Record<LanguageCode, Record<ThinkingMode | 'mint', string[]>> = {
  en: {
    chat: ['Understand the request', 'Identify the relevant context', 'Check wallet requirements', 'Prepare the next action', 'Review safety constraints', 'Assemble the response'],
    build: ['Clarify the product scope', 'Map Injective components', 'Design the contract surface', 'Shape the interface flow', 'Plan tests and deployment', 'Assemble the build roadmap'],
    mint: ['Parse the mint request', 'Verify wallet access', 'Check mint eligibility', 'Prepare the sponsored voucher', 'Submit the mint transaction', 'Read NFT metadata'],
  },
  de: {
    chat: ['Anfrage verstehen', 'Relevanten Kontext erkennen', 'Wallet-Anforderungen prüfen', 'Nächste Aktion vorbereiten', 'Sicherheitsregeln prüfen', 'Antwort zusammenstellen'],
    build: ['Produktumfang klären', 'Injective-Komponenten abbilden', 'Vertragsschnittstelle entwerfen', 'Oberflächenablauf gestalten', 'Tests und Deployment planen', 'Build-Roadmap erstellen'],
    mint: ['Mint-Anfrage analysieren', 'Wallet-Zugriff prüfen', 'Mint-Berechtigung prüfen', 'Gesponserten Voucher vorbereiten', 'Mint-Transaktion senden', 'NFT-Metadaten laden'],
  },
  fr: {
    chat: ['Comprendre la demande', 'Identifier le contexte utile', 'Vérifier les besoins du wallet', 'Préparer la prochaine action', 'Contrôler les règles de sécurité', 'Composer la réponse'],
    build: ['Clarifier le périmètre', 'Cartographier les composants Injective', 'Concevoir les contrats', 'Structurer le parcours utilisateur', 'Planifier tests et déploiement', 'Assembler la feuille de route'],
    mint: ['Analyser la demande de mint', 'Vérifier l’accès au wallet', 'Contrôler l’éligibilité', 'Préparer le voucher sponsorisé', 'Envoyer la transaction de mint', 'Lire les métadonnées NFT'],
  },
  ko: {
    chat: ['요청 내용 파악', '관련 컨텍스트 확인', '지갑 요구사항 점검', '다음 작업 준비', '안전 조건 검토', '응답 구성'],
    build: ['제품 범위 정리', 'Injective 구성요소 설계', '컨트랙트 인터페이스 구성', '화면 흐름 설계', '테스트와 배포 계획', '빌드 로드맵 작성'],
    mint: ['민팅 요청 분석', '지갑 접근 확인', '민팅 자격 확인', '가스 지원 바우처 준비', '민팅 트랜잭션 제출', 'NFT 메타데이터 조회'],
  },
  ja: {
    chat: ['依頼内容を確認', '関連コンテキストを特定', 'ウォレット要件を確認', '次の操作を準備', '安全条件を確認', '回答を構成'],
    build: ['プロダクト範囲を整理', 'Injective構成を設計', 'コントラクト面を設計', '画面フローを構成', 'テストとデプロイを計画', 'ビルド工程を整理'],
    mint: ['Mint依頼を解析', 'ウォレット接続を確認', 'Mint資格を確認', 'スポンサーVoucherを準備', 'Mint取引を送信', 'NFTメタデータを取得'],
  },
  'zh-Hans': {
    chat: ['理解当前指令', '识别相关上下文', '检查钱包操作条件', '准备下一步动作', '复核安全边界', '组织最终回复'],
    build: ['梳理产品范围', '映射 Injective 组件', '设计合约接口', '整理前端流程', '规划测试与部署', '组装构建路线'],
    mint: ['解析 Mint 指令', '核对钱包访问', '检查 Mint 资格', '准备赞助凭证', '提交 Mint 交易', '读取 NFT 元数据'],
  },
  'zh-Hant': {
    chat: ['理解目前指令', '識別相關上下文', '檢查錢包操作條件', '準備下一步動作', '複核安全邊界', '組織最終回覆'],
    build: ['梳理產品範圍', '映射 Injective 元件', '設計合約介面', '整理前端流程', '規劃測試與部署', '組裝建構路線'],
    mint: ['解析 Mint 指令', '核對錢包存取', '檢查 Mint 資格', '準備贊助憑證', '提交 Mint 交易', '讀取 NFT 中繼資料'],
  },
};

function chooseFallbackThinkingSteps(prompt: string, languageCode: LanguageCode, mode: ThinkingMode) {
  const isMint = /\bmint(?:ing|ed)?\b|铸造|鑄造|민팅|민트|ミント/i.test(prompt);
  const pool = thinkingFallbacks[languageCode][isMint ? 'mint' : mode];
  const count = 3 + Math.floor(Math.random() * 3);
  const middle = pool.slice(1, -1)
    .map((step) => ({ step, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, count - 2))
    .map(({ step }) => step);
  const selected = new Set([pool[0], ...middle, pool[pool.length - 1]]);
  return pool.filter((step) => selected.has(step)).slice(0, 5);
}

function splitStreamingText(value: string) {
  const chunks: string[] = [];
  let current = '';
  for (const character of value) {
    current += character;
    if (current.length >= 5 || /[\s\n.,!?;:，。！？；：]/.test(character)) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function waitForStreamDelay(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Stopped', 'AbortError'));
      return;
    }
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unitIndex;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function formatShortDate(value?: string | number | null) {
  if (!value) return '—';
  const date = typeof value === 'number'
    ? new Date(value > 1_000_000_000_000 ? value : value * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isSuccessfulTransactionStatus(status: string) {
  return ['ok', 'success', 'confirmed'].includes(status.trim().toLowerCase());
}

function formatBlockConfirmations(item: WalletActivityItem, languageCode: LanguageCode) {
  if (!isSuccessfulTransactionStatus(item.status)) return item.status;
  if (item.confirmations === null) {
    return {
      en: 'Confirmed',
      de: 'Bestätigt',
      fr: 'Confirmée',
      ko: '확인됨',
      ja: '確認済み',
      'zh-Hans': '已确认',
      'zh-Hant': '已確認',
    }[languageCode];
  }

  const count = Math.max(0, Math.floor(item.confirmations));
  return {
    en: `${count} block confirmation${count === 1 ? '' : 's'}`,
    de: `${count} Blockbestätigung${count === 1 ? '' : 'en'}`,
    fr: `${count} confirmation${count === 1 ? '' : 's'} de bloc`,
    ko: `${count}개 블록 확인`,
    ja: `${count} ブロック確認`,
    'zh-Hans': `${count} 个区块确认`,
    'zh-Hant': `${count} 個區塊確認`,
  }[languageCode];
}

function describePointsTransaction(transaction: PointsTransaction) {
  return transaction.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mapAgentModel() {
  return 'deepseek-chat';
}

function formatCreativePlanForHistory(plan: CreativePlan): string {
  return [
    plan.summary,
    '',
    ...plan.nodes.map((node, index) => `${index + 1}. ${node.title}\n${node.body}`),
  ].join('\n');
}

function getBundledDAppIcon(name: string): string | undefined {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('omisper')) return '/omisper.png';
  if (normalized.includes('bankrupt elon') || normalized.includes('elon musk')) return '/bankrupt-elon-musk.png';
  if (normalized.includes('n1nj4')) return '/N1NJ4.png';
  if (normalized.includes('injective hub')) return '/injlogo.png';
  return undefined;
}

function getGoogleFavicon(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`;
  } catch {
    return undefined;
  }
}

function isAgentOsSupported(name: string, id?: string): boolean {
  const value = `${id || ''} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return value.includes('eric mfer') || value.includes('bankrupt elon') || value.includes('omisper') || value.includes('inj gift');
}

function normalizeDAppIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function OverlayPortal({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled || typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function mapBackendDApp(
  dapp: DApp,
  index: number,
  categoryLabels: Map<string, string>
): DAppMarketItem {
  const accents = [
    'from-cyan-400 to-blue-500',
    'from-violet-400 to-fuchsia-500',
    'from-emerald-400 to-teal-500',
    'from-amber-300 to-orange-500',
    'from-pink-400 to-rose-500',
    'from-indigo-400 to-sky-500',
  ];

  const categoryId = dapp.primaryCategory || dapp.categories?.[0];

  return {
    id: dapp.id,
    name: dapp.name,
    category: (categoryId && categoryLabels.get(categoryId)) || categoryId || 'DApp',
    body: dapp.description || dapp.mentionPrompt || 'Injective application available for AI-assisted wallet workflows.',
    accent: accents[index % accents.length],
    url: dapp.url,
    icon: dapp.icon || getBundledDAppIcon(dapp.name) || (dapp.url ? getDAppIconUrl(dapp.url) : undefined),
    prompt: dapp.mentionPrompt || dapp.aiPrompt,
    aiDriven: isAgentOsSupported(dapp.name, dapp.id),
  };
}

function MarkdownMessage({ body, isLight }: { body: string; isLight: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        code: ({ children }) => (
          <code className={cx('rounded px-1.5 py-0.5 font-mono text-[0.92em]', isLight ? 'bg-black/6' : 'bg-white/10')}>
            {children}
          </code>
        ),
        a: ({ href, children }) => href === '#injpass-sponsored-mint' ? (
          <span className={cx('font-semibold', isLight ? 'text-emerald-700' : 'text-emerald-400')}>
            {children}
          </span>
        ) : (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-current/35 underline-offset-4">
            {children}
          </a>
        ),
        img: ({ src, alt }) => typeof src === 'string' && src ? (
          <Image
            src={src}
            alt={alt || 'NFT'}
            width={440}
            height={440}
            unoptimized
            className={cx('my-4 aspect-square w-full max-w-[360px] rounded-lg border object-cover', isLight ? 'border-black/8 bg-black/4' : 'border-white/10 bg-white/6')}
          />
        ) : null,
      }}
    >
      {body}
    </ReactMarkdown>
  );
}

function DAppLogo({ app }: { app: DAppMarketItem }) {
  const candidates = useMemo(
    () => Array.from(new Set([
      app.icon,
      getBundledDAppIcon(app.name),
      app.url ? getDAppIconUrl(app.url) : undefined,
      getGoogleFavicon(app.url),
    ].filter((value): value is string => Boolean(value)))),
    [app.icon, app.name, app.url]
  );
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const src = candidates.find((candidate) => !failedSources.includes(candidate));
  if (!src) {
    return <>{app.name.slice(0, 2).toUpperCase()}</>;
  }

  return (
    <Image
      src={src}
      alt={`${app.name} logo`}
      fill
      sizes="44px"
      className="object-contain p-1"
      unoptimized
      onError={() => setFailedSources((current) => current.includes(src) ? current : [...current, src])}
    />
  );
}

function ArrowUpIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m6.75 10.25 5.25-5.25 5.25 5.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 12.5 3.8 3.8L18 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThinkingProgress({
  label,
  progress,
  isLight,
}: {
  label: string;
  progress: ThinkingProgressState;
  isLight: boolean;
}) {
  return (
    <div className="min-w-0" aria-live="polite">
      <span className={cx('inj-thinking-sheen text-sm', isLight ? 'inj-thinking-sheen-light' : 'inj-thinking-sheen-dark')}>
        {label}
      </span>
      {progress.steps.length > 0 && (
        <ol className="mt-2.5 space-y-1.5">
          {progress.steps.map((step, index) => {
            const complete = index < progress.activeIndex;
            const active = index === progress.activeIndex;
            return (
              <li
                key={`${index}-${step}`}
                aria-current={active ? 'step' : undefined}
                className={cx(
                  'flex min-w-0 items-center gap-2 text-xs leading-5 transition duration-500 motion-safe:animate-[injFadeUp_360ms_cubic-bezier(0.22,1,0.36,1)_both]',
                  active
                    ? isLight ? 'text-black/68' : 'text-white/72'
                    : complete
                      ? isLight ? 'text-black/42' : 'text-white/44'
                      : isLight ? 'text-black/26' : 'text-white/28',
                )}
              >
                <span
                  className={cx(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition duration-500',
                    complete
                      ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-500'
                      : active
                        ? isLight ? 'border-black/22' : 'border-white/28'
                        : isLight ? 'border-black/10' : 'border-white/12',
                  )}
                >
                  {complete ? (
                    <CheckIcon className="h-2.5 w-2.5" />
                  ) : active ? (
                    <span className={cx('h-1.5 w-1.5 animate-pulse rounded-full', isLight ? 'bg-black/62' : 'bg-white/72')} />
                  ) : null}
                </span>
                <span className="min-w-0 truncate">{step}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeIcon({ isLight, className = 'h-4 w-4' }: { isLight: boolean; className?: string }) {
  return isLight ? (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 15.1A8.4 8.4 0 0 1 8.9 4a8.5 8.5 0 1 0 11.1 11.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.8 7.5h13.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5.8a3 3 0 0 1-3-3v-11a2 2 0 0 1 2-2h12.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 13.5h3.7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function DAppMarketIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 8.5h14l-1.1 11H6.1L5 8.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M8.2 8.5a3.8 3.8 0 0 1 7.6 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M8.7 13h.01M12 13h.01M15.3 13h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function CampaignIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 13.5V8.2l11-3.7v12.8l-11-3.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M15.5 8.2a4 4 0 0 1 0 5.4M6.8 14.3l1.1 4.2H5.2l-.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkillsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.5 5.5h9M7.5 12h9M7.5 18.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="19" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5" cy="18.5" r="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16.5 5.5 19 10.5M7.5 12 5 17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function PinIcon({ pinned = false, className = 'h-4 w-4' }: { pinned?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} aria-hidden="true">
      <path d="m15.2 4.4 4.4 4.4-2.5 2.5.9 4.2-1.1 1.1-4.1-3.1-4.7 4.7-1.1-1.1 4.7-4.7-3.1-4.1 1.1-1.1 4.2.9 2.5-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5 19 9.2 14.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function OpenAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 16 16.5 7.5M10.5 7.5h6v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 15.5v2a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ReloadIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 8.5V4.8l-2.2 2.1A7.5 7.5 0 1 0 19.2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrowserBackIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrowserForwardIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HomeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 10 8-6 8 6v9H4v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 19v-5h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldCheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.2 19 6v5.2c0 4.2-2.8 7.7-7 9.6-4.2-1.9-7-5.4-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.8 12 2 2 4.4-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" />
      <circle cx="19" cy="12" r="1.35" fill="currentColor" />
    </svg>
  );
}

function SparkIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m19 15 .8 2.1 2.2.9-2.2.9L19 21l-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function CloudIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.4 18.5h10.1a4 4 0 0 0 .6-7.95A6.2 6.2 0 0 0 6.25 9.1 4.75 4.75 0 0 0 7.4 18.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SidebarCollapseIcon({ collapsed, className = 'h-4 w-4' }: { collapsed: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.7" />
      <path d={collapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ModeToggle({
  activeMode,
  setActiveMode,
  isLight,
  labels,
  statuses,
}: {
  activeMode: ProductMode;
  setActiveMode: (mode: ProductMode) => void;
  isLight: boolean;
  labels: Record<ProductMode, string>;
  statuses: Record<ProductMode, ModeWorkStatus>;
}) {
  return (
    <div
      className={cx(
        'inj-glass-surface relative mx-auto grid w-[190px] grid-cols-2 rounded-full p-1 text-sm font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.05)] motion-safe:animate-[injFadeDown_620ms_cubic-bezier(0.22,1,0.36,1)_both] sm:w-[226px]',
        isLight ? 'bg-black/[0.045] text-[#1d1d1f]' : 'bg-white/[0.08] text-white'
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full shadow-[0_2px_8px_rgba(15,23,42,0.1)] transition-[translate,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          activeMode === 'creative' && 'translate-x-full',
          isLight ? 'bg-white' : 'bg-white shadow-[0_2px_14px_rgba(0,0,0,0.24)]'
        )}
      />
      {(['chat', 'creative'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setActiveMode(mode)}
          aria-pressed={activeMode === mode}
          className={cx(
            'relative z-10 h-9 rounded-full outline-none transition-colors duration-300',
            activeMode === mode
              ? isLight
                ? 'text-black'
                : 'text-black'
              : isLight
                ? 'text-[#707070] hover:text-black'
                : 'text-white/62 hover:text-white'
          )}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {labels[mode]}
            {statuses[mode] !== 'idle' && (
              <span
                aria-label={statuses[mode] === 'working' ? 'Working' : 'Complete'}
                className={cx(
                  'h-1.5 w-1.5 rounded-full',
                  statuses[mode] === 'working' ? 'inj-status-working bg-amber-400' : 'inj-status-complete bg-emerald-500'
                )}
              />
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function ChatGuide({
  isLight,
  cards,
}: {
  isLight: boolean;
  cards: Array<{ title: string; body: string }>;
}) {
  return (
    <section className="mx-auto mt-5 w-full max-w-3xl motion-safe:animate-[injFadeUp_700ms_cubic-bezier(0.22,1,0.36,1)_220ms_both]">
      <div className={cx('h-px bg-gradient-to-r', isLight ? 'from-transparent via-black/12 to-transparent' : 'from-transparent via-white/14 to-transparent')} />
      <div className="grid gap-x-8 gap-y-4 px-1 py-5 sm:grid-cols-2">
        {cards.map((card, index) => (
          <div
            key={card.title}
            className="relative pl-5 text-left motion-safe:animate-[injFadeUp_680ms_cubic-bezier(0.22,1,0.36,1)_both]"
            style={{ animationDelay: `${260 + index * 70}ms` }}
          >
            <span
              className={cx(
                'absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full shadow-[0_0_18px_currentColor]',
                isLight ? 'bg-black/45 text-black/30' : 'bg-white/58 text-white/30'
              )}
            />
            <div className="text-sm font-bold">{card.title}</div>
            <p className={cx('mt-2 text-xs leading-5', isLight ? 'text-black/56' : 'text-white/58')}>
              {card.body}
            </p>
          </div>
        ))}
      </div>
      <div className={cx('h-px bg-gradient-to-r', isLight ? 'from-transparent via-black/8 to-transparent' : 'from-transparent via-white/10 to-transparent')} />
    </section>
  );
}

function SandboxIntroVisual({ page, isLight }: { page: number; isLight: boolean }) {
  const lineTone = isLight ? 'bg-black/16' : 'bg-white/18';
  const nodeTone = isLight ? 'border-black/12 bg-white text-black' : 'border-white/14 bg-[#18181b] text-white';

  return (
    <div className={cx('relative flex h-56 items-center justify-center overflow-hidden rounded-xl', isLight ? 'bg-emerald-50/55' : 'bg-emerald-300/[0.055]')}>
      {page === 0 && (
        <div className="flex items-center gap-8 sm:gap-14">
          <div className={cx('flex h-24 w-24 items-center justify-center rounded-full border text-sm font-bold opacity-55', nodeTone)}>Main</div>
          <div className={cx('h-px w-10', lineTone)} />
          <div className={cx('relative flex h-28 w-28 items-center justify-center rounded-full border-2 text-sm font-bold shadow-[0_16px_42px_rgba(16,185,129,0.15)]', isLight ? 'border-emerald-500 bg-white text-emerald-800' : 'border-emerald-300/70 bg-[#18181b] text-emerald-100')}>
            Sandbox
            <span className={cx('absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border text-xs', nodeTone)}>✓</span>
          </div>
        </div>
      )}
      {page === 1 && (
        <div className="relative h-44 w-72">
          <div className={cx('absolute left-1/2 top-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold', isLight ? 'border-emerald-500 bg-white text-emerald-800' : 'border-emerald-300/70 bg-[#18181b] text-emerald-100')}>AgentOS</div>
          {['Inspect', 'Prepare', 'Review'].map((label, index) => (
            <div key={label} className={cx('absolute flex h-10 w-20 items-center justify-center rounded-full border text-xs font-bold', nodeTone, index === 0 ? 'left-0 top-2' : index === 1 ? 'right-0 top-2' : 'bottom-1 left-1/2 -translate-x-1/2')}>{label}</div>
          ))}
          <div className={cx('absolute left-16 top-12 h-px w-12 rotate-[24deg]', lineTone)} />
          <div className={cx('absolute right-16 top-12 h-px w-12 -rotate-[24deg]', lineTone)} />
          <div className={cx('absolute bottom-10 left-1/2 h-10 w-px', lineTone)} />
        </div>
      )}
      {page === 2 && (
        <div className="flex items-center gap-5 sm:gap-8">
          <div className={cx('flex h-24 w-24 items-center justify-center rounded-full border-2 text-sm font-bold', isLight ? 'border-emerald-500 bg-white text-emerald-800' : 'border-emerald-300/70 bg-[#18181b] text-emerald-100')}>Sandbox</div>
          <div className="flex items-center gap-2">
            <span className={cx('h-px w-12 sm:w-20', lineTone)} />
            <ArrowUpIcon className="h-5 w-5 rotate-90 text-emerald-500" />
          </div>
          <div className={cx('flex h-24 w-24 items-center justify-center rounded-full border text-sm font-bold', nodeTone)}>Main</div>
        </div>
      )}
    </div>
  );
}

function SandboxIntroModal({
  open,
  page,
  pages,
  controls,
  isLight,
  onPage,
  onComplete,
}: {
  open: boolean;
  page: number;
  pages: Array<{ title: string; body: string }>;
  controls: { skip: string; back: string; next: string; done: string };
  isLight: boolean;
  onPage: (page: number) => void;
  onComplete: () => void;
}) {
  if (!open) return null;
  const item = pages[page] || pages[0];

  return (
    <OverlayPortal enabled={open}>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/36 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-label="Sandbox introduction" className={cx('inj-glass-surface inj-liquid-menu w-full max-w-xl rounded-2xl border p-4 shadow-2xl sm:p-5', isLight ? 'border-black/8 bg-white/96 text-black shadow-black/14' : 'border-white/10 bg-[#151518]/96 text-white shadow-black/55')}>
          <SandboxIntroVisual page={page} isLight={isLight} />
          <div className="px-1 pb-1 pt-5 text-center">
            <div className={cx('text-xs font-bold uppercase tracking-[0.14em]', isLight ? 'text-emerald-700' : 'text-emerald-300')}>Sandbox · {page + 1}/3</div>
            <h2 className="inj-display-serif mt-2 text-2xl sm:text-3xl">{item.title}</h2>
            <p className={cx('mx-auto mt-3 max-w-md text-sm leading-6', isLight ? 'text-black/58' : 'text-white/58')}>{item.body}</p>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2">
            {pages.map((introPage, index) => (
              <button key={introPage.title} type="button" onClick={() => onPage(index)} aria-label={`Page ${index + 1}`} className={cx('h-1.5 rounded-full transition-all', index === page ? 'w-7 bg-emerald-500' : isLight ? 'w-2 bg-black/14' : 'w-2 bg-white/18')} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={onComplete} className={cx('h-10 rounded-full px-4 text-xs font-bold transition', isLight ? 'text-black/46 hover:bg-black/5' : 'text-white/46 hover:bg-white/8')}>{controls.skip}</button>
            <div className="flex gap-2">
              {page > 0 && <button type="button" onClick={() => onPage(page - 1)} className={cx('h-10 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>{controls.back}</button>}
              <button type="button" onClick={() => page === pages.length - 1 ? onComplete() : onPage(page + 1)} className={cx('h-10 rounded-full px-5 text-xs font-bold transition', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}>{page === pages.length - 1 ? controls.done : controls.next}</button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function CreativeIntroVisual({ page, isLight }: { page: number; isLight: boolean }) {
  const node = isLight ? 'border-amber-300 bg-white text-black/72' : 'border-amber-300/24 bg-white/[0.055] text-white/72';
  const line = isLight ? 'bg-amber-400/55' : 'bg-amber-300/38';

  return (
    <div className={cx('relative flex h-56 items-center justify-center overflow-hidden rounded-xl', isLight ? 'bg-amber-50/75' : 'bg-amber-300/[0.055]')}>
      {page === 0 && (
        <div className="flex items-center gap-3">
          <div className={cx('rounded-xl border px-4 py-5 text-center text-xs font-bold', node)}>Idea</div>
          <span className={cx('h-px w-8', line)} />
          <div className={cx('rounded-xl border-2 border-amber-400 px-5 py-6 text-center text-sm font-bold', isLight ? 'bg-white text-amber-800' : 'bg-[#18181b] text-amber-200')}>AgentOS</div>
          <span className={cx('h-px w-8', line)} />
          <div className="grid gap-2">
            {['Preview', 'Solidity', 'API'].map((label) => <div key={label} className={cx('rounded-lg border px-3 py-1.5 text-center text-[11px] font-bold', node)}>{label}</div>)}
          </div>
        </div>
      )}
      {page === 1 && (
        <div className="flex items-center gap-4">
          {['NFT', 'Token', 'Market'].map((label, index) => (
            <div key={label} className={cx('flex h-24 w-24 items-center justify-center rounded-full border-2 text-sm font-bold', index === 0 ? isLight ? 'border-amber-400 bg-white text-amber-800' : 'border-amber-300/55 bg-[#18181b] text-amber-200' : node)}>{label}</div>
          ))}
        </div>
      )}
      {page === 2 && (
        <div className="flex items-center gap-3">
          <div className={cx('rounded-xl border px-4 py-5 text-lg font-bold', node)}># Skill</div>
          <span className={cx('h-px w-10', line)} />
          <div className={cx('rounded-full border-2 border-amber-400 px-5 py-5 text-sm font-bold', isLight ? 'bg-white text-amber-800' : 'bg-[#18181b] text-amber-200')}>AgentOS</div>
          <span className={cx('h-px w-10', line)} />
          <div className={cx('rounded-xl border px-4 py-5 text-sm font-bold', node)}>Run</div>
        </div>
      )}
    </div>
  );
}

function CreativeIntroModal({
  open,
  page,
  pages,
  controls,
  isLight,
  onPage,
  onComplete,
}: {
  open: boolean;
  page: number;
  pages: Array<{ title: string; body: string }>;
  controls: { skip: string; back: string; next: string; done: string };
  isLight: boolean;
  onPage: (page: number) => void;
  onComplete: () => void;
}) {
  if (!open) return null;
  const item = pages[page] || pages[0];

  return (
    <OverlayPortal enabled={open}>
      <div className="fixed inset-0 z-[114] flex items-center justify-center bg-black/36 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-label="Creative mode introduction" className={cx('inj-glass-surface inj-liquid-menu w-full max-w-xl rounded-2xl border p-4 shadow-2xl sm:p-5', isLight ? 'border-black/8 bg-white/96 text-black shadow-black/14' : 'border-white/10 bg-[#151518]/96 text-white shadow-black/55')}>
          <CreativeIntroVisual page={page} isLight={isLight} />
          <div className="px-1 pb-1 pt-5 text-center">
            <div className={cx('text-xs font-bold uppercase tracking-[0.14em]', isLight ? 'text-amber-700' : 'text-amber-300')}>Create · {page + 1}/3</div>
            <h2 className="inj-display-serif mt-2 text-2xl sm:text-3xl">{item.title}</h2>
            <p className={cx('mx-auto mt-3 max-w-md text-sm leading-6', isLight ? 'text-black/58' : 'text-white/58')}>{item.body}</p>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2">
            {pages.map((introPage, index) => <button key={introPage.title} type="button" onClick={() => onPage(index)} aria-label={`Page ${index + 1}`} className={cx('h-1.5 rounded-full transition-all', index === page ? 'w-7 bg-amber-500' : isLight ? 'w-2 bg-black/14' : 'w-2 bg-white/18')} />)}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={onComplete} className={cx('h-10 rounded-full px-4 text-xs font-bold transition', isLight ? 'text-black/46 hover:bg-black/5' : 'text-white/46 hover:bg-white/8')}>{controls.skip}</button>
            <div className="flex gap-2">
              {page > 0 && <button type="button" onClick={() => onPage(page - 1)} className={cx('h-10 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>{controls.back}</button>}
              <button type="button" onClick={() => page === pages.length - 1 ? onComplete() : onPage(page + 1)} className={cx('h-10 rounded-full bg-amber-400 px-5 text-xs font-bold text-black transition hover:bg-amber-300')}>{page === pages.length - 1 ? controls.done : controls.next}</button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function ComposerSyntaxIntroModal({
  open,
  page,
  pages,
  controls,
  isLight,
  onPage,
  onComplete,
  onContinueSandbox,
}: {
  open: boolean;
  page: number;
  pages: Array<{ title: string; body: string }>;
  controls: { skip: string; back: string; next: string; done: string; sandbox: string };
  isLight: boolean;
  onPage: (page: number) => void;
  onComplete: () => void;
  onContinueSandbox: () => void;
}) {
  if (!open) return null;
  const item = pages[page] || pages[0];
  const symbol = (['@', '#', '$'] as const)[page] || '@';
  const examples = page === 0
    ? ['INJ Gift', 'Bankrupt Elon Musk', 'Omisper']
    : page === 1
      ? ['Portfolio Lens', 'Transaction Guard', 'Contract Studio']
      : ['INJ', 'USDT', 'LAM'];

  return (
    <OverlayPortal enabled={open}>
      <div className="fixed inset-0 z-[112] flex items-center justify-center bg-black/36 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-label="Composer shortcuts introduction" className={cx('inj-glass-surface inj-liquid-menu w-full max-w-xl rounded-2xl border p-4 shadow-2xl sm:p-5', isLight ? 'border-black/8 bg-white/96 text-black shadow-black/14' : 'border-white/10 bg-[#151518]/96 text-white shadow-black/55')}>
          <div className={cx('relative flex h-56 items-center justify-center overflow-hidden rounded-xl', isLight ? 'bg-violet-50/55' : 'bg-violet-300/[0.055]')}>
            <div className={cx('absolute left-1/2 top-7 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-2 text-3xl font-bold', isLight ? 'border-violet-400 bg-white text-violet-700' : 'border-violet-300/70 bg-[#18181b] text-violet-100')}>{symbol}</div>
            <div className={cx('absolute left-1/2 top-[88px] h-7 w-px -translate-x-1/2', isLight ? 'bg-black/12' : 'bg-white/16')} />
            <div className="absolute inset-x-5 bottom-7 grid grid-cols-3 gap-2">
              {examples.map((example) => (
                <div key={example} className={cx('truncate rounded-xl border px-2 py-3 text-center text-xs font-bold', isLight ? 'border-black/8 bg-white text-black/64' : 'border-white/10 bg-white/6 text-white/66')}>{symbol}{example}</div>
              ))}
            </div>
          </div>
          <div className="px-1 pb-1 pt-5 text-center">
            <div className={cx('text-xs font-bold uppercase tracking-[0.14em]', isLight ? 'text-violet-700' : 'text-violet-300')}>{symbol} · {page + 1}/3</div>
            <h2 className="inj-display-serif mt-2 text-2xl sm:text-3xl">{item.title}</h2>
            <p className={cx('mx-auto mt-3 max-w-md text-sm leading-6', isLight ? 'text-black/58' : 'text-white/58')}>{item.body}</p>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2">
            {pages.map((introPage, index) => (
              <button key={introPage.title} type="button" onClick={() => onPage(index)} aria-label={`Page ${index + 1}`} className={cx('h-1.5 rounded-full transition-all', index === page ? 'w-7 bg-violet-500' : isLight ? 'w-2 bg-black/14' : 'w-2 bg-white/18')} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={onComplete} className={cx('h-10 rounded-full px-4 text-xs font-bold transition', isLight ? 'text-black/46 hover:bg-black/5' : 'text-white/46 hover:bg-white/8')}>{controls.skip}</button>
            <div className="flex flex-wrap justify-end gap-2">
              {page === pages.length - 1 ? (
                <>
                  <button type="button" onClick={onContinueSandbox} className={cx('h-10 rounded-full px-5 text-xs font-bold transition', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}>{controls.sandbox}</button>
                  <button type="button" onClick={() => onPage(page - 1)} className={cx('h-10 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>{controls.back}</button>
                  <button type="button" onClick={onComplete} className={cx('h-10 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>{controls.done}</button>
                </>
              ) : (
                <>
                  {page > 0 && <button type="button" onClick={() => onPage(page - 1)} className={cx('h-10 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>{controls.back}</button>}
                  <button type="button" onClick={() => onPage(page + 1)} className={cx('h-10 rounded-full px-5 text-xs font-bold transition', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}>{controls.next}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function WalletDataPanel({
  tab,
  data,
  loading,
  error,
  isAuthenticated,
  lamBalance,
  onRefresh,
  onSend,
  onReceive,
  isLight,
  languageCode,
  copy,
}: {
  tab: WalletTab;
  data: WalletPanelData;
  loading: boolean;
  error: string;
  isAuthenticated: boolean;
  lamBalance: number;
  onRefresh: () => void;
  onSend: () => void;
  onReceive: () => void;
  isLight: boolean;
  languageCode: LanguageCode;
  copy: ShellCopy;
}) {
  const title = walletTabs.find((item) => item.id === tab)?.label || 'Wallet';
  const supportsTransfers = tab === 'tokens' || tab === 'nfts';
  const canSend = tab === 'tokens' || Boolean(data.nfts?.length);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [selectedNftLoading, setSelectedNftLoading] = useState(false);
  const nftDetailRequestRef = useRef(0);
  const selectedNftUri = resolveNFTUri(selectedNft?.tokenURI);

  const openNftDetails = (nft: NFT) => {
    const requestId = ++nftDetailRequestRef.current;
    setSelectedNft(nft);
    if (!/^\d+$/.test(nft.tokenId)) return;

    setSelectedNftLoading(true);
    void getNFTDetails(nft.contractAddress, BigInt(nft.tokenId))
      .then((details) => {
        if (!details || requestId !== nftDetailRequestRef.current) return;
        setSelectedNft((current) => current && current.contractAddress.toLowerCase() === nft.contractAddress.toLowerCase() && current.tokenId === nft.tokenId
          ? { ...nft, ...details }
          : current);
      })
      .finally(() => {
        if (requestId === nftDetailRequestRef.current) setSelectedNftLoading(false);
      });
  };

  const closeNftDetails = () => {
    nftDetailRequestRef.current += 1;
    setSelectedNftLoading(false);
    setSelectedNft(null);
  };

  return (
    <>
    <section className="mx-auto w-full max-w-4xl py-5">
      <div className={cx('flex items-end justify-between border-b pb-4', isLight ? 'border-black/8' : 'border-white/8')}>
        <div>
          <div className={cx('text-[11px] font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/38' : 'text-white/38')}>Wallet</div>
          <h2 className="inj-display-serif mt-1 text-3xl">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {supportsTransfers && (
            <>
              <button type="button" onClick={onSend} disabled={!canSend} className={cx('h-9 rounded-full px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-35', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}>{copy.send}</button>
              <button type="button" onClick={onReceive} className={cx('h-9 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>{copy.receive}</button>
            </>
          )}
          <button type="button" onClick={onRefresh} disabled={loading} className={cx('h-9 rounded-full px-4 text-xs font-bold transition disabled:opacity-45', isLight ? 'bg-black/5 text-black hover:bg-black/8' : 'bg-white/8 text-white hover:bg-white/12')}>
            {loading ? 'Refreshing' : copy.refresh}
          </button>
        </div>
      </div>

      {!isAuthenticated && <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/52' : 'text-white/52')}>Log in to read this wallet data.</div>}
      {isAuthenticated && loading && !data[tab] && <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/46' : 'text-white/46')}>Reading wallet data...</div>}
      {isAuthenticated && error && <div className={cx('py-10 text-center text-sm', isLight ? 'text-amber-800' : 'text-amber-200')}>{error}</div>}

      {isAuthenticated && !error && tab === 'tokens' && data.tokens && (
        <div className="mt-3">
          {[...Object.entries(data.tokens), ['LAM', String(lamBalance)]].map(([symbol, amount]) => (
            <div key={symbol} className={cx('grid grid-cols-[1fr_auto] items-center border-b px-1 py-4', isLight ? 'border-black/6' : 'border-white/7')}>
              <div><div className="text-sm font-bold">{symbol}</div><div className={cx('mt-0.5 text-xs', isLight ? 'text-black/40' : 'text-white/40')}>{symbol === 'LAM' ? 'AI credits' : 'Injective wallet asset'}</div></div>
              <div className="font-mono text-sm font-semibold">{formatAmount(amount, 6)}</div>
            </div>
          ))}
        </div>
      )}

      {isAuthenticated && !error && tab === 'nfts' && data.nfts && (
        data.nfts.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.nfts.map((nft) => (
              <button
                key={`${nft.contractAddress}-${nft.tokenId}`}
                type="button"
                onClick={() => openNftDetails(nft)}
                className="group min-w-0 text-left outline-none"
                aria-label={`View ${nft.name} details`}
              >
                <div className={cx('relative aspect-square overflow-hidden rounded-xl', isLight ? 'bg-black/5' : 'bg-white/7')}>
                  {nft.image ? <Image src={nft.image} alt={nft.name} fill sizes="180px" unoptimized className="object-cover transition duration-300 group-hover:scale-[1.025]" /> : <div className="flex h-full items-center justify-center text-xs opacity-45">No image</div>}
                  <span className={cx('absolute inset-0 rounded-xl ring-1 ring-inset transition', isLight ? 'ring-black/0 group-hover:ring-black/14' : 'ring-white/0 group-hover:ring-white/18')} />
                </div>
                <div className="mt-2 truncate text-sm font-bold">{nft.name}</div>
                <div className={cx('mt-0.5 flex items-center justify-between gap-2 text-xs', isLight ? 'text-black/42' : 'text-white/42')}>
                  <span className="truncate">{nft.collection}</span>
                  <span className="shrink-0 font-mono">#{nft.tokenId}</span>
                </div>
              </button>
            ))}
          </div>
        ) : <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/46' : 'text-white/46')}>No NFTs found in this wallet.</div>
      )}

      {isAuthenticated && !error && tab === 'defi' && data.defi && (
        <div className="mt-5">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              ['Staked INJ', data.defi.totalStaked],
              ['Pending rewards', data.defi.rewards],
              ['Staking APR', `${data.defi.stakingApr}%`],
              ['Staked value', `$${data.defi.totalStakedUsd}`],
            ].map(([label, value]) => <div key={label}><div className={cx('text-xs', isLight ? 'text-black/42' : 'text-white/42')}>{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div>)}
          </div>
          <div className={cx('mt-7 border-t pt-3', isLight ? 'border-black/8' : 'border-white/8')}>
            {data.defi.delegations.length === 0 ? <div className={cx('py-8 text-sm', isLight ? 'text-black/46' : 'text-white/46')}>No active delegations.</div> : data.defi.delegations.map((delegation) => (
              <div key={delegation.validatorAddress} className={cx('flex items-center justify-between border-b py-3 text-sm', isLight ? 'border-black/6' : 'border-white/7')}><span className="font-semibold">{delegation.validatorName}</span><span className="font-mono">{delegation.amount} INJ</span></div>
            ))}
          </div>
        </div>
      )}

      {isAuthenticated && !error && tab === 'activity' && data.activity && (
        data.activity.length > 0 ? (
          <div className="mt-3">
            {data.activity.map((item) => {
              const successful = isSuccessfulTransactionStatus(item.status);
              return (
                <a key={item.hash} href={`https://blockscout.injective.network/tx/${item.hash}`} target="_blank" rel="noreferrer" className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center border-b py-4 transition', isLight ? 'border-black/6 hover:bg-black/[0.02]' : 'border-white/7 hover:bg-white/[0.03]')}>
                  <div className="min-w-0"><div className="truncate text-sm font-bold">{item.method || 'Transaction'}</div><div className={cx('mt-1 truncate font-mono text-xs', isLight ? 'text-black/42' : 'text-white/42')}>{item.hash}</div></div>
                  <div className="ml-4 text-right"><div className={cx('text-xs font-bold', successful ? 'text-emerald-600' : isLight ? 'text-black/48' : 'text-white/48')}>{formatBlockConfirmations(item, languageCode)}</div><div className={cx('mt-1 text-xs', isLight ? 'text-black/38' : 'text-white/38')}>{formatShortDate(item.timestamp)}</div></div>
                </a>
              );
            })}
          </div>
        ) : <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/46' : 'text-white/46')}>No recent EVM activity.</div>
      )}
    </section>
    {selectedNft && (
      <OverlayPortal enabled>
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8">
          <button
            type="button"
            onClick={closeNftDetails}
            className="absolute inset-0 bg-black/62 backdrop-blur-md"
            aria-label="Close NFT details"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-nft-detail-title"
            className={cx(
              'relative z-10 grid max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg border shadow-[0_28px_90px_rgba(0,0,0,0.3)] motion-safe:animate-[injFadeUp_420ms_cubic-bezier(0.22,1,0.36,1)_both] md:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1.1fr)]',
              isLight ? 'border-black/10 bg-[#fbfbfa] text-black' : 'border-white/12 bg-[#151517] text-white shadow-black/60',
            )}
          >
            <div className={cx('relative aspect-square min-h-[300px] self-start md:sticky md:top-0 md:min-h-0', isLight ? 'bg-black/5' : 'bg-white/5')}>
              {selectedNft.image ? (
                <Image src={selectedNft.image} alt={selectedNft.name} fill sizes="(max-width: 768px) 100vw, 380px" unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center text-sm opacity-42">No image</div>
              )}
            </div>
            <div className="relative flex min-w-0 flex-col p-6 sm:p-8">
              <button
                type="button"
                onClick={closeNftDetails}
                className={cx('absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition', isLight ? 'hover:bg-black/6' : 'hover:bg-white/9')}
                aria-label="Close NFT details"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
              <div className={cx('pr-10 text-[10px] font-bold uppercase tracking-[0.18em]', isLight ? 'text-black/38' : 'text-white/38')}>{selectedNft.collection}</div>
              <h2 id="wallet-nft-detail-title" className="inj-display-serif mt-2 pr-10 text-3xl leading-tight">{selectedNft.name}</h2>
              {selectedNftLoading && <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-500">Reading on-chain details...</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={cx('rounded-md px-2.5 py-1.5 font-mono text-xs font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Token ID · {formatNFTTokenNumber(selectedNft.tokenId)}</span>
                {selectedNft.metadata?.edition !== undefined && <span className={cx('rounded-md border px-2.5 py-1.5 text-xs font-bold', isLight ? 'border-black/10 bg-black/[0.025]' : 'border-white/12 bg-white/[0.05]')}>Edition · #{String(selectedNft.metadata.edition).padStart(3, '0')}</span>}
                <span className={cx('rounded-md border px-2.5 py-1.5 text-xs font-bold', isLight ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-violet-300/16 bg-violet-300/10 text-violet-200')}>Rarity · {getNFTRarity(selectedNft)}</span>
              </div>

              {selectedNft.description && <p className={cx('mt-5 text-sm leading-6', isLight ? 'text-black/58' : 'text-white/58')}>{selectedNft.description}</p>}

              {selectedNft.metadata?.attributes && selectedNft.metadata.attributes.length > 0 && (
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                  {selectedNft.metadata.attributes.map((attribute, index) => (
                    <div key={`${attribute.trait_type}-${index}`} className={cx('border-t pt-2', isLight ? 'border-black/8' : 'border-white/9')}>
                      <div className={cx('truncate text-[10px] uppercase', isLight ? 'text-black/38' : 'text-white/38')}>{attribute.trait_type}</div>
                      <div className="mt-1 truncate text-xs font-bold">{String(attribute.value)}</div>
                    </div>
                  ))}
                </div>
              )}

              <dl className={cx('mt-auto divide-y pt-6 text-xs', isLight ? 'divide-black/8' : 'divide-white/9')}>
                <div className="grid grid-cols-2 gap-4 py-3">
                  <div>
                    <dt className={isLight ? 'text-black/38' : 'text-white/38'}>Standard</dt>
                    <dd className="mt-1 font-semibold">{selectedNft.standard || 'ERC-721'}</dd>
                  </div>
                  <div>
                    <dt className={isLight ? 'text-black/38' : 'text-white/38'}>Collection supply</dt>
                    <dd className="mt-1 font-semibold">{selectedNft.totalSupply || '—'} {selectedNft.collectionSymbol || ''}</dd>
                  </div>
                </div>
                <div className="py-3">
                  <dt className={isLight ? 'text-black/38' : 'text-white/38'}>Contract</dt>
                  <dd className="mt-1 break-all font-mono">{selectedNft.contractAddress}</dd>
                </div>
                <div className="py-3">
                  <dt className={isLight ? 'text-black/38' : 'text-white/38'}>Owner</dt>
                  <dd className="mt-1 break-all font-mono">{selectedNft.owner}</dd>
                </div>
                {selectedNft.metadata?.dna && (
                  <div className="py-3">
                    <dt className={isLight ? 'text-black/38' : 'text-white/38'}>DNA</dt>
                    <dd className="mt-1 break-all font-mono">{selectedNft.metadata.dna}</dd>
                  </div>
                )}
                {selectedNft.tokenURI && (
                  <div className="py-3">
                    <dt className={isLight ? 'text-black/38' : 'text-white/38'}>Token URI</dt>
                    {selectedNftUri ? (
                      <dd className="mt-1"><a href={selectedNftUri} target="_blank" rel="noreferrer" className="break-all font-mono text-violet-500 underline underline-offset-4">{selectedNft.tokenURI}</a></dd>
                    ) : <dd className="mt-1 break-all font-mono">{selectedNft.tokenURI}</dd>}
                  </div>
                )}
                {selectedNft.mintTxHash && (
                  <div className="py-3">
                    <dt className={isLight ? 'text-black/38' : 'text-white/38'}>Mint transaction</dt>
                    <dd className="mt-1">
                      <a href={`https://blockscout.injective.network/tx/${selectedNft.mintTxHash}`} target="_blank" rel="noreferrer" className="break-all font-mono text-violet-500 underline underline-offset-4">{selectedNft.mintTxHash}</a>
                    </dd>
                  </div>
                )}
              </dl>
              <a
                href={`https://blockscout.injective.network/token/${selectedNft.contractAddress}/instance/${selectedNft.tokenId}`}
                target="_blank"
                rel="noreferrer"
                className={cx('mt-5 flex h-10 items-center justify-center rounded-md text-xs font-bold transition', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}
              >
                View on Injective Explorer
              </a>
            </div>
          </section>
        </div>
      </OverlayPortal>
    )}
    </>
  );
}

function WalletTransferPanel({
  mode,
  assetLabel = 'Assets',
  address,
  privateKey,
  onRequirePrivateKey,
  isLight,
  onComplete,
  onBack,
  copy,
}: {
  mode: 'send' | 'receive';
  assetLabel?: string;
  address: string | null;
  privateKey: Uint8Array | null;
  onRequirePrivateKey: () => Promise<Uint8Array>;
  isLight: boolean;
  onComplete: () => void;
  onBack: () => void;
  copy: ShellCopy;
}) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [addressType, setAddressType] = useState<'evm' | 'cosmos'>('evm');
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [copied, setCopied] = useState(false);
  const [maxLoading, setMaxLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  const isEvmAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());
  const isCosmosAddress = (value: string) => /^inj1[0-9a-z]{38,}$/.test(value.trim());
  const normalizeRecipient = (value: string) => (
    isCosmosAddress(value) ? getEthereumAddress(value.trim()) : value.trim()
  );
  const cosmosAddress = useMemo(() => {
    if (!address) return '';
    try {
      return getInjectiveAddress(address);
    } catch {
      return '';
    }
  }, [address]);
  const receiveAddress = addressType === 'cosmos' ? cosmosAddress : address || '';

  const localizeTransferError = (transferError: unknown) => {
    const message = transferError instanceof Error ? transferError.message : String(transferError);
    if (/insufficient|exceeds.*balance|funds for gas|balance for transfer/i.test(message)) {
      return copy.insufficientBalance;
    }
    if (/invalid address|checksum|recipient/i.test(message)) return copy.invalidRecipient;
    return copy.agentUnavailable;
  };

  const changeAddressType = (nextType: 'evm' | 'cosmos') => {
    if (nextType === addressType) return;
    try {
      if (recipient.trim()) {
        if (nextType === 'cosmos' && isEvmAddress(recipient)) {
          setRecipient(getInjectiveAddress(recipient.trim()));
        } else if (nextType === 'evm' && isCosmosAddress(recipient)) {
          setRecipient(getEthereumAddress(recipient.trim()));
        }
      }
      setAddressType(nextType);
      setReviewing(false);
      setGasEstimate(null);
      setError('');
    } catch {
      setError(copy.invalidRecipient);
    }
  };

  const validateTransfer = () => {
    if (!address) return copy.walletLocked;
    if (!isEvmAddress(recipient) && !isCosmosAddress(recipient)) return copy.invalidRecipient;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return copy.invalidAmount;
    return '';
  };

  const fillMaximumAmount = async () => {
    if (!address) {
      setError(copy.walletLocked);
      return;
    }
    setMaxLoading(true);
    setError('');
    try {
      const [balance, gasPrice] = await Promise.all([
        getNativeBalance(address, INJECTIVE_MAINNET),
        getGasPrice(INJECTIVE_MAINNET),
      ]);
      let networkCost = 25_200n * gasPrice;
      try {
        const estimate = await estimateGas(
          address,
          recipient.trim() ? normalizeRecipient(recipient) : address,
          '0',
          undefined,
          INJECTIVE_MAINNET,
        );
        networkCost = estimate.totalCost;
      } catch {
        // A conservative plain-transfer fallback still leaves room for RPC variance.
      }
      const reserve = (networkCost * 150n) / 100n;
      const spendable = balance.value > reserve ? balance.value - reserve : 0n;
      setAmount(formatEther(spendable));
      setReviewing(false);
      setGasEstimate(null);
    } catch (balanceError) {
      setError(localizeTransferError(balanceError));
    } finally {
      setMaxLoading(false);
    }
  };

  const reviewTransfer = async () => {
    const validationError = validateTransfer();
    if (validationError) {
      setError(validationError);
      return;
    }

    setReviewing(true);
    setEstimatingGas(true);
    setGasEstimate(null);
    setError('');
    try {
      const estimate = await estimateGas(
        address!,
        normalizeRecipient(recipient),
        amount.trim(),
        undefined,
        INJECTIVE_MAINNET,
      );
      setGasEstimate(estimate);
    } catch (estimateError) {
      const localizedError = localizeTransferError(estimateError);
      if (localizedError === copy.insufficientBalance) {
        try {
          const gasPrice = await getGasPrice(INJECTIVE_MAINNET);
          const gasLimit = 25_200n;
          setGasEstimate({
            gasLimit,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice / 10n,
            totalCost: gasLimit * gasPrice,
          });
        } catch {
          // The localized balance error remains useful even if the gas-price RPC also fails.
        }
      }
      setError(localizedError);
    } finally {
      setEstimatingGas(false);
    }
  };

  const submitTransfer = async () => {
    const validationError = validateTransfer();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const signingKey = privateKey || await onRequirePrivateKey();
      const hash = await sendTransaction(signingKey, normalizeRecipient(recipient), amount.trim(), undefined, INJECTIVE_MAINNET);
      setTxHash(hash);
      setReviewing(false);
      onComplete();
    } catch (transferError) {
      setError(localizeTransferError(transferError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl py-5">
      <div className={cx('flex items-end justify-between border-b pb-4', isLight ? 'border-black/8' : 'border-white/8')}>
        <div>
          <div className={cx('text-[11px] font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/38' : 'text-white/38')}>{assetLabel}</div>
          <h2 className="inj-display-serif mt-1 text-3xl">{mode === 'send' ? copy.send : copy.receive}</h2>
        </div>
        <button type="button" onClick={onBack} className={cx('h-9 rounded-full px-4 text-xs font-bold transition', isLight ? 'bg-black/5 hover:bg-black/8' : 'bg-white/8 hover:bg-white/12')}>{copy.back}</button>
      </div>

      {!address ? (
        <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/52' : 'text-white/52')}>Log in to use wallet transfers.</div>
      ) : mode === 'receive' ? (
        <div className="mx-auto mt-8 max-w-lg text-center">
          <div className={cx('mx-auto mb-6 grid w-full max-w-xs grid-cols-2 rounded-xl border p-1', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/10 bg-white/[0.035]')}>
            {(['evm', 'cosmos'] as const).map((type) => (
              <button key={type} type="button" onClick={() => changeAddressType(type)} className={cx('h-9 rounded-lg text-xs font-bold transition', addressType === type ? isLight ? 'bg-white text-black shadow-sm' : 'bg-white/12 text-white' : isLight ? 'text-black/45' : 'text-white/45')}>
                {type === 'evm' ? copy.evmAddress : copy.cosmosAddress}
              </button>
            ))}
          </div>
          <div className={cx('mx-auto flex h-44 w-44 items-center justify-center rounded-xl border p-3', isLight ? 'border-black/8 bg-white' : 'border-white/10 bg-white')}>
            <QRCodeSVG value={receiveAddress} size={148} level="M" />
          </div>
          <div className={cx('mt-5 break-all font-mono text-sm leading-6', isLight ? 'text-black/72' : 'text-white/72')}>{receiveAddress}</div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(receiveAddress);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            className={cx('mt-4 h-10 rounded-full px-5 text-sm font-bold transition', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}
          >
            {copied ? copy.copied : copy.copyAddress}
          </button>
          <p className={cx('mt-4 text-xs leading-5', isLight ? 'text-black/44' : 'text-white/44')}>{addressType === 'evm' ? copy.receiveEvmNote : copy.receiveCosmosNote}</p>
        </div>
      ) : (
        <div className="mx-auto mt-8 max-w-xl space-y-4">
          <div className={cx('grid grid-cols-2 rounded-xl border p-1', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/10 bg-white/[0.035]')}>
            {(['evm', 'cosmos'] as const).map((type) => (
              <button key={type} type="button" onClick={() => changeAddressType(type)} className={cx('h-9 rounded-lg text-xs font-bold transition', addressType === type ? isLight ? 'bg-white text-black shadow-sm' : 'bg-white/12 text-white' : isLight ? 'text-black/45' : 'text-white/45')}>
                {type === 'evm' ? copy.evmAddress : copy.cosmosAddress}
              </button>
            ))}
          </div>
          <label className="block">
            <span className={cx('text-xs font-bold', isLight ? 'text-black/52' : 'text-white/52')}>{copy.recipient}</span>
            <input value={recipient} onChange={(event) => { setRecipient(event.target.value); setReviewing(false); setGasEstimate(null); setError(''); }} placeholder={addressType === 'evm' ? '0x...' : 'inj1...'} className={cx('mt-2 h-12 w-full rounded-xl border bg-transparent px-4 font-mono text-sm outline-none transition focus:border-violet-400', isLight ? 'border-black/10' : 'border-white/12')} />
          </label>
          <label className="block">
            <span className={cx('text-xs font-bold', isLight ? 'text-black/52' : 'text-white/52')}>{copy.amount}</span>
            <div className={cx('mt-2 flex h-12 items-center rounded-xl border px-4', isLight ? 'border-black/10' : 'border-white/12')}>
              <input value={amount} onChange={(event) => { setAmount(event.target.value); setReviewing(false); setGasEstimate(null); setError(''); }} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <button type="button" onClick={() => void fillMaximumAmount()} disabled={maxLoading} className={cx('mr-3 rounded-md px-2 py-1 text-[10px] font-bold transition', isLight ? 'bg-black/5 text-black/60 hover:bg-black/9' : 'bg-white/8 text-white/62 hover:bg-white/12')}>{maxLoading ? '...' : 'MAX'}</button>
              <span className="text-xs font-bold">INJ</span>
            </div>
          </label>
          {reviewing && (
            <div className={cx('border-y px-1 py-4 text-sm', isLight ? 'border-black/8' : 'border-white/9')}>
              <div>Send <strong>{amount || '0'} INJ</strong> to <span className="font-mono">{truncateAddress(recipient)}</span>.</div>
              <div className={cx('mt-3 grid grid-cols-2 gap-3 text-xs', isLight ? 'text-black/52' : 'text-white/52')}>
                <span>{copy.gasLimit}<strong className="mt-1 block font-mono text-current">{estimatingGas ? '...' : gasEstimate?.gasLimit.toString() || '--'}</strong></span>
                <span>{copy.gasEstimate}<strong className="mt-1 block font-mono text-current">{estimatingGas ? '...' : gasEstimate ? `${Number(formatEther(gasEstimate.totalCost)).toFixed(8)} INJ` : '--'}</strong></span>
              </div>
            </div>
          )}
          {error && <div className={cx('text-sm leading-6', isLight ? 'text-rose-700' : 'text-rose-200')}>{error}</div>}
          {txHash && (
            <a href={`https://blockscout.injective.network/tx/${txHash}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-emerald-500 underline underline-offset-4">Transaction submitted: {txHash}</a>
          )}
          <button
            type="button"
            onClick={() => reviewing ? void submitTransfer() : void reviewTransfer()}
            disabled={submitting || estimatingGas || (reviewing && Boolean(error))}
            className={cx('h-11 w-full rounded-xl text-sm font-bold transition disabled:opacity-45', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}
          >
            {submitting ? copy.sending : estimatingGas ? copy.loading : reviewing ? copy.confirmAndSend : copy.reviewTransfer}
          </button>
        </div>
      )}
    </section>
  );
}

function NFTTransferPanel({
  nfts,
  address,
  privateKey,
  onRequirePrivateKey,
  isLight,
  onComplete,
  onBack,
  copy,
}: {
  nfts: NFT[];
  address: string | null;
  privateKey: Uint8Array | null;
  onRequirePrivateKey: () => Promise<Uint8Array>;
  isLight: boolean;
  onComplete: () => void;
  onBack: () => void;
  copy: ShellCopy;
}) {
  const [selectedKey, setSelectedKey] = useState(() => nfts[0] ? `${nfts[0].contractAddress}-${nfts[0].tokenId}` : '');
  const [recipient, setRecipient] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const selectedNft = nfts.find((nft) => `${nft.contractAddress}-${nft.tokenId}` === selectedKey) || nfts[0];

  const normalizeRecipient = (value: string): Address => {
    const normalized = value.trim().startsWith('inj1') ? getEthereumAddress(value.trim()) : value.trim();
    if (!isAddress(normalized, { strict: false })) throw new Error(copy.invalidRecipient);
    return normalized as Address;
  };

  const getTransferData = () => {
    if (!address || !selectedNft) throw new Error(!address ? copy.walletLocked : 'Select an NFT to send.');
    return encodeFunctionData({
      abi: erc721TransferAbi,
      functionName: 'safeTransferFrom',
      args: [address as Address, normalizeRecipient(recipient), BigInt(selectedNft.tokenId)],
    });
  };

  const localizeError = (transferError: unknown) => {
    const message = transferError instanceof Error ? transferError.message : String(transferError);
    if (/insufficient|funds for gas|balance/i.test(message)) return copy.insufficientBalance;
    if (/owner|approved|authorization/i.test(message)) return 'This wallet is not authorized to transfer the selected NFT.';
    if (/invalid (?:evm |cosmos )?(?:recipient )?address|address (?:is )?invalid|invalid recipient|checksum/i.test(message)) return copy.invalidRecipient;
    if (/rejected|denied|cancelled|canceled/i.test(message)) return 'The transaction was cancelled.';
    if (/nonce|fee|max fee|underpriced|gas price/i.test(message)) return 'The network rejected the transaction fee. Refresh the estimate and try again.';
    if (/revert|execution/i.test(message)) return 'The NFT contract rejected this transfer. Refresh ownership and try again.';
    return 'Unable to send this NFT right now. Refresh the wallet and try again.';
  };

  const reviewTransfer = async () => {
    setReviewing(true);
    setEstimatingGas(true);
    setGasEstimate(null);
    setError('');
    setTxHash('');
    try {
      const data = getTransferData();
      setGasEstimate(await estimateGas(address!, selectedNft.contractAddress, '0', data, INJECTIVE_MAINNET));
    } catch (reviewError) {
      setReviewing(false);
      setError(localizeError(reviewError));
    } finally {
      setEstimatingGas(false);
    }
  };

  const submitTransfer = async () => {
    setSubmitting(true);
    setError('');
    try {
      const data = getTransferData();
      const signingKey = privateKey || await onRequirePrivateKey();
      const hash = await sendTransaction(signingKey, selectedNft.contractAddress, '0', data, INJECTIVE_MAINNET);
      setTxHash(hash);
      setReviewing(false);
      onComplete();
    } catch (transferError) {
      setError(localizeError(transferError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl py-5">
      <div className={cx('flex items-end justify-between border-b pb-4', isLight ? 'border-black/8' : 'border-white/8')}>
        <div>
          <div className={cx('text-[11px] font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/38' : 'text-white/38')}>NFTs</div>
          <h2 className="inj-display-serif mt-1 text-3xl">{copy.send}</h2>
        </div>
        <button type="button" onClick={onBack} className={cx('h-9 rounded-full px-4 text-xs font-bold transition', isLight ? 'bg-black/5 hover:bg-black/8' : 'bg-white/8 hover:bg-white/12')}>{copy.back}</button>
      </div>

      {!address ? (
        <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/52' : 'text-white/52')}>Log in to send an NFT.</div>
      ) : nfts.length === 0 ? (
        <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/52' : 'text-white/52')}>No NFT is available to send.</div>
      ) : (
        <div className="mx-auto mt-8 max-w-xl space-y-5">
          <div>
            <div className={cx('mb-2 text-xs font-bold', isLight ? 'text-black/52' : 'text-white/52')}>Select NFT</div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {nfts.map((nft) => {
                const key = `${nft.contractAddress}-${nft.tokenId}`;
                const selected = key === selectedKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedKey(key);
                      setReviewing(false);
                      setGasEstimate(null);
                      setError('');
                    }}
                    className={cx('min-w-0 rounded-lg border p-2 text-left transition', selected ? 'border-violet-400 ring-2 ring-violet-400/15' : isLight ? 'border-black/9 hover:border-black/18' : 'border-white/11 hover:border-white/22')}
                  >
                    <div className={cx('relative aspect-square overflow-hidden rounded-md', isLight ? 'bg-black/5' : 'bg-white/7')}>
                      {nft.image ? <Image src={nft.image} alt={nft.name} fill sizes="120px" unoptimized className="object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] opacity-40">NFT</div>}
                    </div>
                    <div className="mt-2 truncate text-xs font-bold">{nft.name}</div>
                    <div className={cx('mt-0.5 truncate text-[10px]', isLight ? 'text-black/42' : 'text-white/42')}>#{nft.tokenId}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className={cx('text-xs font-bold', isLight ? 'text-black/52' : 'text-white/52')}>{copy.recipient}</span>
            <input
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setReviewing(false);
                setGasEstimate(null);
                setError('');
              }}
              placeholder="0x... or inj1..."
              className={cx('mt-2 h-12 w-full rounded-xl border bg-transparent px-4 font-mono text-sm outline-none transition focus:border-violet-400', isLight ? 'border-black/10' : 'border-white/12')}
            />
          </label>

          {reviewing && selectedNft && (
            <div className={cx('border-y px-1 py-4 text-sm', isLight ? 'border-black/8' : 'border-white/9')}>
              <div>Send <strong>{selectedNft.name}</strong> to <span className="font-mono">{truncateAddress(recipient)}</span>.</div>
              <div className={cx('mt-3 grid grid-cols-2 gap-3 text-xs', isLight ? 'text-black/52' : 'text-white/52')}>
                <span>{copy.gasLimit}<strong className="mt-1 block font-mono text-current">{estimatingGas ? '...' : gasEstimate?.gasLimit.toString() || '--'}</strong></span>
                <span>{copy.gasEstimate}<strong className="mt-1 block font-mono text-current">{estimatingGas ? '...' : gasEstimate ? `${Number(formatEther(gasEstimate.totalCost)).toFixed(8)} INJ` : '--'}</strong></span>
              </div>
            </div>
          )}
          {error && <div className={cx('text-sm leading-6', isLight ? 'text-rose-700' : 'text-rose-200')}>{error}</div>}
          {txHash && <a href={`https://blockscout.injective.network/tx/${txHash}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-emerald-500 underline underline-offset-4">Transaction submitted: {txHash}</a>}
          <button
            type="button"
            onClick={() => reviewing ? void submitTransfer() : void reviewTransfer()}
            disabled={submitting || estimatingGas || !selectedNft || (reviewing && Boolean(error))}
            className={cx('h-11 w-full rounded-xl text-sm font-bold transition disabled:opacity-45', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}
          >
            {submitting ? copy.sending : estimatingGas ? copy.loading : reviewing ? copy.confirmAndSend : copy.reviewTransfer}
          </button>
        </div>
      )}
    </section>
  );
}

function DAppMarketGrid({
  apps,
  supported,
  onOpenApp,
  onDragStart,
  onPointerDown,
  onPointerUp,
  isLight,
  copy,
}: {
  apps: DAppMarketItem[];
  supported: boolean;
  onOpenApp: (app: DAppMarketItem) => void;
  onDragStart: (event: DragEvent<HTMLElement>, app: DAppMarketItem) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, app: DAppMarketItem) => void;
  onPointerUp: () => void;
  isLight: boolean;
  copy: ShellCopy;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {apps.map((app, index) => {
        return (
          <article
            key={app.id}
            draggable={supported}
            onDragStart={supported ? (event) => onDragStart(event, app) : undefined}
            onPointerDown={supported ? (event) => onPointerDown(event, app) : undefined}
            onPointerUp={supported ? onPointerUp : undefined}
            className={cx(
              'inj-glass-surface group relative min-h-[168px] rounded-lg border p-4 text-left transition duration-300 motion-safe:animate-[injFadeUp_620ms_cubic-bezier(0.22,1,0.36,1)_both]',
              supported ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-70',
              isLight
                ? 'border-black/8 bg-white/70 hover:border-black/14 hover:bg-white/90'
                : 'border-white/10 bg-white/[0.045] hover:border-white/16 hover:bg-white/[0.075]'
            )}
            style={{ animationDelay: `${160 + index * 45}ms` }}
          >
            {supported ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenApp(app);
                }}
                className={cx(
                  'absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition hover:-translate-y-0.5',
                  isLight ? 'border-black/8 bg-white/80 text-black/50 hover:border-black/16 hover:text-black' : 'border-white/10 bg-black/24 text-white/54 hover:border-white/20 hover:text-white'
                )}
                aria-label={`Open ${app.name}`}
                title={`Open ${app.name}`}
              >
                <OpenAppIcon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className={cx('absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-bold', isLight ? 'bg-black/5 text-black/48' : 'bg-white/8 text-white/48')}>
                {copy.comingSoon}
              </span>
            )}
            <div className={cx('relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br text-sm font-black text-white', app.accent)}>
              <DAppLogo app={app} />
            </div>
            <div className="mt-5 pr-9">
              <div className="text-base font-bold">{app.name}</div>
              <div className={cx('mt-1 text-xs font-semibold', isLight ? 'text-black/42' : 'text-white/42')}>{app.category}</div>
            </div>
            <p className={cx('mt-3 text-xs leading-5', isLight ? 'text-black/58' : 'text-white/58')}>{app.body}</p>
          </article>
        );
      })}
    </div>
  );
}

function MiniAppTabStrip({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddApp,
  isLight,
  appsLabel,
}: {
  tabs: MiniAppBrowserTab[];
  activeTabId: string | null;
  onSelectTab: (tab: MiniAppBrowserTab) => void;
  onCloseTab: (tabId: string) => void;
  onAddApp: () => void;
  isLight: boolean;
  appsLabel: string;
}) {
  return (
    <div className={cx('flex h-10 shrink-0 items-end border-b px-2', isLight ? 'border-black/8 bg-[#ededf0]' : 'border-white/8 bg-[#161619]')}>
      <div role="tablist" aria-label="Open INJ Pass apps" className="flex min-w-0 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = activeTabId === tab.id;
          const label = tab.app?.name || appsLabel;
          return (
            <div
              key={tab.id}
              className={cx(
                'flex h-9 min-w-[150px] max-w-[260px] items-center rounded-t-md border-x border-t px-2.5 transition',
                active
                  ? isLight ? 'border-black/8 bg-white text-black' : 'border-white/9 bg-[#0d0d0f] text-white'
                  : isLight ? 'border-transparent bg-black/[0.025] text-black/55 hover:bg-black/[0.045]' : 'border-transparent bg-white/[0.025] text-white/55 hover:bg-white/[0.05]',
              )}
            >
              <button type="button" role="tab" aria-selected={active} onClick={() => onSelectTab(tab)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className={cx('relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md', isLight ? 'bg-black/5' : 'bg-white/8')}>
                  {tab.app ? <DAppLogo app={tab.app} /> : <DAppMarketIcon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{label}</span>
                {!tab.app && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
              </button>
              <button
                type="button"
                onClick={() => onCloseTab(tab.id)}
                className={cx('ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition', isLight ? 'hover:bg-black/6' : 'hover:bg-white/9')}
                aria-label={`Close ${label}`}
                title="Close app"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAddApp}
          className={cx('mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition', isLight ? 'text-black/48 hover:bg-black/7 hover:text-black' : 'text-white/48 hover:bg-white/9 hover:text-white')}
          aria-label="Open a new app tab"
          title="New app tab"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1" />
      <div className={cx('mb-2 mr-2 hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] sm:block', isLight ? 'text-black/34' : 'text-white/34')}>INJ Pass Apps</div>
    </div>
  );
}

function DAppMarketPanel({
  apps,
  tabs,
  activeTabId,
  onOpenApp,
  onSelectTab,
  onCloseTab,
  onAddApp,
  onDragStart,
  onPointerDown,
  onPointerUp,
  isLight,
  copy,
}: {
  apps: DAppMarketItem[];
  tabs: MiniAppBrowserTab[];
  activeTabId: string | null;
  onOpenApp: (app: DAppMarketItem) => void;
  onSelectTab: (tab: MiniAppBrowserTab) => void;
  onCloseTab: (tabId: string) => void;
  onAddApp: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, app: DAppMarketItem) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, app: DAppMarketItem) => void;
  onPointerUp: () => void;
  isLight: boolean;
  copy: ShellCopy;
}) {
  const supportedApps = apps.filter((app) => app.aiDriven);
  const comingSoonApps = comingSoonDAppOrder
    .map((name) => apps.find((app) => !app.aiDriven && normalizeDAppIdentity(app.name) === normalizeDAppIdentity(name)))
    .filter((app): app is DAppMarketItem => Boolean(app));
  const browserButtonClass = cx(
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-35',
    isLight ? 'text-black/62' : 'text-white/62',
  );

  return (
    <section
      className={cx(
        'relative mx-auto flex h-[calc(100dvh-7.15rem)] min-h-[620px] w-full max-w-[1440px] flex-col overflow-hidden rounded-lg border shadow-[0_20px_70px_rgba(0,0,0,0.09)] motion-safe:animate-[injFadeUp_520ms_cubic-bezier(0.22,1,0.36,1)_both]',
        isLight ? 'border-black/10 bg-[#f7f7f8] text-[#1d1d1f]' : 'border-white/10 bg-[#0d0d0f] text-white shadow-black/35'
      )}
    >
      <MiniAppTabStrip tabs={tabs} activeTabId={activeTabId} onSelectTab={onSelectTab} onCloseTab={onCloseTab} onAddApp={onAddApp} isLight={isLight} appsLabel={copy.dappMarket} />

      <div className={cx('flex h-12 shrink-0 items-center gap-1.5 border-b px-2 sm:px-3', isLight ? 'border-black/8 bg-white' : 'border-white/8 bg-[#0d0d0f]')}>
        <span className={browserButtonClass}><BrowserBackIcon /></span>
        <span className={browserButtonClass}><BrowserForwardIcon /></span>
        <span className={browserButtonClass}><ReloadIcon className="h-3.5 w-3.5" /></span>
        <span className={cx(browserButtonClass, 'hidden sm:flex')}><HomeIcon className="h-3.5 w-3.5" /></span>
        <div className={cx('flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 sm:px-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.045]')}>
          <ShieldCheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="min-w-0 truncate font-mono text-[11px] font-semibold">apps.injpass.com</span>
        </div>
        <div className={cx('hidden h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 md:flex', isLight ? 'border-black/8 text-black/58' : 'border-white/8 text-white/58')}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold">Injective</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className={cx('text-xs font-semibold uppercase tracking-[0.18em]', isLight ? 'text-black/42' : 'text-white/42')}>
              {copy.dappMarket}
            </div>
            <p className={cx('mt-2 max-w-2xl text-sm leading-6', isLight ? 'text-black/58' : 'text-white/58')}>
              Choose Injective apps for the agent to inspect, route, and operate with your approval.
            </p>
          </div>
          <div className={cx('text-xs font-semibold', isLight ? 'text-black/42' : 'text-white/42')}>
            {supportedApps.length} AgentOS
          </div>
        </div>

        <div className={cx('mb-3 mt-6 text-xs font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/52' : 'text-white/52')}>
          {copy.worksWithAgentOs}
        </div>
        <DAppMarketGrid apps={supportedApps} supported onOpenApp={onOpenApp} onDragStart={onDragStart} onPointerDown={onPointerDown} onPointerUp={onPointerUp} isLight={isLight} copy={copy} />

        <div className={cx('mb-3 mt-8 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/42' : 'text-white/42')}>
          <span>{copy.comingSoon}</span>
          <span>{comingSoonApps.length}</span>
        </div>
        <DAppMarketGrid apps={comingSoonApps} supported={false} onOpenApp={onOpenApp} onDragStart={onDragStart} onPointerDown={onPointerDown} onPointerUp={onPointerUp} isLight={isLight} copy={copy} />
      </div>
    </section>
  );
}

function MiniAppPanel({
  app,
  tabs,
  activeTabId,
  manifest,
  src,
  iframeKey,
  iframeRef,
  navigation,
  isLoading,
  address,
  walletName,
  isLight,
  onSelectTab,
  onCloseTab,
  onAddApp,
  onNavigate,
  onOpenWallet,
  onOpenExternal,
  onFrameLoad,
}: {
  app: DAppMarketItem;
  tabs: MiniAppBrowserTab[];
  activeTabId: string | null;
  manifest: MiniAppManifest;
  src: string;
  iframeKey: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  navigation: MiniAppNavigationState;
  isLoading: boolean;
  address: string | null;
  walletName?: string;
  isLight: boolean;
  onSelectTab: (tab: MiniAppBrowserTab) => void;
  onCloseTab: (tabId: string) => void;
  onAddApp: () => void;
  onNavigate: (action: MiniAppNavigationAction) => void;
  onOpenWallet: () => void;
  onOpenExternal: () => void;
  onFrameLoad: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const browserLocation = useMemo(() => {
    try {
      const url = new URL(src);
      return {
        host: url.host,
        origin: url.origin,
        isLocal: url.hostname === 'localhost' || url.hostname === '127.0.0.1',
      };
    } catch {
      return { host: src, origin: src, isLocal: false };
    }
  }, [src]);
  const visiblePath = navigation.path && navigation.path !== '/' ? navigation.path : '';
  const browserButtonClass = cx(
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md outline-none transition disabled:cursor-default disabled:opacity-25',
    isLight ? 'text-black/62 hover:bg-black/6 hover:text-black' : 'text-white/62 hover:bg-white/9 hover:text-white',
  );
  const openWallet = () => {
    setDetailsOpen(false);
    onOpenWallet();
  };

  return (
    <section
      className={cx(
        MINI_APP_PANEL_CLASS,
        isLight ? 'border-black/10 bg-[#f7f7f8]' : 'border-white/10 bg-[#0d0d0f] shadow-black/35',
      )}
    >
      <MiniAppTabStrip tabs={tabs} activeTabId={activeTabId} onSelectTab={onSelectTab} onCloseTab={onCloseTab} onAddApp={onAddApp} isLight={isLight} appsLabel="Apps" />

      <div className={cx('flex h-12 shrink-0 items-center gap-1.5 border-b px-2 sm:px-3', isLight ? 'border-black/8 bg-white' : 'border-white/8 bg-[#0d0d0f]')}>
        <button type="button" onClick={() => onNavigate('back')} disabled={!navigation.canGoBack} className={browserButtonClass} aria-label="Back" title="Back">
          <BrowserBackIcon />
        </button>
        <button type="button" onClick={() => onNavigate('forward')} disabled={!navigation.canGoForward} className={browserButtonClass} aria-label="Forward" title="Forward">
          <BrowserForwardIcon />
        </button>
        <button type="button" onClick={() => onNavigate('reload')} className={browserButtonClass} aria-label={`Reload ${app.name}`} title="Reload">
          <ReloadIcon className={cx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
        <button type="button" onClick={() => onNavigate('home')} className={cx(browserButtonClass, 'hidden sm:flex')} aria-label={`${app.name} home`} title="Home">
          <HomeIcon className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setDetailsOpen((current) => !current)}
          className={cx(
            'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 text-left outline-none transition sm:px-3',
            isLight ? 'border-black/8 bg-black/[0.025] hover:bg-black/[0.045]' : 'border-white/8 bg-white/[0.045] hover:bg-white/[0.065]',
          )}
          aria-expanded={detailsOpen}
          title={`${browserLocation.origin}${visiblePath}`}
        >
          <ShieldCheckIcon className={cx('h-3.5 w-3.5 shrink-0', browserLocation.isLocal ? 'text-amber-500' : 'text-emerald-500')} />
          <span className="min-w-0 truncate font-mono text-[11px]">
            <span className={cx('font-semibold', isLight ? 'text-black/72' : 'text-white/72')}>{browserLocation.host}</span>
            <span className={isLight ? 'text-black/42' : 'text-white/42'}>{visiblePath}</span>
          </span>
        </button>

        <div className={cx('hidden h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 md:flex', isLight ? 'border-black/8 text-black/58' : 'border-white/8 text-white/58')} title={`${manifest.networkName} · Chain ${manifest.chainId}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold">{manifest.networkName}</span>
        </div>

        <button
          type="button"
          onClick={openWallet}
          className={cx(
            'flex h-8 max-w-[180px] shrink-0 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold outline-none transition',
            address
              ? isLight ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100' : 'border-violet-300/18 bg-violet-300/10 text-violet-100 hover:bg-violet-300/15'
              : isLight ? 'border-black/10 text-black/68 hover:bg-black/5' : 'border-white/10 text-white/68 hover:bg-white/8',
          )}
          title={address ? `${walletName || 'INJ Pass'} · ${address}` : 'Connect an INJ Pass wallet'}
        >
          <WalletIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden min-w-0 truncate sm:block">
            {address ? walletName || truncateAddress(address) : 'Connect'}
          </span>
        </button>

        <button type="button" onClick={onOpenExternal} className={browserButtonClass} aria-label={`Open ${app.name} in a new tab`} title="Open in new tab">
          <OpenAppIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setDetailsOpen((current) => !current)} className={browserButtonClass} aria-label="App connection details" title="Connection details">
          <MoreIcon />
        </button>
      </div>

      <div className="relative h-0 shrink-0">
        <div className={cx('absolute inset-x-0 top-0 z-10 h-[2px] origin-left bg-violet-500 transition-opacity', isLoading ? 'animate-pulse opacity-100' : 'opacity-0')} />
      </div>

      {detailsOpen && (
        <>
          <button type="button" className="absolute inset-0 z-20 cursor-default" onClick={() => setDetailsOpen(false)} aria-label="Close connection details" />
          <div
            className={cx(
              'absolute right-3 top-[5.7rem] z-30 w-[min(340px,calc(100%-1.5rem))] rounded-lg border p-4 shadow-2xl backdrop-blur-2xl',
              isLight ? 'border-black/10 bg-white/96 text-black shadow-black/14' : 'border-white/12 bg-[#18181b]/96 text-white shadow-black/55',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold">App connection</div>
                <div className={cx('mt-1 text-xs', isLight ? 'text-black/48' : 'text-white/48')}>
                  {browserLocation.isLocal ? 'Local development origin' : 'Verified INJ Pass origin'}
                </div>
              </div>
              <ShieldCheckIcon className={cx('h-5 w-5', browserLocation.isLocal ? 'text-amber-500' : 'text-emerald-500')} />
            </div>
            <dl className={cx('mt-4 divide-y text-xs', isLight ? 'divide-black/8' : 'divide-white/9')}>
              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className={isLight ? 'text-black/42' : 'text-white/42'}>Origin</dt>
                <dd className="truncate text-right font-mono" title={browserLocation.origin}>{browserLocation.host}</dd>
              </div>
              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className={isLight ? 'text-black/42' : 'text-white/42'}>Network</dt>
                <dd className="text-right font-semibold">{manifest.networkName} · {manifest.chainId}</dd>
              </div>
              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className={isLight ? 'text-black/42' : 'text-white/42'}>Wallet</dt>
                <dd className="truncate text-right font-semibold" title={address || 'Guest'}>
                  {address ? `${walletName || 'INJ Pass'} · ${truncateAddress(address)}` : 'Not connected'}
                </dd>
              </div>
              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className={isLight ? 'text-black/42' : 'text-white/42'}>Access</dt>
                <dd className="text-right font-semibold">{manifest.permissions.join(', ')}</dd>
              </div>
              <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className={isLight ? 'text-black/42' : 'text-white/42'}>Contracts</dt>
                <dd className="text-right font-semibold">{manifest.allowedContracts?.length || 0} allowlisted</dd>
              </div>
            </dl>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={openWallet}
                className={cx('h-8 rounded-md px-3 text-xs font-bold transition', isLight ? 'bg-black text-white hover:bg-black/80' : 'bg-white text-black hover:bg-white/84')}
              >
                {address ? 'Switch wallet' : 'Connect wallet'}
              </button>
            </div>
          </div>
        </>
      )}

      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={src}
        title={`${app.name} mini app`}
        allow="clipboard-read; clipboard-write; publickey-credentials-get; publickey-credentials-create"
        onLoad={onFrameLoad}
        className={MINI_APP_FRAME_CLASS}
      />
    </section>
  );
}

function CampaignPanel({
  isLight,
  copy,
}: {
  isLight: boolean;
  copy: ShellCopy;
}) {
  return (
    <section className="mx-auto mt-8 flex min-h-[55vh] w-full max-w-4xl flex-col py-6">
      <div className={cx('text-xs font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/42' : 'text-white/42')}>
        {copy.campaign}
      </div>
      <div className="flex flex-1 items-center justify-center">
        <h2 className={cx('inj-display-serif text-4xl sm:text-5xl', isLight ? 'text-black/70' : 'text-white/70')}>
          {copy.comingSoon}
        </h2>
      </div>
    </section>
  );
}

function ConversationSearchModal({
  open,
  isAuthenticated,
  isLight,
  copy,
  query,
  inputRef,
  results,
  loading,
  onQuery,
  onClose,
  onOpenConversation,
}: {
  open: boolean;
  isAuthenticated: boolean;
  isLight: boolean;
  copy: ShellCopy;
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  results: StoredConversationSearchResult[];
  loading: boolean;
  onQuery: (query: string) => void;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
}) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let revealFrame = 0;
    if (open) {
      const mountFrame = window.requestAnimationFrame(() => {
        setRendered(true);
        revealFrame = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(mountFrame);
        if (revealFrame) window.cancelAnimationFrame(revealFrame);
      };
    }

    const hideFrame = window.requestAnimationFrame(() => setVisible(false));
    const timer = window.setTimeout(() => setRendered(false), 240);
    return () => {
      window.cancelAnimationFrame(hideFrame);
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!rendered) return null;
  return (
    <OverlayPortal enabled>
      <div
        className={cx(
          'fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm transition-opacity duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onMouseDown={onClose}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={copy.searchChats}
          className={cx(
            'inj-glass-surface w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.985] opacity-0',
            isLight ? 'border-black/9 bg-white/94 text-black shadow-black/14' : 'border-white/11 bg-[#171719]/94 text-white shadow-black/50',
          )}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={cx('flex items-center gap-3 border-b px-5 py-4', isLight ? 'border-black/8' : 'border-white/9')}>
            <SearchIcon className={cx('h-5 w-5 shrink-0', isLight ? 'text-black/38' : 'text-white/40')} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder={copy.searchAllMessages}
              className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:opacity-38"
            />
            {query && <button type="button" onClick={() => onQuery('')} className={cx('flex h-8 w-8 items-center justify-center rounded-full', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')} aria-label="Clear search"><CloseIcon className="h-4 w-4" /></button>}
            <button type="button" onClick={onClose} className={cx('h-8 rounded-full px-3 text-xs font-bold', isLight ? 'bg-black/5 hover:bg-black/8' : 'bg-white/8 hover:bg-white/12')}>{copy.close}</button>
          </div>
          <div className="max-h-[58vh] min-h-[260px] overflow-y-auto px-3 py-3">
            {!isAuthenticated ? (
              <div className={cx('flex min-h-[240px] items-center justify-center text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{copy.searchLogin}</div>
            ) : loading ? (
              <div className={cx('flex min-h-[240px] items-center justify-center text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{copy.loading}...</div>
            ) : results.length > 0 ? results.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpenConversation(conversation.id)}
                className={cx('block w-full rounded-xl px-4 py-3 text-left transition', isLight ? 'hover:bg-black/[0.035]' : 'hover:bg-white/[0.055]')}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-sm font-bold">{conversation.title || 'New chat'}</span>
                  <span className={cx('shrink-0 text-[10px] font-semibold', isLight ? 'text-black/35' : 'text-white/35')}>{formatShortDate(conversation.updatedAt)}</span>
                </div>
                {conversation.snippets?.slice(0, 2).map((snippet, index) => (
                  <p key={`${conversation.id}-${index}`} className={cx('mt-1 line-clamp-2 text-xs leading-5', isLight ? 'text-black/48' : 'text-white/48')}>
                    <strong className="mr-1 font-semibold">{snippet.role === 'user' ? 'You' : 'INJ Pass'}:</strong>{snippet.content}
                  </p>
                ))}
              </button>
            )) : (
              <div className={cx('flex min-h-[240px] items-center justify-center text-sm', isLight ? 'text-black/42' : 'text-white/42')}>{copy.searchNoResults}</div>
            )}
          </div>
        </section>
      </div>
    </OverlayPortal>
  );
}

function CloudDrivePanel({
  isLight,
  copy,
  isAuthenticated,
  address,
  onRequirePrivateKey,
}: {
  isLight: boolean;
  copy: ShellCopy;
  isAuthenticated: boolean;
  address: string | null;
  onRequirePrivateKey: () => Promise<Uint8Array>;
}) {
  const [drive, setDrive] = useState<CloudDriveState | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadDrive = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      setDrive(await getCloudDrive());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.agentUnavailable);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrive();
    // Drive ownership changes only with the authenticated address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, address]);

  const updateFile = (nextFile: CloudDriveFile) => {
    setDrive((current) => current ? {
      ...current,
      files: current.files.map((file) => file.id === nextFile.id ? nextFile : file),
    } : current);
  };

  const anchorFile = async (file: CloudDriveFile, unlockedKey?: Uint8Array) => {
    if (!address) throw new Error(copy.cloudDriveLogin);
    setBusyFileId(file.id);
    setStatus(copy.cloudDriveAnchoring);
    const signingKey = unlockedKey || await onRequirePrivateKey();
    const proof = stringToHex(`INJPASS_DRIVE_V1:${file.id}:${file.contentHash}`);
    const transactionHash = await sendTransaction(signingKey, address, '0', proof, INJECTIVE_MAINNET);
    updateFile(await markCloudDriveFileAnchored(file.id, transactionHash));
    setStatus('');
    setBusyFileId(null);
  };

  const uploadFile = async (file: File) => {
    if (!address || !drive) return;
    if (file.size + drive.usedBytes > drive.quotaBytes) {
      setError('This file does not fit in the remaining Cloud Drive space.');
      return;
    }
    setError('');
    setBusyFileId('upload');
    try {
      setStatus(copy.cloudDriveEncrypting);
      const signingKey = await onRequirePrivateKey();
      const encrypted = await encryptCloudDriveFile(file, signingKey, address);
      setStatus(copy.cloudDriveUploading);
      const uploaded = await uploadCloudDriveFile(encrypted);
      setDrive((current) => current ? {
        ...current,
        usedBytes: current.usedBytes + uploaded.encryptedSize,
        files: [uploaded, ...current.files],
      } : current);
      setSelectedFileId(uploaded.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : copy.agentUnavailable);
    } finally {
      setStatus('');
      setBusyFileId(null);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const downloadFile = async (file: CloudDriveFile) => {
    if (!address) return;
    setBusyFileId(file.id);
    setError('');
    try {
      const signingKey = await onRequirePrivateKey();
      const ciphertext = await downloadCloudDriveCiphertext(file.id);
      const plaintext = await decryptCloudDriveFile(ciphertext, file, signingKey, address);
      const url = URL.createObjectURL(plaintext);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : copy.agentUnavailable);
    } finally {
      setBusyFileId(null);
    }
  };

  const removeFile = async (file: CloudDriveFile) => {
    if (!window.confirm(`${copy.cloudDriveDelete} “${file.name}”?`)) return;
    setBusyFileId(file.id);
    setError('');
    try {
      await deleteCloudDriveFile(file.id);
      setDrive((current) => current ? {
        ...current,
        usedBytes: Math.max(0, current.usedBytes - file.encryptedSize),
        files: current.files.filter((item) => item.id !== file.id),
      } : current);
      if (selectedFileId === file.id) setSelectedFileId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : copy.agentUnavailable);
    } finally {
      setBusyFileId(null);
    }
  };

  if (!isAuthenticated) {
    return <section className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center py-24"><p className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{copy.cloudDriveLogin}</p></section>;
  }

  const selectedFile = drive?.files.find((file) => file.id === selectedFileId) || null;
  return (
    <section className="mx-auto mt-6 w-full max-w-4xl pb-24">
      <div className={cx('flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between', isLight ? 'border-black/8' : 'border-white/10')}>
        <div className="min-w-0">
          <div className={cx('text-xs font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/42' : 'text-white/42')}>{copy.createSpace}</div>
          <p className={cx('mt-2 text-sm', isLight ? 'text-black/52' : 'text-white/52')}>{copy.cloudDriveCaption}</p>
          <p className={cx('mt-1 text-[11px]', isLight ? 'text-black/36' : 'text-white/36')}>{formatBytes(drive?.usedBytes || 0)} / {formatBytes(drive?.quotaBytes || 100 * 1024 * 1024)}</p>
        </div>
        <div className="flex items-center gap-1 sm:justify-end">
          <button type="button" onClick={() => void loadDrive()} disabled={loading} className={cx('h-9 rounded-full px-3 text-xs font-bold disabled:opacity-45', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>{loading ? copy.loading : copy.refresh}</button>
          <button type="button" onClick={() => selectedFile && void downloadFile(selectedFile)} disabled={!selectedFile || busyFileId === selectedFile?.id} className={cx('h-9 rounded-full px-3 text-xs font-bold disabled:opacity-35', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>{copy.cloudDriveDownload}</button>
          <label className={cx('inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>
            <PlusIcon className="h-3.5 w-3.5" />{copy.cloudDriveUpload}
            <input ref={uploadInputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
          </label>
        </div>
      </div>
      {drive?.files.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 pt-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {drive.files.map((file) => {
            const selected = selectedFileId === file.id;
            const extension = file.name.includes('.') ? file.name.split('.').pop()?.slice(0, 5) : 'FILE';
            return (
              <div
                key={file.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setSelectedFileId(file.id)}
                onDoubleClick={() => void downloadFile(file)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedFileId(file.id);
                  }
                }}
                className={cx(
                  'group relative min-w-0 rounded-lg px-2 py-3 text-center outline-none transition',
                  selected
                    ? isLight ? 'bg-violet-100/65 ring-1 ring-violet-300' : 'bg-violet-300/[0.1] ring-1 ring-violet-300/35'
                    : isLight ? 'hover:bg-black/[0.035]' : 'hover:bg-white/[0.05]',
                )}
              >
                <div className={cx('mx-auto flex h-20 w-16 items-end justify-center rounded-md border pb-3 text-[10px] font-black uppercase', isLight ? 'border-black/10 bg-white text-black/42 shadow-sm' : 'border-white/12 bg-white/[0.055] text-white/48')}>
                  {extension}
                </div>
                <strong className="mt-3 block truncate text-xs">{file.name}</strong>
                <span className={cx('mt-1 block text-[10px]', isLight ? 'text-black/38' : 'text-white/38')}>{formatBytes(file.plaintextSize)}</span>
                <span className={cx('absolute left-2 top-2 h-2 w-2 rounded-full', file.status === 'anchored' ? 'bg-emerald-500' : 'bg-amber-400')} title={file.status === 'anchored' ? copy.cloudDriveAnchored : copy.cloudDriveStored} />
                <div className="absolute right-1 top-1 flex opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  {file.status !== 'anchored' && (
                    <button type="button" disabled={busyFileId === file.id} onClick={(event) => { event.stopPropagation(); void anchorFile(file).catch((anchorError) => { setError(anchorError instanceof Error ? anchorError.message : copy.agentUnavailable); setBusyFileId(null); setStatus(''); }); }} className={cx('h-7 rounded-full px-2 text-[9px] font-bold', isLight ? 'bg-white/90 hover:bg-white' : 'bg-[#222225]/95 hover:bg-[#2a2a2e]')} title={copy.cloudDriveAnchor}>{copy.cloudDriveAnchor}</button>
                  )}
                  <button type="button" disabled={busyFileId === file.id} onClick={(event) => { event.stopPropagation(); void removeFile(file); }} className={cx('flex h-7 w-7 items-center justify-center rounded-full', isLight ? 'bg-white/90 text-rose-600 hover:bg-white' : 'bg-[#222225]/95 text-rose-200 hover:bg-[#2a2a2e]')} aria-label={copy.cloudDriveDelete} title={copy.cloudDriveDelete}><TrashIcon className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : !loading && <div className={cx('py-24 text-center text-sm', isLight ? 'text-black/40' : 'text-white/40')}>{copy.cloudDriveEmpty}</div>}
      {(status || error) && <p className={cx('mt-4 text-center text-xs leading-5', error ? isLight ? 'text-rose-700' : 'text-rose-200' : isLight ? 'text-black/46' : 'text-white/46')}>{error || status}</p>}
    </section>
  );
}

function SkillsPanel({
  isLight,
  copy,
  skills,
  canCreate,
  onCreate,
  onUse,
}: {
  isLight: boolean;
  copy: ShellCopy;
  skills: AgentSkill[];
  canCreate: boolean;
  onCreate: (skill: AgentSkill) => void;
  onUse: (prompt: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const [appFilterMenuOpen, setAppFilterMenuOpen] = useState(false);
  const [appFilterMenuIndex, setAppFilterMenuIndex] = useState(0);
  const [sortMode, setSortMode] = useState<'popular' | 'name'>('popular');
  const [creating, setCreating] = useState(false);
  const [draftSkill, setDraftSkill] = useState({ name: '', app: 'INJ Gift', body: '', prompt: '' });
  const appFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const appFilterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const appOptions = useMemo(
    () => Array.from(new Set(skills.map((skill) => skill.app))).sort((left, right) => left.localeCompare(right)),
    [skills],
  );
  const appFilterOptions = useMemo(() => [
    { value: 'all', label: 'All applications', count: skills.length },
    ...appOptions.map((app) => ({
      value: app,
      label: app,
      count: skills.filter((skill) => skill.app === app).length,
    })),
  ], [appOptions, skills]);
  const selectedAppFilter = appFilterOptions.find((option) => option.value === appFilter) || appFilterOptions[0];
  const visibleSkills = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return skills
      .filter((skill) => appFilter === 'all' || skill.app === appFilter)
      .filter((skill) => !keyword || `${skill.name} ${skill.app} ${skill.body}`.toLocaleLowerCase().includes(keyword))
      .sort((left, right) => {
        if (Boolean(left.official) !== Boolean(right.official)) return left.official ? -1 : 1;
        return sortMode === 'name'
          ? left.name.localeCompare(right.name)
          : right.popularity - left.popularity;
      });
  }, [appFilter, query, skills, sortMode]);

  useEffect(() => {
    if (!appFilterMenuOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || appFilterMenuRef.current?.contains(target)) return;
      setAppFilterMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [appFilterMenuOpen]);

  const openAppFilterMenu = () => {
    setAppFilterMenuIndex(Math.max(0, appFilterOptions.findIndex((option) => option.value === appFilter)));
    setAppFilterMenuOpen((current) => !current);
  };

  const selectAppFilter = (value: string) => {
    setAppFilter(value);
    setAppFilterMenuOpen(false);
    window.requestAnimationFrame(() => appFilterTriggerRef.current?.focus());
  };

  const handleAppFilterKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!appFilterMenuOpen) {
        setAppFilterMenuOpen(true);
        setAppFilterMenuIndex(Math.max(0, appFilterOptions.findIndex((option) => option.value === appFilter)));
        return;
      }
      setAppFilterMenuIndex((current) => event.key === 'ArrowDown'
        ? (current + 1) % appFilterOptions.length
        : (current - 1 + appFilterOptions.length) % appFilterOptions.length);
      return;
    }
    if (event.key === 'Enter' && appFilterMenuOpen) {
      event.preventDefault();
      selectAppFilter(appFilterOptions[appFilterMenuIndex]?.value || 'all');
      return;
    }
    if (event.key === 'Escape' && appFilterMenuOpen) {
      event.preventDefault();
      setAppFilterMenuOpen(false);
    }
  };

  const saveSkill = () => {
    const name = draftSkill.name.trim();
    const app = draftSkill.app.trim();
    const body = draftSkill.body.trim();
    const prompt = draftSkill.prompt.trim();
    if (!name || !app || !body || !prompt) return;
    onCreate({
      id: `custom-${Date.now()}-${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      app,
      body,
      prompt,
      popularity: 0,
      custom: true,
    });
    setDraftSkill({ name: '', app: 'INJ Gift', body: '', prompt: '' });
    setCreating(false);
  };

  return (
    <section className="mx-auto mt-7 w-full max-w-4xl py-5 motion-safe:animate-[injFadeUp_680ms_cubic-bezier(0.22,1,0.36,1)_140ms_both]">
      <div className={cx('border-b pb-5', isLight ? 'border-black/8' : 'border-white/10')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className={cx('text-xs font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/42' : 'text-white/42')}>{copy.skills}</div>
            <p className={cx('mt-2 text-sm leading-6', isLight ? 'text-black/58' : 'text-white/58')}>{copy.skillsCaption}</p>
          </div>
          <button
            type="button"
            onClick={() => canCreate && setCreating((current) => !current)}
            disabled={!canCreate}
            className={cx('h-9 rounded-full border px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40', isLight ? 'border-black/12 hover:bg-black hover:text-white' : 'border-white/14 hover:bg-white hover:text-black')}
          >
            {canCreate ? 'Create skill' : 'Log in to create'}
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_210px_auto]">
          <label className={cx('flex h-10 items-center gap-2 border-b px-1', isLight ? 'border-black/12' : 'border-white/14')}>
            <SearchIcon className={cx('h-4 w-4', isLight ? 'text-black/38' : 'text-white/38')} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by skill, app, or capability" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-40" />
          </label>
          <div ref={appFilterMenuRef} className="relative z-[75]">
            <button
              ref={appFilterTriggerRef}
              type="button"
              role="combobox"
              aria-label="Filter skills by application"
              aria-controls="skills-application-filter"
              aria-expanded={appFilterMenuOpen}
              aria-haspopup="listbox"
              onClick={openAppFilterMenu}
              onKeyDown={handleAppFilterKeyDown}
              className={cx(
                'flex h-10 w-full items-center gap-2 border-b px-1 text-left text-sm outline-none transition',
                isLight ? 'border-black/12 hover:border-black/28' : 'border-white/14 hover:border-white/30',
              )}
            >
              <span className={cx('relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold', isLight ? 'bg-black/[0.055] text-black/56' : 'bg-white/[0.08] text-white/58')}>
                {appFilter === 'all' ? <DAppMarketIcon className="h-3.5 w-3.5" /> : (() => {
                  const app = dappMarketApps.find((item) => item.name === selectedAppFilter?.label);
                  return app ? <DAppLogo app={app} /> : selectedAppFilter?.label.slice(0, 2).toUpperCase();
                })()}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{selectedAppFilter?.label}</span>
              <ChevronDownIcon className={cx('h-3.5 w-3.5 shrink-0 transition-transform duration-200', appFilterMenuOpen && 'rotate-180', isLight ? 'text-black/38' : 'text-white/38')} />
            </button>

            {appFilterMenuOpen && (
              <div
                id="skills-application-filter"
                role="listbox"
                aria-label="Applications"
                className={cx(
                  'inj-glass-surface inj-liquid-menu absolute right-0 top-[calc(100%+8px)] z-[90] max-h-[360px] w-[min(290px,calc(100vw-3rem))] overflow-y-auto rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl motion-safe:animate-[injFadeDown_260ms_cubic-bezier(0.22,1,0.36,1)_both]',
                  isLight ? 'border-black/10 bg-white/96 text-black shadow-black/16' : 'border-white/12 bg-[#19191c]/96 text-white shadow-black/55',
                )}
              >
                <div className={cx('px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/38' : 'text-white/38')}>
                  Applications
                </div>
                {appFilterOptions.map((option, index) => {
                  const marketApp = option.value === 'all' ? null : dappMarketApps.find((item) => item.name === option.label);
                  const selected = option.value === appFilter;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onPointerDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setAppFilterMenuIndex(index)}
                      onClick={() => selectAppFilter(option.value)}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                        index === appFilterMenuIndex
                          ? isLight ? 'bg-black/[0.065]' : 'bg-white/[0.1]'
                          : isLight ? 'hover:bg-black/[0.04]' : 'hover:bg-white/[0.065]',
                      )}
                    >
                      <span className={cx('relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold', isLight ? 'bg-black/[0.055] text-black/56' : 'bg-white/[0.08] text-white/58')}>
                        {option.value === 'all'
                          ? <DAppMarketIcon className="h-4 w-4" />
                          : marketApp ? <DAppLogo app={marketApp} /> : option.label.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{option.label}</span>
                        <span className={cx('mt-0.5 block text-xs', isLight ? 'text-black/44' : 'text-white/44')}>
                          {option.count} {option.count === 1 ? 'skill' : 'skills'}
                        </span>
                      </span>
                      {selected && <CheckIcon className={cx('h-4 w-4 shrink-0', isLight ? 'text-violet-700' : 'text-violet-200')} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className={cx('grid grid-cols-2 rounded-lg border p-0.5', isLight ? 'border-black/10' : 'border-white/12')}>
            {(['popular', 'name'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setSortMode(mode)} className={cx('h-8 rounded-md px-3 text-xs font-bold capitalize transition', sortMode === mode ? isLight ? 'bg-black text-white' : 'bg-white text-black' : isLight ? 'text-black/45' : 'text-white/45')}>{mode}</button>
            ))}
          </div>
        </div>
      </div>

      {creating && (
        <div className={cx('grid gap-3 border-b py-5 sm:grid-cols-2', isLight ? 'border-black/8' : 'border-white/9')}>
          <input value={draftSkill.name} onChange={(event) => setDraftSkill((current) => ({ ...current, name: event.target.value }))} placeholder="Skill name" className={cx('h-10 border-b bg-transparent px-1 text-sm outline-none', isLight ? 'border-black/12' : 'border-white/14')} />
          <input value={draftSkill.app} onChange={(event) => setDraftSkill((current) => ({ ...current, app: event.target.value }))} placeholder="Application" className={cx('h-10 border-b bg-transparent px-1 text-sm outline-none', isLight ? 'border-black/12' : 'border-white/14')} />
          <input value={draftSkill.body} onChange={(event) => setDraftSkill((current) => ({ ...current, body: event.target.value }))} placeholder="What this skill does" className={cx('h-10 border-b bg-transparent px-1 text-sm outline-none sm:col-span-2', isLight ? 'border-black/12' : 'border-white/14')} />
          <textarea value={draftSkill.prompt} onChange={(event) => setDraftSkill((current) => ({ ...current, prompt: event.target.value }))} placeholder="AgentOS instruction" className={cx('min-h-24 resize-none border-b bg-transparent px-1 py-2 text-sm outline-none sm:col-span-2', isLight ? 'border-black/12' : 'border-white/14')} />
          <div className="flex gap-2 sm:col-span-2 sm:justify-end">
            <button type="button" onClick={() => setCreating(false)} className={cx('h-9 rounded-full px-4 text-xs font-bold', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>Cancel</button>
            <button type="button" onClick={saveSkill} className={cx('h-9 rounded-full px-4 text-xs font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Save skill</button>
          </div>
        </div>
      )}

      <div className={cx('divide-y', isLight ? 'divide-black/8' : 'divide-white/9')}>
        {visibleSkills.map((skill) => (
          <div key={skill.id} className="grid gap-3 py-5 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
            <div className={cx('flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold', skill.official ? isLight ? 'border-violet-300 text-violet-700' : 'border-violet-300/35 text-violet-200' : isLight ? 'border-black/10 text-black/46' : 'border-white/12 text-white/48')}>
              {skill.app.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-bold">{skill.name}</div>
                <span className={cx('text-[10px] font-bold', isLight ? 'text-black/38' : 'text-white/38')}>{skill.app}</span>
                {skill.official && <span className={cx('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]', isLight ? 'bg-violet-100/55 text-violet-700' : 'bg-violet-300/[0.08] text-violet-200')}>Injective official</span>}
              </div>
              <div className={cx('mt-1 text-xs leading-5', isLight ? 'text-black/50' : 'text-white/50')}>{skill.body}</div>
              {skill.custom && <div className={cx('mt-1 text-[10px] font-semibold', isLight ? 'text-black/32' : 'text-white/32')}>Created by you</div>}
            </div>
            <button
              type="button"
              onClick={() => onUse(skill.prompt)}
              className={cx('h-9 rounded-full border px-4 text-xs font-bold transition', isLight ? 'border-black/10 hover:bg-black hover:text-white' : 'border-white/12 hover:bg-white hover:text-black')}
            >
              {copy.useSkill}
            </button>
          </div>
        ))}
        {visibleSkills.length === 0 && <div className={cx('py-14 text-center text-sm', isLight ? 'text-black/42' : 'text-white/42')}>No skills match this search.</div>}
      </div>
    </section>
  );
}

function CreativeGraph({
  stage,
  nodes,
  onAccept,
  onRevise,
  isLight,
}: {
  stage: CreativeStage;
  nodes: CreativePlanNode[];
  edges: Array<[number, number]>;
  onAccept: () => void;
  onRevise: () => void;
  isLight: boolean;
}) {
  return (
    <section className="mx-auto mt-6 w-full max-w-3xl pb-28">
      <ol aria-label="AgentOS build roadmap">
        {nodes.map((node, index) => (
          <li
            key={`${index}-${node.title}`}
            className={cx(
              'relative grid grid-cols-[42px_minmax(0,1fr)] gap-4 py-4',
              index < nodes.length - 1 && (isLight ? 'border-b border-black/7' : 'border-b border-white/8')
            )}
          >
            {index < nodes.length - 1 && (
              <span className={cx('absolute left-[20px] top-12 h-[calc(100%-38px)] w-px', isLight ? 'bg-black/10' : 'bg-white/12')} aria-hidden="true" />
            )}
            <span className={cx('relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold', isLight ? 'border-black/14 bg-[#fbfbfa] text-black' : 'border-white/16 bg-[#111113] text-white')}>
              {index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <h3 className="text-base font-bold leading-6">{node.title}</h3>
              <p className={cx('mt-1 text-sm leading-6', isLight ? 'text-black/56' : 'text-white/56')}>{node.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {stage === 'plan' && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onAccept}
            className={cx(
              'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition',
              isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86'
            )}
          >
            <SparkIcon />
            Accept and build
          </button>
          <button
            type="button"
            onClick={onRevise}
            className={cx(
              'inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold transition',
              isLight ? 'border-black/10 bg-white text-black hover:bg-black/5' : 'border-white/12 bg-white/6 text-white hover:bg-white/10'
            )}
          >
            Revise idea
          </button>
        </div>
      )}
    </section>
  );
}

function CreativeCodeWorkspace({
  stage,
  build,
  error,
  compileResult,
  compileStatus,
  selectedFileIndex,
  onSelectFile,
  onRetry,
  isLight,
}: {
  stage: CreativeStage;
  build: CreativeBuild | null;
  error: string;
  compileResult: CreativeCompileResponse | null;
  compileStatus: CreativeCompileStatus;
  selectedFileIndex: number;
  onSelectFile: (index: number) => void;
  onRetry: () => void;
  isLight: boolean;
}) {
  const activeFile = build?.files[selectedFileIndex] || build?.files[0];
  const previewFile = build?.files.find((file) => (
    file.path.toLowerCase().endsWith('preview.html')
    || (file.language.toLowerCase() === 'html' && file.path.toLowerCase().includes('frontend'))
  ));
  const [workspaceView, setWorkspaceView] = useState<'code' | 'preview'>(() => (
    stage === 'published' && previewFile ? 'preview' : 'code'
  ));

  if (stage !== 'building' && stage !== 'published') {
    return null;
  }

  return (
    <section
      className={cx(
        'w-full min-w-0 overflow-hidden rounded-2xl border',
        isLight ? 'border-black/8 bg-white/88' : 'border-white/10 bg-[#141416]'
      )}
    >
      <div className={cx('flex items-center justify-between gap-4 border-b px-4 py-3', isLight ? 'border-black/8' : 'border-white/8')}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold">AgentOS workspace</h2>
          <p className={cx('mt-0.5 truncate text-xs', isLight ? 'text-black/46' : 'text-white/46')}>
            {stage === 'published' ? build?.summary || 'Source workspace generated' : 'Generating implementation files from the accepted plan'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className={cx('flex rounded-lg p-0.5', isLight ? 'bg-black/5' : 'bg-white/8')}>
            {(['code', 'preview'] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setWorkspaceView(view)}
                disabled={view === 'preview' && !previewFile}
                className={cx('h-7 rounded-md px-3 text-[11px] font-bold capitalize transition disabled:opacity-35', workspaceView === view ? isLight ? 'bg-white text-black shadow-sm' : 'bg-white/12 text-white' : isLight ? 'text-black/48' : 'text-white/48')}
              >
                {view}
              </button>
            ))}
          </div>
          <span className={cx('rounded-full px-3 py-1 text-[11px] font-bold', stage === 'published' ? isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-300/14 text-emerald-200' : isLight ? 'bg-black/5 text-black/58' : 'bg-white/8 text-white/58')}>
            {stage === 'published' ? 'Source ready' : 'Writing code'}
          </span>
        </div>
      </div>

      <div className="grid min-h-[470px] md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className={cx('border-b p-2 md:border-b-0 md:border-r', isLight ? 'border-black/8 bg-[#f7f7f5]' : 'border-white/8 bg-black/18')}>
          <div className={cx('px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em]', isLight ? 'text-black/38' : 'text-white/38')}>Files</div>
          {build?.files.map((file, index) => (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(index)}
              className={cx(
                'block w-full truncate rounded-lg px-2.5 py-2 text-left font-mono text-xs transition',
                index === selectedFileIndex
                  ? isLight ? 'bg-white text-black shadow-sm' : 'bg-white/10 text-white'
                  : isLight ? 'text-black/58 hover:bg-white/70' : 'text-white/54 hover:bg-white/6'
              )}
            >
              {file.path}
            </button>
          ))}
          {!build && (
            <div className={cx('px-2 py-3 text-xs leading-5', isLight ? 'text-black/42' : 'text-white/42')}>
              The file manifest will appear when AgentOS finishes generating the workspace.
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {workspaceView === 'preview' && previewFile ? (
            <div className={cx('min-h-[470px] p-3', isLight ? 'bg-[#f2f2ef]' : 'bg-[#0e0e10]')}>
              <iframe
                title="Generated frontend preview"
                srcDoc={previewFile.content}
                sandbox="allow-scripts allow-forms"
                className="h-[570px] w-full rounded-lg border-0 bg-white"
              />
            </div>
          ) : activeFile ? (
            <>
              <div className={cx('flex items-center justify-between border-b px-4 py-2 font-mono text-xs', isLight ? 'border-black/8 text-black/62' : 'border-white/8 text-white/62')}>
                <span className="truncate">{activeFile.path}</span>
                <span className="ml-3 shrink-0 opacity-55">{activeFile.language}</span>
              </div>
              <pre className={cx('max-h-[620px] min-h-[430px] overflow-auto py-3 text-[12px] leading-5', isLight ? 'bg-[#fcfcfb] text-[#242426]' : 'bg-[#101012] text-[#e8e8eb]')}>
                <code>
                  {activeFile.content.split('\n').map((line, index) => (
                    <span key={`${index}-${line}`} className="grid grid-cols-[46px_minmax(max-content,1fr)] px-3">
                      <span className={cx('select-none pr-4 text-right', isLight ? 'text-black/24' : 'text-white/22')}>{index + 1}</span>
                      <span>{line || ' '}</span>
                    </span>
                  ))}
                </code>
              </pre>
            </>
          ) : (
            <div className="flex min-h-[470px] items-center justify-center px-6 text-center">
              <div>
                <div className={cx('mx-auto h-2 w-2 rounded-full motion-safe:animate-pulse', error ? 'bg-amber-500' : 'bg-emerald-500')} />
                <p className="mt-4 text-sm font-semibold">{error || 'AgentOS is writing the project source.'}</p>
                <p className={cx('mx-auto mt-2 max-w-sm text-xs leading-5', isLight ? 'text-black/46' : 'text-white/46')}>
                  The generated files come from the accepted architecture. Compilation and deployment have not run yet.
                </p>
                {error && (
                  <button type="button" onClick={onRetry} className={cx('mt-4 h-9 rounded-full px-4 text-xs font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>
                    Retry source generation
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {build && (
        <div className={cx('border-t px-4 py-3 text-xs leading-5', isLight ? 'border-black/8 text-black/52' : 'border-white/8 text-white/52')}>
          {compileStatus === 'compiling' && 'Compiling generated Solidity contracts...'}
          {compileStatus === 'success' && `${compileResult?.contracts?.length || 0} contract artifact(s) compiled with ${compileResult?.compilerVersion || 'solc'}. ABI and bytecode are ready; no deployment has been performed.`}
          {compileStatus === 'error' && (
            <span className={isLight ? 'text-amber-800' : 'text-amber-200'}>
              {compileResult?.diagnostics?.find((item) => item.severity === 'error')?.message || compileResult?.error || 'Contract compilation failed.'}
            </span>
          )}
          {compileStatus === 'unsupported' && 'Frontend preview is ready. No Solidity source was generated, so the EVM compiler was not run.'}
          {compileStatus === 'idle' && 'Source is being prepared. Compilation and deployment have not run yet.'}
        </div>
      )}
    </section>
  );
}

function CreativeProgressMenu({
  steps,
  currentIndex,
  stage,
  open,
  error,
  onToggle,
  isLight,
}: {
  steps: CreativePlanNode[];
  currentIndex: number;
  stage: CreativeStage;
  open: boolean;
  error: string;
  onToggle: () => void;
  isLight: boolean;
}) {
  if ((stage !== 'building' && stage !== 'published') || steps.length === 0) return null;
  const isComplete = stage === 'published';
  const currentStepNumber = isComplete ? steps.length : Math.min(currentIndex + 1, steps.length);
  const currentTitle = error
    ? 'Source generation paused'
    : isComplete
      ? 'Source generation complete'
      : steps[Math.min(currentIndex, steps.length - 1)]?.title;

  return (
    <aside className={cx('w-full overflow-hidden rounded-2xl border shadow-sm backdrop-blur-xl lg:sticky lg:top-24', isLight ? 'border-black/8 bg-white/88 shadow-black/[0.04]' : 'border-white/10 bg-[#19191c]/88 shadow-black/25')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/30">
        <span className={cx('text-xs font-bold', error ? 'text-amber-600' : isComplete ? 'text-emerald-600' : isLight ? 'text-black/58' : 'text-white/58')}>
          {currentStepNumber} / {steps.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{currentTitle}</span>
        <ChevronDownIcon className={cx('h-3.5 w-3.5 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <div className={cx('h-0.5 w-full', isLight ? 'bg-black/6' : 'bg-white/8')}>
        <div className={cx('h-full transition-[width] duration-700', error ? 'bg-amber-500' : isComplete ? 'bg-emerald-500' : 'bg-violet-500')} style={{ width: `${(currentStepNumber / steps.length) * 100}%` }} />
      </div>
      <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <ol className={cx('max-h-[420px] overflow-y-auto border-t px-3 py-2', isLight ? 'border-black/6' : 'border-white/8')}>
            {steps.map((step, index) => {
              const done = isComplete || index < currentIndex;
              const running = !isComplete && !error && index === currentIndex;
              return (
                <li key={`${index}-${step.title}`} className={cx('flex items-center gap-3 rounded-lg px-2 py-2 text-xs', running ? isLight ? 'bg-black/[0.04]' : 'bg-white/[0.06]' : '')}>
                  <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold', done ? 'border-emerald-500 bg-emerald-500 text-white' : running ? 'border-violet-500 text-violet-500' : isLight ? 'border-black/12 text-black/34' : 'border-white/14 text-white/34')}>
                    {done ? 'OK' : index + 1}
                  </span>
                  <span className={cx('min-w-0 flex-1 truncate font-semibold', done || running ? '' : isLight ? 'text-black/38' : 'text-white/38')}>{step.title}</span>
                  <span className={cx('shrink-0 text-[10px]', done ? 'text-emerald-600' : running ? 'text-violet-500' : isLight ? 'text-black/28' : 'text-white/28')}>
                    {done ? 'Generated' : running ? 'Generating' : 'Queued'}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </aside>
  );
}

function normalizeWalletInviteCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function readInviteCodeFromLocation() {
  if (typeof window === 'undefined') return '';
  return normalizeWalletInviteCode(
    new URLSearchParams(window.location.search).get('invite') || '',
  );
}

function WalletSetupWizard({
  open,
  method,
  mode,
  step,
  walletName,
  password,
  passwordConfirm,
  recoveryMnemonic,
  preparedWalletAddress,
  inviteCode,
  inviteValidation,
  inviteValidationMessage,
  busy,
  error,
  prfDetection,
  isLight,
  onStep,
  onWalletName,
  onPassword,
  onPasswordConfirm,
  onRecoveryMnemonic,
  onInviteCode,
  onValidateInvite,
  onClearError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  method: WalletSetupMethod;
  mode: TraditionalWalletWizardMode;
  step: number;
  walletName: string;
  password: string;
  passwordConfirm: string;
  recoveryMnemonic: string;
  preparedWalletAddress: string | null;
  inviteCode: string;
  inviteValidation: InviteValidationState;
  inviteValidationMessage: string;
  busy: boolean;
  error: string;
  prfDetection: PrfDetection | null;
  isLight: boolean;
  onStep: (step: number) => void;
  onWalletName: (value: string) => void;
  onPassword: (value: string) => void;
  onPasswordConfirm: (value: string) => void;
  onRecoveryMnemonic: (value: string) => void;
  onInviteCode: (value: string) => void;
  onValidateInvite: () => void;
  onClearError: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  const isPasskey = method === 'passkey';
  const stages = isPasskey
    ? [
      { id: 'security', label: 'Security', title: 'Use your system Passkey', body: 'INJ Pass will ask this device to create a Passkey and require system verification.' },
      { id: 'name', label: 'Name', title: 'Name your INJ Pass', body: 'Choose a name that makes this wallet easy to recognize on this device.' },
      { id: 'invite', label: 'Invite', title: 'Have an invite code?', body: 'Apply an INJ Pass invite code to connect your account with the person who invited you. You can also skip this step.' },
      { id: 'review', label: 'Create', title: 'Ready to create', body: 'Review the wallet protection method before opening the system Passkey prompt.' },
    ]
    : mode === 'recover'
    ? [
      { id: 'phrase', label: 'Recovery phrase', title: 'Enter your 24 words', body: 'Use the words from your offline backup, in their original order.' },
      { id: 'name', label: 'Name', title: 'Name this wallet', body: 'This name is only used to identify the wallet on this device.' },
      { id: 'password', label: 'Protect', title: 'Set a local password', body: 'Your password encrypts the recovery phrase before it is stored in this browser.' },
      { id: 'review', label: 'Recover', title: 'Ready to recover', body: 'INJ Pass will derive the wallet locally and connect it to your current session.' },
    ]
    : [
      { id: 'name', label: 'Name', title: 'Name your INJ Pass', body: 'Choose a name that makes this wallet easy to recognize on this device.' },
      { id: 'password', label: 'Protect', title: 'Set a local password', body: 'Your password encrypts the new 24-word recovery phrase before it is stored in this browser.' },
      { id: 'invite', label: 'Invite', title: 'Have an invite code?', body: 'Apply an INJ Pass invite code to connect your account with the person who invited you. You can also skip this step.' },
      { id: 'review', label: 'Create', title: 'Ready to create', body: 'The wallet and its 24-word recovery phrase will be generated locally on this device.' },
    ];
  const activeStep = Math.min(step, stages.length - 1);
  const stage = stages[activeStep];
  const recoveryWordCount = recoveryMnemonic.trim()
    ? recoveryMnemonic.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const passwordLongEnough = password.length >= 10;
  const passwordsMatch = password.length > 0 && password === passwordConfirm;
  const canContinue = stage.id === 'phrase'
    ? recoveryWordCount === 24
    : stage.id === 'name'
      ? walletName.trim().length > 0
      : stage.id === 'password'
        ? passwordLongEnough && passwordsMatch
        : stage.id === 'invite'
          ? inviteValidation === 'valid'
        : true;
  const isFinalStep = activeStep === stages.length - 1;
  const usesPrf = prfDetection?.capabilityPrf === true;
  const passkeyProtectionLabel = prfDetection
    ? usesPrf ? 'Passkey PRF' : 'Passkey PRF (unconfirmed)'
    : 'Checking this device...';

  const advance = () => {
    if (busy || inviteValidation === 'checking') return;
    if (stage.id === 'invite' && inviteCode && inviteValidation !== 'valid') {
      onValidateInvite();
      return;
    }
    if (!canContinue) return;
    if (isFinalStep) {
      onSubmit();
      return;
    }
    onClearError();
    onStep(activeStep + 1);
  };

  return (
    <OverlayPortal enabled={open}>
      <div className="fixed inset-0 z-[122] flex items-center justify-center bg-black/46 p-4 backdrop-blur-md" onClick={busy ? undefined : onClose}>
        <form
          role="dialog"
          aria-modal="true"
          aria-label={isPasskey ? 'Create Passkey wallet' : mode === 'recover' ? 'Recover traditional wallet' : 'Create traditional wallet'}
          onSubmit={(event) => {
            event.preventDefault();
            advance();
          }}
          onClick={(event) => event.stopPropagation()}
          className={cx(
            'inj-glass-surface flex min-h-[520px] max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-7',
            isLight ? 'border-black/8 bg-white/98 text-black shadow-black/16' : 'border-white/10 bg-[#171719]/98 text-white shadow-black/60',
          )}
        >
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className={cx('text-[11px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-violet-700' : 'text-violet-300')}>{isPasskey ? 'Passkey wallet' : 'Traditional wallet'}</p>
              <h2 className="inj-display-serif mt-2 text-2xl sm:text-3xl">{stage.title}</h2>
              <p className={cx('mt-2 max-w-lg text-sm leading-6', isLight ? 'text-black/54' : 'text-white/54')}>{stage.body}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')} aria-label="Close wallet setup">
              <CloseIcon />
            </button>
          </div>

          <ol className="mt-7 flex items-start gap-2" aria-label="Wallet setup progress">
            {stages.map((item, index) => (
              <li key={item.id} className="min-w-0 flex-1">
                <div className={cx('h-0.5 w-full overflow-hidden rounded-full', isLight ? 'bg-black/8' : 'bg-white/10')}>
                  <div className={cx('h-full origin-left transition-transform duration-500', index <= activeStep ? 'scale-x-100 bg-violet-500' : 'scale-x-0 bg-violet-500')} />
                </div>
                <span className={cx('mt-2 block truncate text-[10px] font-bold sm:text-[11px]', index === activeStep ? '' : isLight ? 'text-black/32' : 'text-white/32')}>{index + 1}. {item.label}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-1 flex-col justify-center py-8 sm:px-8">
            {stage.id === 'security' && (
              <div>
                <div className={cx('divide-y border-y', isLight ? 'divide-black/8 border-black/8' : 'divide-white/10 border-white/10')}>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>System verification</span>
                    <strong className="text-right text-sm">Face ID, Touch ID, or device PIN</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>Wallet protection</span>
                    <strong className="text-right text-sm">{passkeyProtectionLabel}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>Recovery</span>
                    <strong className="text-right text-sm">{usesPrf ? 'System Passkey' : '24-word backup after creation'}</strong>
                  </div>
                </div>
                <p className={cx('mt-4 text-xs leading-5', isLight ? 'text-black/46' : 'text-white/46')}>
                  The system prompt is the only place where biometric or device verification happens. INJ Pass never receives biometric data.
                </p>
              </div>
            )}

            {stage.id === 'phrase' && (
              <label className="block">
                <span className="text-sm font-bold">24-word recovery phrase</span>
                <textarea
                  autoFocus
                  value={recoveryMnemonic}
                  onChange={(event) => {
                    onRecoveryMnemonic(event.target.value);
                    onClearError();
                  }}
                  rows={5}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Enter all 24 words in order"
                  className={cx('mt-3 w-full resize-none rounded-xl border bg-transparent px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-violet-400', isLight ? 'border-black/12' : 'border-white/14')}
                />
                <span className={cx('mt-2 block text-xs', recoveryWordCount === 24 ? 'text-emerald-600' : isLight ? 'text-black/42' : 'text-white/42')}>{recoveryWordCount} / 24 words</span>
              </label>
            )}

            {stage.id === 'name' && (
              <label className="block">
                <span className="text-sm font-bold">Wallet name</span>
                <input
                  autoFocus
                  value={walletName}
                  onChange={(event) => {
                    onWalletName(event.target.value.slice(0, 40));
                    onClearError();
                  }}
                  placeholder="My INJ Pass"
                  className={cx('mt-3 h-12 w-full rounded-xl border bg-transparent px-4 text-base outline-none transition focus:border-violet-400', isLight ? 'border-black/12' : 'border-white/14')}
                />
                <span className={cx('mt-2 block text-xs font-semibold', isLight ? 'text-black/42' : 'text-white/42')}>You can create and switch between multiple wallets later.</span>
              </label>
            )}

            {stage.id === 'password' && (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-bold">Local password</span>
                  <input
                    autoFocus
                    type="password"
                    value={password}
                    onChange={(event) => {
                      onPassword(event.target.value);
                      onClearError();
                    }}
                    placeholder="At least 10 characters"
                    autoComplete="new-password"
                    className={cx('mt-3 h-12 w-full rounded-xl border bg-transparent px-4 text-base outline-none transition focus:border-violet-400', isLight ? 'border-black/12' : 'border-white/14')}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold">Confirm password</span>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => {
                      onPasswordConfirm(event.target.value);
                      onClearError();
                    }}
                    placeholder="Enter the same password again"
                    autoComplete="new-password"
                    className={cx('mt-3 h-12 w-full rounded-xl border bg-transparent px-4 text-base outline-none transition focus:border-violet-400', isLight ? 'border-black/12' : 'border-white/14')}
                  />
                </label>
                <div className={cx('flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold', isLight ? 'text-black/42' : 'text-white/42')}>
                  <span className={passwordLongEnough ? 'text-emerald-600' : ''}>At least 10 characters</span>
                  <span className={passwordsMatch ? 'text-emerald-600' : ''}>Passwords match</span>
                </div>
              </div>
            )}

            {stage.id === 'invite' && (
              <div>
                <label className="block">
                  <span className="text-sm font-bold">Invite code</span>
                  <div className="mt-3 flex gap-2">
                    <input
                      autoFocus
                      value={inviteCode}
                      onChange={(event) => onInviteCode(event.target.value)}
                      placeholder="8-character code"
                      autoComplete="off"
                      spellCheck={false}
                      className={cx(
                        'h-12 min-w-0 flex-1 rounded-xl border bg-transparent px-4 font-mono text-base uppercase tracking-[0.14em] outline-none transition',
                        inviteValidation === 'valid'
                          ? 'border-emerald-500'
                          : inviteValidation === 'invalid'
                            ? 'border-rose-500'
                            : isLight
                              ? 'border-black/12 focus:border-violet-400'
                              : 'border-white/14 focus:border-violet-400',
                      )}
                    />
                    <button
                      type="button"
                      onClick={onValidateInvite}
                      disabled={inviteCode.length !== 8 || inviteValidation === 'checking'}
                      className={cx(
                        'h-12 shrink-0 rounded-xl border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35',
                        isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8',
                      )}
                    >
                      {inviteValidation === 'checking' ? 'Checking...' : inviteValidation === 'valid' ? 'Applied' : 'Check'}
                    </button>
                  </div>
                </label>
                <div className="mt-3 min-h-6">
                  {inviteValidationMessage && (
                    <p className={cx(
                      'text-xs leading-5',
                      inviteValidation === 'valid'
                        ? 'text-emerald-600'
                        : inviteValidation === 'invalid'
                          ? isLight ? 'text-rose-700' : 'text-rose-200'
                          : isLight ? 'text-black/42' : 'text-white/42',
                    )}>
                      {inviteValidationMessage}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onInviteCode('');
                      onClearError();
                      onStep(activeStep + 1);
                    }}
                    disabled={busy || inviteValidation === 'checking'}
                    className={cx(
                      'text-xs font-bold underline decoration-current/40 underline-offset-4 transition disabled:opacity-40',
                      inviteValidationMessage ? 'mt-2' : '',
                      isLight ? 'text-black/54 hover:text-black' : 'text-white/54 hover:text-white',
                    )}
                  >
                    I don&apos;t have an invite code
                  </button>
                </div>
              </div>
            )}

            {stage.id === 'review' && (
              <div>
                <div className={cx('divide-y border-y', isLight ? 'divide-black/8 border-black/8' : 'divide-white/10 border-white/10')}>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>Wallet</span>
                    <strong className="text-sm">{walletName.trim() || 'My INJ Pass'}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{isPasskey ? 'Security' : mode === 'recover' ? 'Recovery phrase' : 'Address'}</span>
                    <strong className={cx(
                      'text-right text-sm',
                      !isPasskey && mode === 'create'
                        ? isLight ? 'font-mono text-emerald-700' : 'font-mono text-emerald-400'
                        : '',
                    )}>
                      {isPasskey
                        ? passkeyProtectionLabel
                        : mode === 'recover'
                          ? '24 words ready'
                          : preparedWalletAddress ? truncateAddress(preparedWalletAddress) : 'Preparing...'}
                    </strong>
                  </div>
                  {isPasskey && (
                    <div className="flex items-center justify-between gap-4 py-4">
                      <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>Recovery</span>
                      <strong className="text-right text-sm">System Passkey PRF</strong>
                    </div>
                  )}
                  {mode !== 'recover' && (
                    <div className="flex items-center justify-between gap-4 py-4">
                      <span className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>Invite code</span>
                      <strong className="font-mono text-sm">{inviteCode || 'Skipped'}</strong>
                    </div>
                  )}
                </div>
                <p className={cx('mt-4 text-xs leading-5', isLight ? 'text-black/46' : 'text-white/46')}>
                  {isPasskey
                    ? 'INJ Pass will verify PRF support in the real system Passkey prompt. Only public credential metadata and the wallet address are registered; the wallet key is not stored on disk.'
                    : 'Your recovery phrase and password are never uploaded to the INJ Pass server. You will be asked to save the 24 words offline after creation.'}
                </p>
              </div>
            )}

            {error && <p role="alert" className={cx('mt-5 text-sm leading-6', isLight ? 'text-rose-700' : 'text-rose-200')}>{error}</p>}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={onClose} disabled={busy} className={cx('h-10 rounded-full px-4 text-sm font-bold transition disabled:opacity-40', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>Cancel</button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {activeStep > 0 && (
                <button type="button" onClick={() => { onClearError(); onStep(activeStep - 1); }} disabled={busy} className={cx('h-10 rounded-full border px-5 text-sm font-bold transition disabled:opacity-40', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>Back</button>
              )}
              <button type="submit" disabled={!canContinue || busy || inviteValidation === 'checking'} className={cx('h-10 rounded-full px-6 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}>
                {inviteValidation === 'checking'
                  ? 'Checking...'
                  : busy
                  ? mode === 'recover' && !isPasskey ? 'Recovering...' : 'Creating...'
                  : isFinalStep
                    ? isPasskey ? 'Create with Passkey' : mode === 'recover' ? 'Recover wallet' : 'Create wallet'
                    : 'Continue'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </OverlayPortal>
  );
}

function createRecoveryPrintCode(): string {
  const values = new Uint32Array(18);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value, index) => (
    index === 0 ? String((value % 9) + 1) : String(value % 10)
  )).join('');
}

function formatRecoveryPrintCode(code: string): string {
  return code.replace(/(\d{3})(?=\d)/g, '$1 ');
}

function MnemonicBackupModal({
  open,
  words,
  step,
  checks,
  answers,
  loading,
  error,
  isLight,
  onClose,
  onRecorded,
  onReview,
  onAnswer,
  onVerify,
}: {
  open: boolean;
  words: string[];
  step: 'words' | 'verify' | 'success';
  checks: number[];
  answers: Record<number, string>;
  loading: boolean;
  error: string;
  isLight: boolean;
  onClose: () => void;
  onRecorded: () => void;
  onReview: () => void;
  onAnswer: (index: number, value: string) => void;
  onVerify: () => void;
}) {
  const [printVerificationCode, setPrintVerificationCode] = useState('');

  const printRecoveryKey = () => {
    const nextCode = createRecoveryPrintCode();
    flushSync(() => setPrintVerificationCode(nextCode));
    window.print();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4 backdrop-blur-md" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Recovery phrase backup" onClick={(event) => event.stopPropagation()} className={cx('inj-glass-surface flex min-h-[620px] max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-7', isLight ? 'border-black/8 bg-white/98 text-black' : 'border-white/10 bg-[#171719]/98 text-white')}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="inj-display-serif text-2xl">Back up your recovery phrase</h2>
            <p className={cx('mt-2 text-sm leading-6', isLight ? 'text-black/54' : 'text-white/54')}>These 24 words restore this wallet. Keep them offline and never send them to anyone.</p>
          </div>
          <button type="button" onClick={onClose} className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')} aria-label="Close recovery backup"><CloseIcon /></button>
        </div>

        {loading && <div className={cx('py-12 text-center text-sm', isLight ? 'text-black/48' : 'text-white/48')}>Verifying your Passkey...</div>}
        {!loading && words.length > 0 && step === 'words' && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {words.map((word, index) => (
                <div key={`${index}-${word}`} className={cx('flex items-center gap-2 rounded-lg px-2 py-2 font-mono text-sm', isLight ? 'bg-black/[0.035]' : 'bg-white/[0.055]')}>
                  <span className={cx('w-5 text-right text-[10px]', isLight ? 'text-black/34' : 'text-white/34')}>{index + 1}</span><span>{word}</span>
                </div>
              ))}
            </div>
            <div className="mt-auto flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className={cx('h-10 rounded-full px-4 text-sm font-bold', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>Back up later</button>
              <button type="button" onClick={printRecoveryKey} className={cx('h-10 rounded-full border px-5 text-sm font-bold transition', isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/12 hover:bg-white/8')}>Print</button>
              <button type="button" onClick={onRecorded} className={cx('h-10 rounded-full px-5 text-sm font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>I recorded all 24 words</button>
            </div>
          </>
        )}
        {!loading && words.length > 0 && step === 'verify' && (
          <>
            <p className={cx('mt-6 text-sm', isLight ? 'text-black/58' : 'text-white/58')}>Enter the requested words from your written backup.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {words.map((word, index) => {
                const shouldVerify = checks.includes(index);
                return shouldVerify ? (
                  <label key={index} className={cx('flex h-10 items-center gap-2 rounded-lg border px-2 font-mono text-sm', isLight ? 'border-black/18 bg-white' : 'border-white/18 bg-black/18')}>
                    <span className={cx('w-5 shrink-0 text-right text-[10px]', isLight ? 'text-black/34' : 'text-white/34')}>{index + 1}</span>
                    <input
                      aria-label={`Word #${index + 1}`}
                      value={answers[index] || ''}
                      onChange={(event) => onAnswer(index, event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
                    />
                  </label>
                ) : (
                  <div key={`${index}-${word}`} className={cx('flex h-10 items-center gap-2 rounded-lg px-2 font-mono text-sm', isLight ? 'bg-black/[0.035]' : 'bg-white/[0.055]')}>
                    <span className={cx('w-5 shrink-0 text-right text-[10px]', isLight ? 'text-black/34' : 'text-white/34')}>{index + 1}</span>
                    <span className="truncate">{word}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-auto flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:justify-end">
              <button type="button" onClick={onReview} className={cx('h-10 rounded-full px-4 text-sm font-bold', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>Review words</button>
              <button type="button" onClick={onVerify} className={cx('h-10 rounded-full px-5 text-sm font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Verify backup</button>
            </div>
          </>
        )}
        {!loading && step === 'success' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className={cx('flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold', isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-300/14 text-emerald-200')}>OK</div>
            <h3 className="inj-display-serif mt-5 text-2xl">Recovery phrase backed up</h3>
            <p className={cx('mt-2 max-w-md text-sm leading-6', isLight ? 'text-black/54' : 'text-white/54')}>Your three answers matched. Keep the written 24-word recovery phrase offline and private.</p>
            <button type="button" onClick={onClose} className={cx('mt-6 h-10 rounded-full px-6 text-sm font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Done</button>
          </div>
        )}
        {error && <p className={cx('mt-4 text-sm leading-6', isLight ? 'text-amber-800' : 'text-amber-200')}>{error}</p>}
      </section>

      <article className="inj-recovery-print-sheet" aria-hidden="true">
        <header className="inj-recovery-print-header">
          <p className="inj-recovery-print-brand">INJ PASS</p>
          <h1>INJ Pass Private Recovery Key</h1>
          <p>Offline wallet recovery document</p>
        </header>

        <section className="inj-recovery-print-code">
          <p>18-digit verification code</p>
          <strong>{formatRecoveryPrintCode(printVerificationCode)}</strong>
        </section>

        <section className="inj-recovery-print-words">
          <div>
            <h2>24-word recovery phrase</h2>
            <p>Language: English</p>
          </div>
          <ol>
            {words.map((word, index) => (
              <li key={`print-${index}-${word}`}>
                <span>{index + 1}</span>
                <strong>{word}</strong>
              </li>
            ))}
          </ol>
        </section>

        <footer>
          Keep this document offline and private. Anyone with these 24 words can control this wallet.
        </footer>
      </article>
    </div>
  );
}

function LocalWalletUnlockModal({
  wallet,
  password,
  error,
  busy,
  orphaned,
  isLight,
  onPasswordChange,
  onSubmit,
  onClose,
  onRecoverOrphan,
  onRemoveOrphan,
}: {
  wallet: LocalKeystore | null;
  password: string;
  error: string;
  busy: boolean;
  orphaned: boolean;
  isLight: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onRecoverOrphan: () => void;
  onRemoveOrphan: () => void;
}) {
  if (!wallet) return null;
  return (
    <OverlayPortal enabled>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/42 p-4 backdrop-blur-md" onClick={onClose}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          onClick={(event) => event.stopPropagation()}
          className={cx(
            'inj-glass-surface w-full max-w-md rounded-2xl border p-6 shadow-2xl',
            isLight ? 'border-black/8 bg-white/98 text-black' : 'border-white/10 bg-[#171719]/98 text-white',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="inj-display-serif text-2xl">Unlock wallet</h2>
              <p className={cx('mt-1 truncate text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{wallet.walletName || 'My INJ Pass'} · {truncateAddress(wallet.address)}</p>
            </div>
            <button type="button" onClick={onClose} className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')} aria-label="Close wallet unlock"><CloseIcon /></button>
          </div>
          {!orphaned && (
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Local wallet password"
              autoComplete="current-password"
              className={cx('mt-6 h-11 w-full rounded-xl border bg-transparent px-4 text-sm outline-none transition focus:border-violet-400', isLight ? 'border-black/12' : 'border-white/14')}
            />
          )}
          {error && <p className={cx('mt-3 text-sm leading-6', isLight ? 'text-rose-700' : 'text-rose-200')}>{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={cx('h-10 rounded-full px-4 text-sm font-bold', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>Cancel</button>
            {orphaned ? (
              <>
                <button type="button" onClick={onRemoveOrphan} className={cx('h-10 rounded-full px-4 text-sm font-bold', isLight ? 'text-rose-700 hover:bg-rose-50' : 'text-rose-200 hover:bg-rose-300/10')}>Remove device record</button>
                <button type="button" onClick={onRecoverOrphan} className={cx('h-10 rounded-full px-5 text-sm font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Recover with 24 words</button>
              </>
            ) : (
              <button type="submit" disabled={busy || !password} className={cx('h-10 rounded-full px-5 text-sm font-bold disabled:opacity-45', isLight ? 'bg-black text-white' : 'bg-white text-black')}>{busy ? 'Unlocking...' : 'Unlock'}</button>
            )}
          </div>
        </form>
      </div>
    </OverlayPortal>
  );
}

function ShellWarmup() {
  return (
    <main className="min-h-screen bg-[#fbfbfa] text-[#1d1d1f]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[286px] shrink-0 border-r border-black/8 bg-[#f3f3f1] px-3 py-3 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-black/8" />
            <div className="space-y-2">
              <div className="h-3 w-20 animate-pulse rounded-full bg-black/10" />
              <div className="h-3 w-28 animate-pulse rounded-full bg-black/6" />
            </div>
          </div>
        </aside>
        <section className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-3xl space-y-5">
            <div className="mx-auto h-11 w-[244px] animate-pulse rounded-full bg-black/8" />
            <div className="mx-auto h-8 w-72 animate-pulse rounded-full bg-black/8" />
            <div className="h-14 rounded-[1.65rem] border border-black/8 bg-white" />
          </div>
        </section>
      </div>

    </main>
  );
}

function ShellMotionStyles() {
  return (
    <style jsx global>{`
      @keyframes injFadeUp {
        from {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
        }
      }

      @keyframes injFadeDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
          filter: blur(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
        }
      }

      @keyframes injLineFlow {
        0%,
        100% {
          opacity: 0.22;
          transform: scaleX(0.78);
        }
        50% {
          opacity: 0.7;
          transform: scaleX(1);
        }
      }

      @keyframes injThinkingSheen {
        0% {
          background-position: 130% 50%;
        }
        58%,
        100% {
          background-position: -130% 50%;
        }
      }

      .inj-thinking-sheen {
        display: inline-block;
        color: transparent;
        background-image: linear-gradient(
          102deg,
          var(--inj-thinking-base) 0%,
          var(--inj-thinking-base) 38%,
          var(--inj-thinking-glow) 49%,
          var(--inj-thinking-peak) 52%,
          var(--inj-thinking-glow) 55%,
          var(--inj-thinking-base) 66%,
          var(--inj-thinking-base) 100%
        );
        background-position: 130% 50%;
        background-size: 240% 100%;
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: injThinkingSheen 2.7s cubic-bezier(0.45, 0, 0.2, 1) infinite;
        will-change: background-position;
      }

      .inj-thinking-sheen-light {
        --inj-thinking-base: rgba(0, 0, 0, 0.42);
        --inj-thinking-glow: rgba(0, 0, 0, 0.68);
        --inj-thinking-peak: rgba(0, 0, 0, 0.96);
      }

      .inj-thinking-sheen-dark {
        --inj-thinking-base: rgba(255, 255, 255, 0.42);
        --inj-thinking-glow: rgba(255, 255, 255, 0.72);
        --inj-thinking-peak: rgba(255, 255, 255, 1);
      }

      @media (prefers-reduced-motion: reduce) {
        .inj-thinking-sheen {
          animation: none;
          background-position: 50% 50%;
        }
      }

      @keyframes injLiquidMenu {
        0% {
          opacity: 0;
          transform: translateY(12px) scale(0.975);
          filter: blur(12px);
          border-radius: 1.85rem;
        }
        58% {
          opacity: 1;
          transform: translateY(-2px) scale(1.006);
          filter: blur(0);
          border-radius: 1.35rem;
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes injGlassBreath {
        0%,
        100% {
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 18px 70px rgba(15, 23, 42, 0.055);
        }
        50% {
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68), 0 26px 90px rgba(15, 23, 42, 0.09);
        }
      }

      @property --inj-composer-angle {
        syntax: "<angle>";
        inherits: true;
        initial-value: 0deg;
      }

      @keyframes injComposerBorderOrbit {
        from { --inj-composer-angle: 0deg; }
        to { --inj-composer-angle: 360deg; }
      }

      .inj-composer-shell::before,
      .inj-composer-shell::after {
        content: "";
        pointer-events: none;
        position: absolute;
        inset: -2.5px;
        z-index: 2;
        border-radius: inherit;
        padding: 2.5px;
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask-composite: exclude;
        transition: opacity 680ms cubic-bezier(0.22, 1, 0.36, 1);
        will-change: opacity;
      }

      .inj-composer-shell::before {
        background: conic-gradient(
          from var(--inj-composer-angle),
          transparent 0deg,
          transparent 244deg,
          rgba(124, 58, 237, 0.18) 268deg,
          rgba(168, 85, 247, 0.86) 294deg,
          rgba(255, 255, 255, 0.98) 307deg,
          rgba(217, 70, 239, 0.72) 321deg,
          transparent 356deg
        );
      }

      .inj-composer-testnet::before {
        background: conic-gradient(
          from var(--inj-composer-angle),
          transparent 0deg,
          transparent 244deg,
          rgba(202, 138, 4, 0.18) 268deg,
          rgba(250, 204, 21, 0.92) 294deg,
          rgba(255, 255, 255, 0.98) 307deg,
          rgba(245, 158, 11, 0.76) 321deg,
          transparent 356deg
        );
      }

      .inj-composer-shell::after {
        background: conic-gradient(
          from var(--inj-composer-angle),
          transparent 0deg,
          transparent 244deg,
          rgba(5, 150, 105, 0.18) 268deg,
          rgba(16, 185, 129, 0.88) 294deg,
          rgba(255, 255, 255, 0.98) 307deg,
          rgba(45, 212, 191, 0.7) 321deg,
          transparent 356deg
        );
      }

      .inj-composer-main::before,
      .inj-composer-sandbox::after,
      .inj-composer-testnet::before {
        opacity: 1;
      }

      .inj-composer-main::after,
      .inj-composer-sandbox::before,
      .inj-composer-testnet::after {
        opacity: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .inj-composer-shell {
          animation: none;
        }
      }

      @keyframes injMenuItemRise {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .inj-display-serif {
        font-family: "Evening Elixir", "Cormorant Garamond", Georgia, "Times New Roman", ui-serif, serif;
        font-weight: 500;
        letter-spacing: 0;
      }

      .inj-shell-font,
      .inj-shell-font button,
      .inj-shell-font input,
      .inj-shell-font textarea,
      .inj-shell-font select {
        font-family: "Evening Elixir", "Cormorant Garamond", Georgia, "Times New Roman", ui-serif, serif;
        letter-spacing: 0;
      }

      .inj-glass-surface {
        -webkit-backdrop-filter: blur(24px) saturate(1.22);
        backdrop-filter: blur(24px) saturate(1.22);
      }

      .inj-soft-panel {
        -webkit-backdrop-filter: blur(22px) saturate(1.18);
        backdrop-filter: blur(22px) saturate(1.18);
        animation: injGlassBreath 9s ease-in-out infinite;
      }

      .inj-liquid-menu {
        transform-origin: 50% 100%;
        animation: injLiquidMenu 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .inj-liquid-item {
        animation: injMenuItemRise 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .inj-composer-shell {
        isolation: isolate;
        box-shadow: none !important;
        -webkit-backdrop-filter: blur(28px) saturate(1.26);
        backdrop-filter: blur(28px) saturate(1.26);
        animation: injComposerBorderOrbit 6.4s linear infinite normal;
      }

      .inj-subtle-line {
        position: relative;
        overflow: hidden;
      }

      .inj-subtle-line::after {
        content: "";
        position: absolute;
        inset-inline: 14px;
        bottom: 0;
        height: 1px;
        transform-origin: center;
        background: linear-gradient(90deg, transparent, currentColor, transparent);
        opacity: 0;
        transition: opacity 220ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
        transform: scaleX(0.55);
      }

      .inj-subtle-line:hover::after,
      .inj-subtle-line[data-active="true"]::after {
        opacity: 0.34;
        transform: scaleX(1);
      }

      .inj-liquid-menu button:focus-visible,
      .inj-liquid-menu a:focus-visible,
      .inj-composer-shell button:focus-visible {
        outline: 1px solid rgba(16, 185, 129, 0.38);
        outline-offset: 2px;
      }

      .inj-status-working {
        animation: injStatusPulse 1.2s ease-in-out infinite;
        box-shadow: 0 0 5px rgba(251, 191, 36, 0.38);
      }

      .inj-status-complete {
        animation: injStatusComplete 720ms ease-out 1;
        box-shadow: 0 0 4px rgba(16, 185, 129, 0.28);
      }

      @keyframes injStatusPulse {
        0%, 100% { opacity: 0.48; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.08); }
      }

      @keyframes injStatusComplete {
        0% { opacity: 0.35; transform: scale(0.76); }
        45% { opacity: 1; transform: scale(1.28); }
        100% { opacity: 1; transform: scale(1); }
      }

      @media (max-width: 1023px) {
        main.inj-creative-build-active ~ button[aria-label="Open Eric support"] {
          bottom: calc(env(safe-area-inset-bottom) + 13rem) !important;
        }
      }
    `}</style>
  );
}

export default function InjPassChatShell({ entry = 'home' }: InjPassChatShellProps) {
  const { address, isUnlocked, isCheckingSession, privateKey, keystore, unlock, lock, logout, resetTxAuth } = useWallet();
  const { hasPin, autoLockMinutes, defaultAuthMethod, setPin, changePin, setAutoLockMinutes, setDefaultAuthMethod } = usePin();
  const { theme, toggleTheme, isThemeReady } = useTheme();
  const isLight = theme === 'light';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ProductMode>('chat');
  const [activeChatSurface, setActiveChatSurface] = useState<ChatSurface>('default');
  const [walletOpen, setWalletOpen] = useState(false);
  const [dappMarketOpen, setDappMarketOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [dappMarketItems, setDappMarketItems] = useState<DAppMarketItem[]>(dappMarketApps);
  const [miniAppTabs, setMiniAppTabs] = useState<MiniAppBrowserTab[]>([]);
  const [activeMiniAppTabId, setActiveMiniAppTabId] = useState<string | null>(null);
  const [activeMiniApp, setActiveMiniApp] = useState<DAppMarketItem | null>(null);
  const [miniAppUrl, setMiniAppUrl] = useState('');
  const [miniAppFrameNonce, setMiniAppFrameNonce] = useState(0);
  const [miniAppNavigation, setMiniAppNavigation] = useState<MiniAppNavigationState>(initialMiniAppNavigation);
  const [miniAppLoading, setMiniAppLoading] = useState(false);
  const [miniAppAgentRun, setMiniAppAgentRun] = useState<MiniAppAgentRun | null>(null);
  const [activeWalletTab, setActiveWalletTab] = useState<WalletTab | null>(null);
  const [assetWalletView, setAssetWalletView] = useState<AssetWalletView>('assets');
  const [walletPanelData, setWalletPanelData] = useState<WalletPanelData>({});
  const [walletPanelLoading, setWalletPanelLoading] = useState(false);
  const [walletPanelError, setWalletPanelError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePanel, setProfilePanel] = useState<ProfilePanel>('menu');
  const [preferenceSection, setPreferenceSection] = useState<PreferenceSection>('display');
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<LanguageCode>(readInitialLanguage);
  const [draft, setDraft] = useState('');
  const [composerSuggestionIndex, setComposerSuggestionIndex] = useState(0);
  const [composerAssetBalances, setComposerAssetBalances] = useState<Record<string, string>>({});
  const [composerAssetsAddress, setComposerAssetsAddress] = useState<string | null>(null);
  const [composerTokens, setComposerTokens] = useState<ComposerToken[]>([]);
  const [droppedContext, setDroppedContext] = useState('');
  const [walletExecutionMode, setWalletExecutionMode] = useState<WalletExecutionMode>(readInitialWalletExecutionMode);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedReasoningLevel, setSelectedReasoningLevel] = useState<ReasoningLevel>('High');
  const [selectedAgentModel, setSelectedAgentModel] = useState<AgentModel>('AgentOS 1.5');
  const [creativePrompt, setCreativePrompt] = useState('');
  const [creativeConversationId, setCreativeConversationId] = useState<string | undefined>();
  const [creativeStage, setCreativeStage] = useState<CreativeStage>('guide');
  const [creativePlan, setCreativePlan] = useState<CreativePlan | null>(null);
  const [creativeBuild, setCreativeBuild] = useState<CreativeBuild | null>(null);
  const [creativeCompileResult, setCreativeCompileResult] = useState<CreativeCompileResponse | null>(null);
  const [creativeCompileStatus, setCreativeCompileStatus] = useState<CreativeCompileStatus>('idle');
  const [creativeBuildError, setCreativeBuildError] = useState('');
  const [creativeBuildStep, setCreativeBuildStep] = useState(0);
  const [creativeProgressOpen, setCreativeProgressOpen] = useState(true);
  const [selectedCreativeFileIndex, setSelectedCreativeFileIndex] = useState(0);
  const [creativeError, setCreativeError] = useState('');
  const [isCreativePlanning, setIsCreativePlanning] = useState(false);
  const [creativeFaucetState, setCreativeFaucetState] = useState<FaucetState>('idle');
  const [creativeFaucetError, setCreativeFaucetError] = useState('');
  const [chatWorkStatus, setChatWorkStatus] = useState<ModeWorkStatus>('idle');
  const [creativeWorkStatus, setCreativeWorkStatus] = useState<ModeWorkStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConversationTitle, setCurrentConversationTitle] = useState('');
  const [agentConversationId, setAgentConversationId] = useState<string | undefined>();
  const [selectedStoredConversationId, setSelectedStoredConversationId] = useState<string | undefined>();
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [thinkingProgress, setThinkingProgress] = useState<ThinkingProgressState>({ steps: [], activeIndex: 0 });
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingAgentConfirmation | null>(null);
  const [storedConversations, setStoredConversations] = useState<StoredConversationSummary[]>([]);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [conversationSearchResults, setConversationSearchResults] = useState<StoredConversationSearchResult[]>([]);
  const [isSearchingConversations, setIsSearchingConversations] = useState(false);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [historyDeleteVisibleId, setHistoryDeleteVisibleId] = useState<string | null>(null);
  const [aiTokenProfile, setAiTokenProfile] = useState<UserProfileResponse | null>(null);
  const [aiTokenStatus, setAiTokenStatus] = useState<NinjaStatusResponse | null>(null);
  const [aiTokenTransactions, setAiTokenTransactions] = useState<PointsTransaction[]>([]);
  const [isAiTokenLoading, setIsAiTokenLoading] = useState(false);
  const [dailyCheckInState, setDailyCheckInState] = useState<DailyCheckInState>('idle');
  const [selectedLamPlanId, setSelectedLamPlanId] = useState(1);
  const [lamPurchaseState, setLamPurchaseState] = useState<LamPurchaseState>('idle');
  const [lamPurchaseError, setLamPurchaseError] = useState('');
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const [sandboxAddress, setSandboxAddress] = useState('');
  const [sandboxPrivateKey, setSandboxPrivateKey] = useState('');
  const [sandboxToolLoading, setSandboxToolLoading] = useState(false);
  const [sandboxToolMessage, setSandboxToolMessage] = useState('');
  const [sandboxIntroOpen, setSandboxIntroOpen] = useState(false);
  const [sandboxIntroPage, setSandboxIntroPage] = useState(0);
  const [composerIntroOpen, setComposerIntroOpen] = useState(false);
  const [composerIntroPage, setComposerIntroPage] = useState(0);
  const [composerIntroDeferredForBackup, setComposerIntroDeferredForBackup] = useState(false);
  const [creativeIntroOpen, setCreativeIntroOpen] = useState(false);
  const [creativeIntroPage, setCreativeIntroPage] = useState(0);
  const [composerDemoDismissed, setComposerDemoDismissed] = useState(false);
  const [composerDemoStep, setComposerDemoStep] = useState(0);
  const [composerDemoSelection, setComposerDemoSelection] = useState<ComposerDemoSelection>({
    kind: 'inj-gift',
    app: 'INJ Gift',
    skill: 'Group Gift',
    asset: 'INJ',
  });
  const [guestSlogan, setGuestSlogan] = useState('');
  const [visibleChatShortcuts, setVisibleChatShortcuts] = useState<string[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<AgentSkill[]>(composerSkills);
  const [customSkills, setCustomSkills] = useState<AgentSkill[]>([]);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authPendingAction, setAuthPendingAction] = useState<'create' | 'enter' | null>(null);
  const [authError, setAuthError] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('mnemonic');
  const [prfDetection, setPrfDetection] = useState<PrfDetection | null>(null);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletPassword, setNewWalletPassword] = useState('');
  const [newWalletPasswordConfirm, setNewWalletPasswordConfirm] = useState('');
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const [preparedMnemonicWallet, setPreparedMnemonicWallet] = useState<PreparedMnemonicWallet | null>(null);
  const [walletInviteCode, setWalletInviteCode] = useState('');
  const [walletInviteValidation, setWalletInviteValidation] = useState<InviteValidationState>('idle');
  const [walletInviteValidationMessage, setWalletInviteValidationMessage] = useState('');
  const [traditionalWalletWizardOpen, setTraditionalWalletWizardOpen] = useState(false);
  const [walletSetupMethod, setWalletSetupMethod] = useState<WalletSetupMethod>('traditional');
  const [traditionalWalletWizardMode, setTraditionalWalletWizardMode] = useState<TraditionalWalletWizardMode>('create');
  const [traditionalWalletWizardStep, setTraditionalWalletWizardStep] = useState(0);
  const [orphanWalletAddress, setOrphanWalletAddress] = useState<string | null>(null);
  const [localWallets, setLocalWallets] = useState<LocalKeystore[]>(() => (
    typeof window === 'undefined' ? [] : loadWallets()
  ));
  const [localUnlockWallet, setLocalUnlockWallet] = useState<LocalKeystore | null>(null);
  const [localUnlockPassword, setLocalUnlockPassword] = useState('');
  const [localUnlockError, setLocalUnlockError] = useState('');
  const [localUnlockBusy, setLocalUnlockBusy] = useState(false);
  const [mnemonicBackupOpen, setMnemonicBackupOpen] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [mnemonicStep, setMnemonicStep] = useState<'words' | 'verify' | 'success'>('words');
  const [mnemonicChecks, setMnemonicChecks] = useState<number[]>([]);
  const [mnemonicAnswers, setMnemonicAnswers] = useState<Record<number, string>>({});
  const [mnemonicBackupError, setMnemonicBackupError] = useState('');
  const [mnemonicBackupLoading, setMnemonicBackupLoading] = useState(false);
  const [mnemonicBackedUpLocally, setMnemonicBackedUpLocally] = useState(false);
  const [pinAction, setPinAction] = useState<'setup' | 'change' | 'reset' | null>(null);
  const [pinValues, setPinValues] = useState({ current: '', next: '', confirm: '' });
  const [pinActionError, setPinActionError] = useState('');
  const [exportedPrivateKey, setExportedPrivateKey] = useState('');
  const [walletActionPending, setWalletActionPending] = useState(false);
  const [accountDeletionStatus, setAccountDeletionStatus] = useState<AccountDeletionStatus | null>(null);
  const [accountStatusLoading, setAccountStatusLoading] = useState(false);
  const [accountActionState, setAccountActionState] = useState<AccountActionState>('idle');
  const [accountActionError, setAccountActionError] = useState('');
  const [accountActionProgress, setAccountActionProgress] = useState('');
  const [accountSweepTarget, setAccountSweepTarget] = useState('');
  const [accountDeleteConfirmation, setAccountDeleteConfirmation] = useState('');
  const [passkeyRemovalSignaled, setPasskeyRemovalSignaled] = useState<boolean | null>(null);

  const [sidebarWalletSummary, setSidebarWalletSummary] = useState({
    inj: '0',
    lam: 0,
    isLoading: false,
  });
  const messageCounterRef = useRef(0);
  const chatDraftRef = useRef('');
  const creativeDraftRef = useRef('');
  const pointerDAppRef = useRef<DAppMarketItem | null>(null);
  const miniAppIframeRef = useRef<HTMLIFrameElement | null>(null);
  const mainContentScrollRef = useRef<HTMLDivElement | null>(null);
  const miniAppWindowRef = useRef<WindowProxy | null>(null);
  const miniAppAgentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const miniAppAgentWindowRef = useRef<WindowProxy | null>(null);
  const miniAppAgentResolverRef = useRef<MiniAppAgentResolver | null>(null);
  const miniAppLoadingTimerRef = useRef<number | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const composerSuggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const conversationSearchInputRef = useRef<HTMLInputElement | null>(null);
  const walletPanelRequestRef = useRef(0);
  const conversationCacheRef = useRef(new Map<string, { title: string; messages: ChatMessage[] }>());
  const dailyClaimInFlightRef = useRef(false);
  const historyDeleteTimerRef = useRef<number | null>(null);
  const profileMenuTimerRef = useRef<number | null>(null);
  const modelMenuTimerRef = useRef<number | null>(null);
  const authMenuTimerRef = useRef<number | null>(null);
  const authMenuPinnedRef = useRef(false);
  const authMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const authMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const walletInviteValidationRequestRef = useRef(0);
  const localUnlockResolverRef = useRef<{
    resolve: (result: LocalUnlockResult) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const requireWalletPrivateKeyRef = useRef<() => Promise<Uint8Array>>(
    async () => { throw new Error('Wallet unlock is not ready.'); },
  );
  const composerToolsTimerRef = useRef<number | null>(null);
  const composerDemoResumeTimerRef = useRef<number | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const creativeAbortControllerRef = useRef<AbortController | null>(null);
  const thinkingProgressTimerRef = useRef<number | null>(null);
  const thinkingProgressRequestRef = useRef(0);
  const thinkingProgressAbortControllerRef = useRef<AbortController | null>(null);

  const surfaceTone = isLight
    ? 'bg-[#fbfbfa] text-[#1d1d1f]'
    : 'bg-[#0b0b0c] text-white';
  const sidebarTone = isLight
    ? 'border-black/8 bg-[#f3f3f1] text-[#1d1d1f]'
    : 'border-white/8 bg-[#111113] text-white';
  const composerTone = activeMode === 'creative'
    ? isLight
      ? 'border-amber-500/85 bg-transparent'
      : 'border-amber-300/72 bg-transparent'
    : walletExecutionMode === 'sandbox'
      ? isLight
        ? 'border-emerald-600/75 bg-transparent'
        : 'border-emerald-300/68 bg-transparent'
      : isLight
        ? 'border-violet-600/75 bg-transparent'
        : 'border-violet-300/70 bg-transparent';

  const isAuthenticated = isUnlocked && !!address;
  const displayAddress = truncateAddress(address);
  const selectedLanguage = languageOptions.find((option) => option.code === selectedLanguageCode) || languageOptions[0];
  const copy = useMemo(
    (): ShellCopy => ({ ...shellCopyEn, ...shellCopyOverrides[selectedLanguageCode] }),
    [selectedLanguageCode]
  );
  const localizedChatGuideCards = useMemo(() => [
    { title: copy.guideActionTitle, body: copy.guideActionBody },
    { title: copy.guideDropTitle, body: copy.guideDropBody },
    { title: copy.guideDappTitle, body: copy.guideDappBody },
    { title: copy.guideReviewTitle, body: copy.guideReviewBody },
  ], [copy]);
  const localizedBuildGuide = buildGuideByLanguage[selectedLanguageCode];
  const localizedSandboxIntro = sandboxIntroByLanguage[selectedLanguageCode];
  const localizedCreativeIntro = creativeIntroByLanguage[selectedLanguageCode];
  const composerTrigger = useMemo(() => getComposerTrigger(draft), [draft]);
  const composerDemoActive = !composerIntroOpen
    && !creativeIntroOpen
    && !composerDemoDismissed
    && !draft
    && composerTokens.length === 0
    && !droppedContext
    && messages.length === 0
    && !creativePrompt
    && !activeWalletTab
    && activeChatSurface === 'default';
  const creativeSkillExamples = creativeSkillDemoDataByLanguage[selectedLanguageCode];
  const composerDemoSegments: ComposerDemoSegment[] = activeMode === 'creative'
    ? formatCreativeSkillDemoSegments(
      selectedLanguageCode,
      creativeSkillExamples[composerDemoStep % creativeSkillExamples.length],
    )
    : formatComposerDemoSegments(selectedLanguageCode, composerDemoSelection);
  const allSkills = useMemo(() => [...catalogSkills, ...customSkills], [catalogSkills, customSkills]);
  const composerSuggestions = useMemo<ComposerSuggestion[]>(() => {
    if (!composerTrigger) return [];
    const query = composerTrigger.query.toLocaleLowerCase();
    if (composerTrigger.symbol === '@') {
      return visibleComposerDApps(dappMarketItems)
        .filter((app) => app.name.toLocaleLowerCase().includes(query))
        .slice(0, 7)
        .map((app) => ({
          id: `app-${app.id}`,
          label: app.name,
          caption: app.category,
          symbol: '@' as const,
          app,
        }));
    }
    if (composerTrigger.symbol === '#') {
      return allSkills
        .filter((skill) => `${skill.name} ${skill.app}`.toLocaleLowerCase().includes(query))
        .map((skill) => ({
          id: `skill-${skill.name}`,
          label: skill.name,
          caption: skill.body,
          symbol: '#' as const,
        }));
    }
    return ['INJ', 'USDT', 'USDC', 'XAUT', 'LAM']
      .filter((symbol) => symbol.toLocaleLowerCase().includes(query))
      .map((symbol) => ({
        id: `asset-${symbol}`,
        label: symbol,
        caption: isAuthenticated
          ? `${symbol === 'LAM' ? sidebarWalletSummary.lam : composerAssetBalances[symbol] || '...'} ${symbol}`
          : 'Log in to load balance',
        symbol: '$' as const,
      }));
  }, [allSkills, composerAssetBalances, composerTrigger, dappMarketItems, isAuthenticated, sidebarWalletSummary.lam]);

  useEffect(() => {
    const desktopMedia = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        setMobileSidebarOpen(false);
      } else {
        setSidebarCollapsed(false);
      }
    };

    handleBreakpointChange(desktopMedia);
    desktopMedia.addEventListener('change', handleBreakpointChange);
    return () => desktopMedia.removeEventListener('change', handleBreakpointChange);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    let active = true;
    void reconcileWalletStorage().then((wallets) => {
      if (active) setLocalWallets(wallets);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (composerSuggestions.length === 0) {
      setComposerSuggestionIndex(0);
      return;
    }
    setComposerSuggestionIndex((current) => Math.min(current, composerSuggestions.length - 1));
  }, [composerSuggestions.length, composerTrigger?.symbol, composerTrigger?.query]);

  useEffect(() => {
    composerSuggestionRefs.current[composerSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }, [composerSuggestionIndex]);
  const pinnedDApps = useMemo(
    () => visibleSidebarDApps(dappMarketItems).filter((app) => app.aiDriven),
    [dappMarketItems]
  );
  const marketDApps = useMemo(
    () => visibleMarketDApps(dappMarketItems),
    [dappMarketItems]
  );
  const activeMiniAppManifest = useMemo(
    () => activeMiniApp ? getMiniAppManifest(activeMiniApp.id) : null,
    [activeMiniApp],
  );
  const visibleStoredConversations = useMemo(() => {
    return storedConversations
      .sort((left, right) => {
        const leftPinned = pinnedConversationIds.includes(left.id);
        const rightPinned = pinnedConversationIds.includes(right.id);
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [pinnedConversationIds, storedConversations]);
  const shouldCenterContent = (activeMode === 'chat' && activeChatSurface === 'default') || creativeStage === 'guide';
  const hasActiveChat = activeMode === 'chat' && (activeChatSurface !== 'default' || Boolean(activeWalletTab) || messages.length > 0 || isAgentRunning || Boolean(pendingConfirmation));
  const hasActiveCreative = activeMode === 'creative' && (Boolean(creativePrompt) || creativeStage !== 'guide' || isCreativePlanning);
  const hasActiveSession = hasActiveChat || hasActiveCreative;
  const isCreativeBuildSession = activeMode === 'creative' && (creativeStage === 'building' || creativeStage === 'published');
  const hasPendingMnemonicBackup = Boolean(
    keystore
    && keystore.keyScheme !== 'prf-v1'
    && (keystore.encryptedMnemonic || keystore.keyScheme === 'local-mnemonic-v1')
    && !mnemonicBackedUpLocally,
  );
  const activeAiRunning = activeMode === 'chat'
    ? isAgentRunning
    : isCreativePlanning || creativeStage === 'building';

  useEffect(() => () => {
    chatAbortControllerRef.current?.abort();
    creativeAbortControllerRef.current?.abort();
    thinkingProgressAbortControllerRef.current?.abort();
    if (thinkingProgressTimerRef.current) window.clearTimeout(thinkingProgressTimerRef.current);
    if (composerDemoResumeTimerRef.current) window.clearTimeout(composerDemoResumeTimerRef.current);
    if (miniAppLoadingTimerRef.current) window.clearTimeout(miniAppLoadingTimerRef.current);
  }, []);

  useEffect(() => {
    let alive = true;
    void getPublicSkills().then((skills) => {
      if (alive && skills.length > 0) setCatalogSkills(skills);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const commitStoredConversations = (summaries: StoredConversationSummary[]) => {
    const next = summaries.slice(0, 50);
    setStoredConversations(next);
    if (address) cacheConversationSummaries(address, next);
  };

  const upsertStoredConversation = (summary: StoredConversationSummary) => {
    setStoredConversations((current) => {
      const next = [summary, ...current.filter((item) => item.id !== summary.id)].slice(0, 50);
      if (address) cacheConversationSummaries(address, next);
      return next;
    });
  };

  const prefetchConversationBodies = (summaries: StoredConversationSummary[]) => {
    for (const summary of summaries.slice(0, 8)) {
      if (conversationCacheRef.current.has(summary.id)) continue;
      void getStoredAgentConversation(summary.id).then((detail) => {
        if (!detail) return;
        const prefetchedMessages = detail.messages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({
            id: `stored-${message.id}`,
            role: message.role === 'user' ? 'user' as const : 'assistant' as const,
            body: message.content,
          }));
        conversationCacheRef.current.set(summary.id, {
          title: detail.conversation.title || summary.title || 'New chat',
          messages: prefetchedMessages,
        });
      });
    }
  };

  const promptPlaceholder = activeMode === 'chat'
    ? copy.placeholderChat
    : copy.placeholderCreate;

  const title = useMemo(() => {
    if (activeMode === 'chat') {
      if (activeChatSurface === 'dapp-market') {
        return copy.titleDAppMarket;
      }
      if (activeChatSurface === 'campaign') {
        return copy.campaign;
      }
      if (activeChatSurface === 'skills') {
        return copy.skills;
      }
      if (activeChatSurface === 'cloud-drive') {
        return copy.createSpace;
      }
      if (activeChatSurface === 'mini-app') {
        return activeMiniApp?.name || copy.dappMarket;
      }
      return guestSlogan || (isAuthenticated ? copy.titleAuthed : copy.titleGuest);
    }
    if (creativeStage === 'guide') {
      return copy.titleCreativeGuide;
    }
    if (creativeStage === 'plan') {
      return copy.titleCreativePlan;
    }
    if (creativeStage === 'building') {
      return copy.titleCreativeBuilding;
    }
    return copy.titleCreativePublished;
  }, [activeChatSurface, activeMiniApp?.name, activeMode, copy, creativeStage, guestSlogan, isAuthenticated]);

  useEffect(() => {
    if (activeChatSurface !== 'mini-app') return;
    mainContentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeChatSurface, activeMiniAppTabId]);

  useEffect(() => {
    const slogans = guestSlogansByLanguage[selectedLanguageCode];
    setGuestSlogan(pickRotatingSlogan(selectedLanguageCode, slogans) || copy.titleGuest);
    setVisibleChatShortcuts(pickRotatingShortcuts(
      selectedLanguageCode,
      chatShortcutsByLanguage[selectedLanguageCode],
      5,
      true,
    ));
  }, [copy.titleGuest, selectedLanguageCode]);

  useEffect(() => {
    if (!isAuthenticated || !address) {
      setComposerIntroOpen(false);
      setComposerIntroDeferredForBackup(false);
      setSandboxIntroOpen(false);
      return;
    }
    if (mnemonicBackupOpen || composerIntroDeferredForBackup) {
      setComposerIntroOpen(false);
      return;
    }
    const introKey = `injpass_composer_syntax_intro:${address.toLowerCase()}`;
    if (window.localStorage.getItem(introKey) !== 'complete') {
      setComposerIntroPage(0);
      setComposerIntroOpen(true);
    }
  }, [address, composerIntroDeferredForBackup, isAuthenticated, mnemonicBackupOpen]);

  useEffect(() => {
    if (activeMode !== 'creative') {
      setCreativeIntroOpen(false);
      return;
    }
    const identity = address?.toLowerCase() || 'guest';
    const introKey = `injpass_creative_intro:${identity}`;
    if (window.localStorage.getItem(introKey) !== 'complete') {
      setCreativeIntroPage(0);
      setCreativeIntroOpen(true);
    }
  }, [activeMode, address]);

  useEffect(() => {
    if (!composerDemoActive) return;
    const rotateDemo = () => {
      if (activeMode === 'creative') {
        setComposerDemoStep((current) => current + 1);
        return;
      }
      const kinds: ComposerDemoKind[] = ['omisper', 'inj-gift', 'bankrupt-elon'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)] || 'inj-gift';
      const skills = composerDemoSkillsByLanguage[selectedLanguageCode][kind];
      const skill = skills[Math.floor(Math.random() * skills.length)] || skills[0];
      setComposerDemoSelection({
        kind,
        app: kind === 'omisper' ? 'Omisper' : kind === 'inj-gift' ? 'INJ Gift' : 'Bankrupt Elon Musk',
        skill,
        asset: kind === 'inj-gift' ? 'INJ' : undefined,
      });
      setComposerDemoStep((current) => current + 1);
    };
    if (activeMode !== 'creative') rotateDemo();
    const timer = window.setInterval(rotateDemo, 5200);
    return () => window.clearInterval(timer);
  }, [activeMode, composerDemoActive, selectedLanguageCode]);

  useEffect(() => {
    setPinnedConversationIds(address ? readPinnedConversationIds(address) : []);
    const cachedSkills = address ? readCustomSkills(address) : [];
    setCustomSkills(cachedSkills);
    if (address && isAuthenticated) {
      void getMySkills().then((skills) => {
        setCustomSkills(skills);
        cacheCustomSkills(address, skills);
      }).catch(() => undefined);
    }
    setComposerAssetBalances({});
    setComposerAssetsAddress(null);
  }, [address, isAuthenticated]);

  useEffect(() => {
    if (composerTrigger?.symbol !== '$' || !address || composerAssetsAddress === address) return;
    let alive = true;
    getTokenBalances(['INJ', 'USDT', 'USDC'], address as Address)
      .then((balances) => {
        if (!alive) return;
        setComposerAssetBalances({ ...balances, XAUT: '0' });
        setComposerAssetsAddress(address);
      })
      .catch(() => {
        if (alive) setComposerAssetsAddress(address);
      });
    return () => {
      alive = false;
    };
  }, [address, composerAssetsAddress, composerTrigger?.symbol]);

  useEffect(() => {
    if (composerToolsTimerRef.current) window.clearTimeout(composerToolsTimerRef.current);
    if (!composerToolsOpen) return;
    composerToolsTimerRef.current = window.setTimeout(() => {
      setComposerToolsOpen(false);
      composerToolsTimerRef.current = null;
    }, 850);
    return () => {
      if (composerToolsTimerRef.current) window.clearTimeout(composerToolsTimerRef.current);
      composerToolsTimerRef.current = null;
    };
  }, [composerToolsOpen]);

  useEffect(() => {
    if (!conversationSearchOpen) return;
    const focusTimer = window.setTimeout(() => conversationSearchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [conversationSearchOpen]);

  useEffect(() => {
    if (!conversationSearchOpen) return;
    if (!isAuthenticated) {
      setConversationSearchResults([]);
      setIsSearchingConversations(false);
      return;
    }
    const query = conversationSearchQuery.trim();
    if (!query) {
      setConversationSearchResults(storedConversations.map((conversation) => ({ ...conversation, snippets: [] })));
      setIsSearchingConversations(false);
      return;
    }
    let alive = true;
    setIsSearchingConversations(true);
    const timer = window.setTimeout(() => {
      void searchStoredAgentConversations(query).then((results) => {
        if (alive) setConversationSearchResults(results);
      }).finally(() => {
        if (alive) setIsSearchingConversations(false);
      });
    }, 240);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [conversationSearchOpen, conversationSearchQuery, isAuthenticated, storedConversations]);

  useEffect(() => {
    if (modelMenuTimerRef.current) window.clearTimeout(modelMenuTimerRef.current);
    if (!modelMenuOpen) return;
    modelMenuTimerRef.current = window.setTimeout(() => {
      setModelMenuOpen(false);
      modelMenuTimerRef.current = null;
    }, 850);
    return () => {
      if (modelMenuTimerRef.current) window.clearTimeout(modelMenuTimerRef.current);
      modelMenuTimerRef.current = null;
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (authMenuTimerRef.current) window.clearTimeout(authMenuTimerRef.current);
    if (!authMenuOpen || authMenuPinnedRef.current) return;
    authMenuTimerRef.current = window.setTimeout(() => {
      if (authMenuPinnedRef.current) return;
      setAuthMenuOpen(false);
      authMenuTimerRef.current = null;
    }, 850);
    return () => {
      if (authMenuTimerRef.current) window.clearTimeout(authMenuTimerRef.current);
      authMenuTimerRef.current = null;
    };
  }, [authMenuOpen]);

  useEffect(() => {
    if (!authMenuOpen) return;

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const isInsideAuthArea = Boolean(
        authMenuTriggerRef.current?.contains(target)
        || authMenuPanelRef.current?.contains(target)
      );

      if (isInsideAuthArea) {
        if (authMenuTimerRef.current) {
          window.clearTimeout(authMenuTimerRef.current);
          authMenuTimerRef.current = null;
        }
        return;
      }

      if (authMenuPinnedRef.current || authMenuTimerRef.current) return;
      authMenuTimerRef.current = window.setTimeout(() => {
        setAuthMenuOpen(false);
        authMenuTimerRef.current = null;
      }, 850);
    };

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        authMenuTriggerRef.current?.contains(target)
        || authMenuPanelRef.current?.contains(target)
      ) {
        return;
      }

      authMenuPinnedRef.current = false;
      if (authMenuTimerRef.current) {
        window.clearTimeout(authMenuTimerRef.current);
        authMenuTimerRef.current = null;
      }
      setAuthMenuOpen(false);
    };

    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [authMenuOpen]);

  useEffect(() => {
    if (profileMenuTimerRef.current) window.clearTimeout(profileMenuTimerRef.current);
    if (!profileOpen || profilePanel !== 'menu') return;
    profileMenuTimerRef.current = window.setTimeout(() => {
      setProfileOpen(false);
      profileMenuTimerRef.current = null;
    }, QUICK_MENU_AUTO_HIDE_MS);
    return () => {
      if (profileMenuTimerRef.current) window.clearTimeout(profileMenuTimerRef.current);
      profileMenuTimerRef.current = null;
    };
  }, [profileOpen, profilePanel]);

  useEffect(() => {
    if (activeMode === 'creative' && creativeStage !== 'guide') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeMode, creativeStage]);

  useEffect(() => {
    setMnemonicBackedUpLocally(Boolean(keystore?.mnemonicBackedUpAt || keystore?.mnemonicBackupConfirmed));
  }, [keystore?.address, keystore?.mnemonicBackedUpAt, keystore?.mnemonicBackupConfirmed]);

  useEffect(() => {
    walletPanelRequestRef.current += 1;
    setWalletPanelData({});
    setWalletPanelError('');
    setWalletPanelLoading(false);
  }, [address]);

  useEffect(() => {
    if (!hasActiveSession) return;
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [hasActiveSession, isAgentRunning, messages, creativeStage]);

  useEffect(() => {
    if (!agentConversationId || messages.length === 0) return;
    conversationCacheRef.current.set(agentConversationId, {
      title: currentConversationTitle || 'New chat',
      messages,
    });
  }, [agentConversationId, currentConversationTitle, messages]);

  useEffect(() => {
    let alive = true;

    fetchDapps().then(({ dapps, tabs }) => {
      if (!alive || dapps.length === 0) return;
      const categoryLabels = new Map(tabs.map((tab) => [tab.id, tab.label]));
      const mapped = dapps
        .map((dapp, index) => mapBackendDApp(dapp, index, categoryLabels))
        .filter((app, index, collection) => (
          collection.findIndex((candidate) => normalizeDAppIdentity(candidate.name) === normalizeDAppIdentity(app.name)) === index
        ));
      const requiredAgentApps = dappMarketApps.filter((app) => app.aiDriven);
      const requiredNames = new Set(requiredAgentApps.map((app) => normalizeDAppIdentity(app.name)));
      const approvedComingSoonNames = new Set(comingSoonDAppOrder.map(normalizeDAppIdentity));
      const prioritized = requiredAgentApps.map((required) => {
        const remote = mapped.find((app) => normalizeDAppIdentity(app.name) === normalizeDAppIdentity(required.name));
        return remote ? { ...remote, ...required, url: remote.url || required.url } : required;
      });
      const remoteExtras = mapped.filter((app) => {
        const identity = normalizeDAppIdentity(app.name);
        return !requiredNames.has(identity) && approvedComingSoonNames.has(identity);
      });
      const remoteNames = new Set(remoteExtras.map((app) => normalizeDAppIdentity(app.name)));
      const localFallbacks = dappMarketApps.filter(
        (app) => !app.aiDriven && !remoteNames.has(normalizeDAppIdentity(app.name)),
      );
      setDappMarketItems([...prioritized, ...remoteExtras, ...localFallbacks]);
    }).catch((error) => {
      console.warn('[ChatShell] Failed to load backend dapps:', error);
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    if (!address) {
      Promise.resolve().then(() => {
        if (alive) {
          setSidebarWalletSummary({ inj: '0', lam: 0, isLoading: false });
          setAiTokenProfile(null);
          setAiTokenStatus(null);
          setAiTokenTransactions([]);
        }
      });
      return () => {
        alive = false;
      };
    }

    Promise.resolve().then(() => {
      if (alive) {
        setSidebarWalletSummary((current) => ({ ...current, isLoading: true }));
      }
    });
    Promise.all([
      getTokenBalances(['INJ'], address as Address),
      getUserProfile(),
    ]).then(([balances, profile]) => {
      if (!alive) return;
      setSidebarWalletSummary({
        inj: balances.INJ ?? '0',
        lam: profile?.ninjaBalance ?? 0,
        isLoading: false,
      });
      setAiTokenProfile(profile);
      setAiTokenStatus(profile
        ? {
          balance: profile.ninjaBalance,
          chanceRemaining: profile.chanceRemaining,
          chanceCooldownEndsAt: profile.chanceCooldownEndsAt,
        }
        : null);
    }).catch(() => {
      if (!alive) return;
      setSidebarWalletSummary((current) => ({ ...current, isLoading: false }));
    });

    return () => {
      alive = false;
    };
  }, [address]);

  useEffect(() => {
    let alive = true;

    if (!isAuthenticated) {
      Promise.resolve().then(() => {
        if (alive) setStoredConversations([]);
      });
      return () => {
        alive = false;
      };
    }

    if (address) {
      const cachedSummaries = readCachedConversationSummaries(address);
      if (cachedSummaries.length > 0) setStoredConversations(cachedSummaries);
    }

    getStoredAgentConversations()
      .then((summaries) => {
        if (alive) {
          setStoredConversations(summaries);
          if (address) cacheConversationSummaries(address, summaries);
          prefetchConversationBodies(summaries);
        }
      })
      .catch((error) => {
        console.warn('[ChatShell] Failed to load stored conversations:', error);
      });

    return () => {
      alive = false;
    };
  }, [address, isAuthenticated]);

  const refreshAiTokenPanel = async () => {
    if (!isAuthenticated) {
      setAiTokenProfile(null);
      setAiTokenStatus(null);
      setAiTokenTransactions([]);
      return;
    }

    setIsAiTokenLoading(true);
    try {
      const [profile, status, ledger] = await Promise.all([
        getUserProfile(),
        getNinjaStatus(),
        getTransactions(1, 6),
      ]);
      setAiTokenProfile(profile);
      setAiTokenStatus(status);
      const dailyDays = new Set<string>();
      const visibleTransactions = ledger.transactions.filter((transaction) => {
        if (transaction.type !== 'daily_check_in') return true;
        const day = typeof transaction.metadata?.day === 'string'
          ? transaction.metadata.day
          : transaction.createdAt?.slice(0, 10);
        if (!day || dailyDays.has(day)) return false;
        dailyDays.add(day);
        return true;
      });
      setAiTokenTransactions(visibleTransactions);
      const today = new Date().toISOString().slice(0, 10);
      const checkedInToday = ledger.transactions.some((transaction) => (
        transaction.type === 'daily_check_in'
        && (transaction.metadata?.day === today || transaction.createdAt?.slice(0, 10) === today)
      ));
      setDailyCheckInState(checkedInToday ? 'already-claimed' : 'idle');
      setSidebarWalletSummary((current) => ({
        ...current,
        lam: Number.isFinite(status.balance) ? status.balance : profile?.ninjaBalance ?? current.lam,
      }));
    } finally {
      setIsAiTokenLoading(false);
    }
  };

  const handleDailyCheckIn = async () => {
    if (!isAuthenticated || dailyClaimInFlightRef.current || dailyCheckInState !== 'idle' && dailyCheckInState !== 'error') return;
    dailyClaimInFlightRef.current = true;
    setDailyCheckInState('claiming');
    try {
      const result = await claimDailyCheckIn();
      if (!result.success) {
        setDailyCheckInState('error');
        return;
      }
      setDailyCheckInState(result.claimed ? 'claimed' : 'already-claimed');
      if (typeof result.balance === 'number') {
        setAiTokenStatus((current) => ({
          balance: result.balance || 0,
          chanceRemaining: current?.chanceRemaining ?? aiTokenProfile?.chanceRemaining ?? 0,
          chanceCooldownEndsAt: current?.chanceCooldownEndsAt ?? aiTokenProfile?.chanceCooldownEndsAt ?? 0,
        }));
        setSidebarWalletSummary((current) => ({ ...current, lam: result.balance || 0 }));
      }
      await refreshAiTokenPanel();
    } finally {
      dailyClaimInFlightRef.current = false;
    }
  };

  const handleLamPurchase = async () => {
    if (!isAuthenticated || !privateKey || !address) {
      setLamPurchaseState('error');
      setLamPurchaseError('Unlock your wallet before purchasing LAM.');
      return;
    }
    if (!LAM_PURCHASE_CONTRACT || !/^0x[a-fA-F0-9]{40}$/.test(LAM_PURCHASE_CONTRACT)) {
      setLamPurchaseState('error');
      setLamPurchaseError('LAM purchase contract is not configured.');
      return;
    }

    const selectedPlan = LAM_PURCHASE_PLANS.find((plan) => plan.planId === selectedLamPlanId);
    if (!selectedPlan || lamPurchaseState === 'submitting' || lamPurchaseState === 'confirming') return;

    setLamPurchaseState('submitting');
    setLamPurchaseError('');
    const balanceBefore = aiTokenStatus?.balance ?? aiTokenProfile?.ninjaBalance ?? sidebarWalletSummary.lam;

    try {
      const publicClient = createPublicClient({ transport: http(INJECTIVE_MAINNET.rpcUrl) });
      const [priceWei, purchasedLamRaw, , active] = await publicClient.readContract({
        address: LAM_PURCHASE_CONTRACT,
        abi: LAM_PURCHASE_ABI,
        functionName: 'plans',
        args: [selectedPlan.planId],
      });
      if (!active) throw new Error('This LAM package is not active right now.');
      const purchasedLam = Number(purchasedLamRaw);
      if (!Number.isFinite(purchasedLam) || purchasedLam <= 0) {
        throw new Error('This LAM package has an invalid on-chain amount.');
      }
      if (purchasedLam !== selectedPlan.lam) {
        throw new Error(`This package now credits ${purchasedLam} LAM. Refresh before purchasing.`);
      }
      const priceInj = formatEther(priceWei);
      if (Number(priceInj) !== Number(selectedPlan.inj)) {
        throw new Error(`This package now costs ${priceInj} INJ. Refresh before purchasing.`);
      }

      const clientRef = keccak256(stringToHex(`lam-${selectedPlan.id}-${Date.now()}`));
      const data = encodeFunctionData({
        abi: LAM_PURCHASE_ABI,
        functionName: 'buyChance',
        args: [selectedPlan.planId, clientRef],
      });
      const hash = await sendTransaction(
        privateKey,
        LAM_PURCHASE_CONTRACT,
        priceInj,
        data,
        INJECTIVE_MAINNET,
      );
      setLamPurchaseState('confirming');
      await waitForTransaction(hash, INJECTIVE_MAINNET, 1);

      let creditedBalance: number | null = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const status = await getNinjaStatus();
        if (status.balance >= balanceBefore + purchasedLam - 0.000001) {
          creditedBalance = status.balance;
          setAiTokenStatus(status);
          setSidebarWalletSummary((current) => ({ ...current, lam: status.balance }));
          break;
        }
      }
      if (creditedBalance === null) {
        throw new Error('The transaction is confirmed. LAM is still being indexed; refresh shortly.');
      }
      await refreshAiTokenPanel();
      setLamPurchaseState('complete');
    } catch (error) {
      setLamPurchaseState('error');
      setLamPurchaseError(error instanceof Error ? error.message : 'LAM purchase failed.');
    }
  };

  const showConversationDelete = (conversationId: string) => {
    if (historyDeleteTimerRef.current) window.clearTimeout(historyDeleteTimerRef.current);
    setHistoryDeleteVisibleId(conversationId);
    historyDeleteTimerRef.current = window.setTimeout(() => {
      setHistoryDeleteVisibleId((current) => current === conversationId ? null : current);
      historyDeleteTimerRef.current = null;
    }, QUICK_MENU_AUTO_HIDE_MS);
  };

  const togglePinnedConversation = (conversationId: string) => {
    setPinnedConversationIds((current) => {
      const next = current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [conversationId, ...current];
      if (address) cachePinnedConversationIds(address, next);
      return next;
    });
    showConversationDelete(conversationId);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    const previous = storedConversations;
    const next = previous.filter((conversation) => conversation.id !== conversationId);
    commitStoredConversations(next);
    conversationCacheRef.current.delete(conversationId);
    setPinnedConversationIds((current) => {
      const nextPins = current.filter((id) => id !== conversationId);
      if (address) cachePinnedConversationIds(address, nextPins);
      return nextPins;
    });
    setHistoryDeleteVisibleId(null);
    if (agentConversationId === conversationId || creativeConversationId === conversationId || selectedStoredConversationId === conversationId) {
      setMessages([]);
      setCurrentConversationTitle('');
      setAgentConversationId(undefined);
      setCreativeConversationId(undefined);
      setSelectedStoredConversationId(undefined);
      setCreativePrompt('');
      setCreativePlan(null);
      setCreativeBuild(null);
      setCreativeCompileResult(null);
      setCreativeCompileStatus('idle');
      setCreativeStage('guide');
    }
    const deleted = await deleteStoredAgentConversation(conversationId);
    if (!deleted) commitStoredConversations(previous);
  };

  const revealSandboxWallet = async () => {
    if (!agentConversationId) {
      setSandboxToolMessage('Send a Sandbox message first to create its isolated wallet.');
      return;
    }
    setSandboxToolLoading(true);
    setSandboxToolMessage('');
    try {
      const result = await getAgentSandboxDetails(agentConversationId);
      if (!result.ok || !result.sandboxAddress || !result.privateKey) {
        throw new Error(result.error || 'Sandbox wallet is not ready.');
      }
      setSandboxAddress(result.sandboxAddress);
      setSandboxPrivateKey(result.privateKey);
    } catch (error) {
      setSandboxToolMessage(error instanceof Error ? error.message : 'Sandbox wallet lookup failed.');
    } finally {
      setSandboxToolLoading(false);
    }
  };

  const sweepSandboxToMain = async () => {
    if (!agentConversationId) {
      setSandboxToolMessage('Send a Sandbox message first to create its isolated wallet.');
      return;
    }
    setSandboxToolLoading(true);
    setSandboxToolMessage('');
    try {
      const result = await sweepAgentSandbox({ conversationId: agentConversationId });
      if (!result.ok) throw new Error(result.error || 'Sandbox sweep failed.');
      const transfers = result.result?.transfers ?? [];
      setSandboxToolMessage(transfers.length > 0
        ? `Moved ${transfers.map((item) => `${formatAmount(item.amount)} ${item.symbol}`).join(', ')} to Main.`
        : 'Sandbox has no transferable balance.');
      if (result.sandboxAddress) setSandboxAddress(result.sandboxAddress);
    } catch (error) {
      setSandboxToolMessage(error instanceof Error ? error.message : 'Sandbox sweep failed.');
    } finally {
      setSandboxToolLoading(false);
    }
  };

  const selectLanguage = (languageCode: LanguageCode) => {
    setSelectedLanguageCode(languageCode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('injpass_language', languageCode);
    }
    setProfilePanel('menu');
    setProfileOpen(false);
  };

  const selectWalletExecutionMode = (mode: WalletExecutionMode) => {
    setWalletExecutionMode(mode);
    setComposerToolsOpen(false);
    setSandboxPrivateKey('');
    setSandboxToolMessage('');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('injpass_sandbox_mode', mode === 'sandbox' ? 'true' : 'false');
      if (mode === 'sandbox' && isAuthenticated && address) {
        const introKey = `injpass_sandbox_intro:${address.toLowerCase()}`;
        if (window.localStorage.getItem(introKey) !== 'complete') {
          setSandboxIntroPage(0);
          setSandboxIntroOpen(true);
        }
      }
    }
  };

  const completeSandboxIntro = () => {
    if (address && typeof window !== 'undefined') {
      window.localStorage.setItem(`injpass_sandbox_intro:${address.toLowerCase()}`, 'complete');
    }
    setSandboxIntroOpen(false);
    setSandboxIntroPage(0);
  };

  const completeComposerIntro = () => {
    if (address && typeof window !== 'undefined') {
      window.localStorage.setItem(`injpass_composer_syntax_intro:${address.toLowerCase()}`, 'complete');
    }
    setComposerIntroOpen(false);
    setComposerIntroPage(0);
    setComposerDemoDismissed(false);
  };

  const continueComposerIntroToSandbox = () => {
    completeComposerIntro();
    if (!isAuthenticated) return;
    setSandboxIntroPage(0);
    setSandboxIntroOpen(true);
  };

  const completeCreativeIntro = () => {
    if (typeof window !== 'undefined') {
      const identity = address?.toLowerCase() || 'guest';
      window.localStorage.setItem(`injpass_creative_intro:${identity}`, 'complete');
    }
    setCreativeIntroOpen(false);
    setCreativeIntroPage(0);
    setComposerDemoDismissed(false);
  };

  const switchProductMode = (mode: ProductMode) => {
    if (mode === activeMode) return;
    if (activeMode === 'chat') {
      chatDraftRef.current = draft;
    } else {
      creativeDraftRef.current = draft;
    }
    setActiveMode(mode);
    setDraft(mode === 'chat' ? chatDraftRef.current : creativeDraftRef.current);
    setModelMenuOpen(false);
  };

  useEffect(() => {
    if (activeMode === 'chat') {
      chatDraftRef.current = draft;
    } else {
      creativeDraftRef.current = draft;
    }
  }, [activeMode, draft]);

  const appendAgentMessages = (agentMessages: Array<{ role: 'assistant' | 'tool'; content: string; isError?: boolean }> = []) => {
    const visibleMessages = agentMessages.filter((message) => message.role === 'assistant');
    if (visibleMessages.length === 0) return;

    setMessages((current) => [
      ...current,
      ...visibleMessages.map((message) => ({
        id: uid(message.role),
        role: 'assistant' as const,
        body: message.content,
        isError: message.isError,
      })),
    ]);
  };

  const loadBackendConversations = async () => {
    setMobileSidebarOpen(false);
    switchProductMode('chat');
    setActiveChatSurface('default');
    setConversationSearchOpen(true);

    if (!isAuthenticated) {
      setConversationSearchResults([]);
      return;
    }

    setIsLoadingConversations(true);
    try {
      const summaries = await getStoredAgentConversations();
      commitStoredConversations(summaries);
      setConversationSearchResults(summaries.map((conversation) => ({ ...conversation, snippets: [] })));
      prefetchConversationBodies(summaries);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const openStoredConversation = async (conversationId: string) => {
    setMobileSidebarOpen(false);
    const summary = storedConversations.find((conversation) => conversation.id === conversationId);
    const cached = conversationCacheRef.current.get(conversationId);
    const isBuildConversation = summary?.model === 'agent-os-build';
    setAgentConversationId(isBuildConversation ? undefined : conversationId);
    setCreativeConversationId(undefined);
    setSelectedStoredConversationId(conversationId);
    setCurrentConversationTitle(summary?.title || cached?.title || 'New chat');
    setPendingConfirmation(null);
    switchProductMode('chat');
    setActiveChatSurface('default');
    setActiveWalletTab(null);
    setComposerTokens([]);
    setDroppedContext('');
    if (cached) {
      setMessages(cached.messages);
      return;
    }

    setIsLoadingConversations(true);
    try {
      const detail = await getStoredAgentConversation(conversationId);
      if (!detail) {
        setMessages([{
          id: uid('load-error'),
          role: 'assistant',
          body: 'Unable to load this conversation from the backend.',
          isError: true,
        }]);
        return;
      }

      const nextMessages = detail.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          id: `stored-${message.id}`,
          role: message.role === 'user' ? 'user' as const : 'assistant' as const,
          body: message.content,
        }));
      const nextTitle = detail.conversation.title || summary?.title || 'New chat';
      setCurrentConversationTitle(nextTitle);
      setMessages(nextMessages);
      conversationCacheRef.current.set(conversationId, { title: nextTitle, messages: nextMessages });
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const persistCommandConversation = (
    messageStamp: number,
    prompt: string,
    assistantMessage: ChatMessage,
    model: string,
  ) => {
    if (!isAuthenticated) return;

    const conversationId = agentConversationId || uid(model);
    const title = currentConversationTitle || prompt.slice(0, 48);
    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: `u-${messageStamp}`, role: 'user', body: prompt },
      assistantMessage,
    ];
    const history = nextMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.body,
      }));

    setAgentConversationId(conversationId);
    setSelectedStoredConversationId(conversationId);
    conversationCacheRef.current.set(conversationId, { title, messages: nextMessages });
    void syncAgentConversation({
      conversationId,
      title,
      model,
      messages: history,
    }).then((synced) => {
      if (!synced) return;
      const now = new Date().toISOString();
      upsertStoredConversation({
        id: conversationId,
        title,
        model,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const stopThinkingProgress = () => {
    thinkingProgressRequestRef.current += 1;
    thinkingProgressAbortControllerRef.current?.abort();
    thinkingProgressAbortControllerRef.current = null;
    if (thinkingProgressTimerRef.current) {
      window.clearTimeout(thinkingProgressTimerRef.current);
      thinkingProgressTimerRef.current = null;
    }
    setThinkingProgress({ steps: [], activeIndex: 0 });
  };

  const scheduleThinkingProgress = (requestId: number) => {
    const advance = () => {
      if (thinkingProgressRequestRef.current !== requestId) return;
      setThinkingProgress((current) => ({
        ...current,
        activeIndex: Math.min(current.activeIndex + 1, Math.max(0, current.steps.length - 1)),
      }));
      thinkingProgressTimerRef.current = window.setTimeout(
        advance,
        850 + Math.floor(Math.random() * 600),
      );
    };

    thinkingProgressTimerRef.current = window.setTimeout(
      advance,
      750 + Math.floor(Math.random() * 450),
    );
  };

  const beginThinkingProgress = (prompt: string, mode: ThinkingMode) => {
    thinkingProgressAbortControllerRef.current?.abort();
    if (thinkingProgressTimerRef.current) {
      window.clearTimeout(thinkingProgressTimerRef.current);
      thinkingProgressTimerRef.current = null;
    }

    const requestId = thinkingProgressRequestRef.current + 1;
    thinkingProgressRequestRef.current = requestId;
    setThinkingProgress({
      steps: chooseFallbackThinkingSteps(prompt, selectedLanguageCode, mode),
      activeIndex: 0,
    });
    scheduleThinkingProgress(requestId);

    const controller = new AbortController();
    thinkingProgressAbortControllerRef.current = controller;
    void generateTaskProgressSteps({
      prompt,
      language: selectedLanguage.label,
      mode,
    }, controller.signal).then((result) => {
      if (
        thinkingProgressRequestRef.current !== requestId
        || !result.ok
        || !result.steps
        || result.steps.length < 3
      ) return;

      const steps = result.steps.slice(0, 5);
      setThinkingProgress((current) => ({
        steps,
        activeIndex: Math.min(current.activeIndex, steps.length - 1),
      }));
    }).catch((error) => {
      if (!isAbortError(error)) {
        console.warn('[ChatShell] Task progress generation failed:', error);
      }
    });
  };

  const runMiniAppAgentCommand = (
    command: MiniAppAgentCommand,
    signal: AbortSignal,
  ): Promise<MiniAppAgentCommandResult> => {
    const manifest = getMiniAppManifest(command.appId);
    if (!manifest) return Promise.reject(new Error(`Mini app ${command.appId} is not registered.`));

    const previous = miniAppAgentResolverRef.current;
    if (previous) {
      window.clearTimeout(previous.timer);
      previous.cleanupAbort?.();
      previous.reject(new Error('A newer mini app command replaced this request.'));
      miniAppAgentResolverRef.current = null;
    }

    const id = uid('miniapp-agent');
    const { src, baseOverride } = resolveMiniAppAgentUrl(manifest, dappMarketItems);
    setMiniAppAgentRun({ id, command, manifest, src, baseOverride });

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const pending = miniAppAgentResolverRef.current;
        if (!pending || pending.reject !== reject) return;
        window.clearTimeout(pending.timer);
        pending.cleanupAbort?.();
        miniAppAgentResolverRef.current = null;
        setMiniAppAgentRun((current) => current?.id === id ? null : current);
        reject(new DOMException('Stopped', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = window.setTimeout(() => {
        const pending = miniAppAgentResolverRef.current;
        if (!pending || pending.reject !== reject) return;
        pending.cleanupAbort?.();
        miniAppAgentResolverRef.current = null;
        setMiniAppAgentRun((current) => current?.id === id ? null : current);
        reject(new Error(`${manifest.name} did not respond in time.`));
      }, 180_000);
      miniAppAgentResolverRef.current = {
        resolve,
        reject,
        timer,
        cleanupAbort: () => signal.removeEventListener('abort', onAbort),
      };
    });
  };

  const streamAssistantMessage = async (
    assistantMessage: ChatMessage,
    signal: AbortSignal,
  ) => {
    const chunks = splitStreamingText(assistantMessage.body);
    let streamedBody = '';

    setMessages((current) => [
      ...current,
      { ...assistantMessage, body: '' },
    ]);

    for (let index = 0; index < chunks.length; index += 1) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      const chunk = chunks[index];
      streamedBody += chunk;
      const nextBody = streamedBody;
      setMessages((current) => current.map((message) => (
        message.id === assistantMessage.id
          ? { ...message, body: nextBody }
          : message
      )));
      if (index < chunks.length - 1) {
        const pause = /[.!?。！？]\s*$/.test(chunk)
          ? 52
          : 18 + Math.floor(Math.random() * 18);
        await waitForStreamDelay(pause, signal);
      }
    }
  };

  const sendChatMessage = async (
    text: string,
    options: {
      assistantBody?: string;
      context?: string;
    } = {}
  ) => {
    const trimmedText = text.trim();
    if (!trimmedText || isAgentRunning) return;

    messageCounterRef.current += 1;
    const messageStamp = messageCounterRef.current;
    const userBody = options.context
      ? `${trimmedText}\n\nContext: ${options.context}`
      : trimmedText;
    setCurrentConversationTitle((current) => current || trimmedText.slice(0, 48));

    setMessages((current) => [
      ...current,
      { id: `u-${messageStamp}`, role: 'user', body: trimmedText },
    ]);
    setActiveChatSurface('default');
    setActiveWalletTab(null);
    setDroppedContext('');
    setComposerTokens([]);
    setModelMenuOpen(false);
    setDraft('');
    setChatWorkStatus('working');
    const controller = new AbortController();
    chatAbortControllerRef.current?.abort();
    chatAbortControllerRef.current = controller;
    beginThinkingProgress(trimmedText, 'chat');

    const miniAppCommand = parseMiniAppAgentCommand(trimmedText, selectedLanguageCode);
    if (miniAppCommand) {
      setIsAgentRunning(true);
      try {
        const result = await runMiniAppAgentCommand(miniAppCommand, controller.signal);
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        const assistantMessage: ChatMessage = {
          id: `a-${messageStamp}`,
          role: 'assistant',
          body: formatMiniAppAgentResult(result, selectedLanguageCode),
          action: result.key === 'login_required' ? 'login' : undefined,
        };
        stopThinkingProgress();
        await streamAssistantMessage(assistantMessage, controller.signal);
        setChatWorkStatus(result.ok ? 'complete' : 'idle');
        persistCommandConversation(messageStamp, trimmedText, assistantMessage, miniAppCommand.appId);
      } catch (error) {
        if (isAbortError(error)) {
          setChatWorkStatus('idle');
          return;
        }
        const assistantMessage: ChatMessage = {
          id: `a-${messageStamp}`,
          role: 'assistant',
          body: error instanceof Error
            ? error.message
            : formatMiniAppAgentResult({ ok: false, key: 'unknown_error' }, selectedLanguageCode),
        };
        setMessages((current) => [...current, assistantMessage]);
        setChatWorkStatus('idle');
        persistCommandConversation(messageStamp, trimmedText, assistantMessage, miniAppCommand.appId);
      } finally {
        stopThinkingProgress();
        if (chatAbortControllerRef.current === controller) {
          chatAbortControllerRef.current = null;
          setIsAgentRunning(false);
        }
      }
      return;
    }

    if (isEricMferMintMessage(trimmedText)) {
      setIsAgentRunning(true);
      try {
        if (!isAuthenticated) throw new Error('INJPASS_LOGIN_REQUIRED');
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');

        const signingKey = await requireWalletPrivateKey();
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        const result = await mintSponsoredCatNFT(signingKey);
        const mintedNft = result.tokenId
          ? await getCatNFTDetails(BigInt(result.tokenId))
          : null;
        const assistantMessage: ChatMessage = {
          id: `a-${messageStamp}`,
          role: 'assistant',
          body: formatEricMferMintMessage(selectedLanguageCode, result, mintedNft),
        };

        setWalletPanelData((current) => ({ ...current, nfts: undefined }));
        stopThinkingProgress();
        await streamAssistantMessage(assistantMessage, controller.signal);
        setChatWorkStatus('complete');
        persistCommandConversation(messageStamp, trimmedText, assistantMessage, 'eric-mfer');
      } catch (error) {
        if (isAbortError(error)) {
          setChatWorkStatus('idle');
          return;
        }
        const assistantMessage: ChatMessage = {
          id: `a-${messageStamp}`,
          role: 'assistant',
          body: localizeEricMferMintError(error, selectedLanguageCode),
          action: !isAuthenticated ? 'login' : undefined,
        };
        setMessages((current) => [...current, assistantMessage]);
        setChatWorkStatus('idle');
        persistCommandConversation(messageStamp, trimmedText, assistantMessage, 'eric-mfer');
      } finally {
        stopThinkingProgress();
        if (chatAbortControllerRef.current === controller) {
          chatAbortControllerRef.current = null;
          setIsAgentRunning(false);
        }
      }
      return;
    }

    if (isInjGiftMessage(trimmedText)) {
      setIsAgentRunning(true);
      try {
        const command = parseInjGiftCommand(trimmedText);
        if (command.kind !== 'help') {
          throw new Error('INJ Gift mini app command runner is unavailable. Please try again.');
        }
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        const result = await executeInjGiftCommand(command, {
          languageCode: selectedLanguageCode,
        });
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');

        const assistantMessage: ChatMessage = {
          id: `a-${messageStamp}`,
          role: 'assistant',
          body: result.body,
          action: !isAuthenticated && shouldOfferWalletLogin(trimmedText, result.body)
            ? 'login'
            : undefined,
        };
        setMessages((current) => [...current, assistantMessage]);
        setChatWorkStatus('complete');

        if (isAuthenticated) {
          const conversationId = agentConversationId || uid('inj-gift');
          const title = currentConversationTitle || trimmedText.slice(0, 48);
          const history = [
            ...messages
              .filter((message) => message.role === 'user' || message.role === 'assistant')
              .map((message) => ({
                role: message.role as 'user' | 'assistant',
                content: message.body,
              })),
            { role: 'user' as const, content: trimmedText },
            { role: 'assistant' as const, content: result.body },
          ];
          setAgentConversationId(conversationId);
          setSelectedStoredConversationId(conversationId);
          conversationCacheRef.current.set(conversationId, {
            title,
            messages: [
              ...messages,
              { id: `u-${messageStamp}`, role: 'user', body: trimmedText },
              assistantMessage,
            ],
          });
          void syncAgentConversation({
            conversationId,
            title,
            model: 'inj-gift',
            messages: history,
          }).then((synced) => {
            if (!synced) return;
            const now = new Date().toISOString();
            upsertStoredConversation({
              id: conversationId,
              title,
              model: 'inj-gift',
              createdAt: now,
              updatedAt: now,
            });
          });
        }
      } catch (error) {
        if (isAbortError(error)) {
          setChatWorkStatus('idle');
          return;
        }
        setMessages((current) => [
          ...current,
          {
            id: `a-${messageStamp}`,
            role: 'assistant',
            body: error instanceof Error ? error.message : copy.agentUnavailable,
            action: !isAuthenticated ? 'login' : undefined,
          },
        ]);
        setChatWorkStatus('idle');
      } finally {
        stopThinkingProgress();
        if (chatAbortControllerRef.current === controller) {
          chatAbortControllerRef.current = null;
          setIsAgentRunning(false);
        }
      }
      return;
    }

    if (!isAuthenticated) {
      const guestQuota = getGuestChatQuota();
      if (guestQuota.exhausted) {
        stopThinkingProgress();
        setMessages((current) => [
          ...current,
          {
            id: `a-${messageStamp}`,
            role: 'assistant',
            body: getGuestChatQuotaMessage(selectedLanguageCode, 0),
            action: 'login',
          },
        ]);
        setChatWorkStatus('idle');
        if (chatAbortControllerRef.current === controller) {
          chatAbortControllerRef.current = null;
        }
        return;
      }

      setIsAgentRunning(true);
      try {
        const result = await sendPublicAgentMessage({
          message: userBody,
          language: selectedLanguage.label,
          history: messages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(-12)
            .map((message) => ({
              role: message.role as 'user' | 'assistant',
              content: message.body,
            })),
        }, controller.signal);
        if (!result.ok || !result.message) {
          throw new Error(result.error || 'AI request failed');
        }
        const nextGuestQuota = consumeGuestChatReply();
        const responseBody = `${result.message}\n\n_${getGuestChatQuotaMessage(selectedLanguageCode, nextGuestQuota.remaining)}_`;
        const assistantMessage: ChatMessage = {
          id: `a-${messageStamp}`,
          role: 'assistant',
          body: responseBody,
          action: nextGuestQuota.exhausted || shouldOfferWalletLogin(trimmedText, result.message || '')
            ? 'login'
            : undefined,
        };
        setMessages((current) => [...current, assistantMessage]);
        setChatWorkStatus('complete');
      } catch (error) {
        if (isAbortError(error)) {
          setChatWorkStatus('idle');
          return;
        }
        setMessages((current) => [
          ...current,
          {
            id: `a-${messageStamp}`,
            role: 'assistant',
            body: copy.agentUnavailable,
            isError: true,
          },
        ]);
        setChatWorkStatus('idle');
      } finally {
        stopThinkingProgress();
        if (chatAbortControllerRef.current === controller) {
          chatAbortControllerRef.current = null;
          setIsAgentRunning(false);
        }
      }
      return;
    }

    setIsAgentRunning(true);
    try {
      const result = await sendAgentMessage({
        conversationId: agentConversationId,
        message: userBody,
        model: mapAgentModel(),
        sandboxMode: walletExecutionMode === 'sandbox',
      }, controller.signal);

      if (!result.ok) {
        throw new Error(result.error || 'Agent request failed');
      }

      if (result.conversationId) {
        setAgentConversationId(result.conversationId);
        setSelectedStoredConversationId(result.conversationId);
        const now = new Date().toISOString();
        upsertStoredConversation({
          id: result.conversationId,
          title: currentConversationTitle || trimmedText.slice(0, 48),
          model: mapAgentModel(),
          createdAt: now,
          updatedAt: now,
        });
      }
      if (result.sandboxAddress) setSandboxAddress(result.sandboxAddress);

      appendAgentMessages(result.messages);

      setPendingConfirmation(result.pendingConfirmation && result.conversationId
        ? { ...result.pendingConfirmation, conversationId: result.conversationId }
        : null);

      void getStoredAgentConversations()
        .then((summaries) => commitStoredConversations(summaries))
        .catch((error) => {
          console.warn('[ChatShell] Failed to refresh stored conversations:', error);
        });
      setChatWorkStatus('complete');
    } catch (error) {
      if (isAbortError(error)) {
        setChatWorkStatus('idle');
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: uid('agent-error'),
          role: 'assistant',
          body: copy.agentUnavailable,
          isError: true,
        },
      ]);
      setChatWorkStatus('idle');
    } finally {
      stopThinkingProgress();
      if (chatAbortControllerRef.current === controller) {
        chatAbortControllerRef.current = null;
        setIsAgentRunning(false);
      }
    }
  };

  const requestCreativeTestnetGas = async (captchaToken?: string) => {
    if (!address) {
      setCreativeFaucetError('');
      setCreativeFaucetState('needs-wallet');
      return;
    }

    setCreativeFaucetError('');
    setCreativeFaucetState('claiming');
    try {
      const response = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, companion: null, captchaToken }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        code?: string;
      };
      if (response.status === 428 && payload.code === 'captcha_required') {
        setCreativeFaucetState('verification');
        return;
      }
      if (response.status === 429 && payload.code === 'already_claimed') {
        setCreativeFaucetState('ready');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to request INJ testnet gas');
      }
      setCreativeFaucetState('ready');
    } catch (error) {
      setCreativeFaucetError(error instanceof Error ? error.message : 'Unable to request INJ testnet gas');
      setCreativeFaucetState('error');
    }
  };

  const openWalletPanel = async (tab: WalletTab, force = false) => {
    setMobileSidebarOpen(false);
    switchProductMode('chat');
    setActiveChatSurface('default');
    setActiveWalletTab(tab);
    if (tab === 'tokens' || tab === 'nfts') setAssetWalletView('assets');
    setModelMenuOpen(false);
    setPendingConfirmation(null);
    setDraft('');
    setComposerTokens([]);
    setDroppedContext('');
    setWalletPanelError('');
    if (!isAuthenticated || !address) return;
    const cached = tab === 'tokens'
      ? walletPanelData.tokens !== undefined
      : tab === 'nfts'
        ? walletPanelData.nfts !== undefined
        : tab === 'defi'
          ? walletPanelData.defi !== undefined
          : walletPanelData.activity !== undefined;
    if (cached && !force) return;

    const requestId = ++walletPanelRequestRef.current;
    setWalletPanelLoading(true);
    try {
      if (tab === 'tokens') {
        const tokens = await getTokenBalances(['INJ', 'USDT', 'USDC'], address as Address);
        tokens.XAUT = '0';
        if (requestId === walletPanelRequestRef.current) setWalletPanelData((current) => ({ ...current, tokens }));
      } else if (tab === 'nfts') {
        const [n1nj4NFTs, catNFTs] = await Promise.all([
          getN1NJ4NFTs(address as Address),
          getCatNFTsForOwner(address as Address),
        ]);
        const seenNFTs = new Set<string>();
        const nfts: NFT[] = [...catNFTs, ...n1nj4NFTs].filter((nft) => {
          const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
          if (seenNFTs.has(key)) return false;
          seenNFTs.add(key);
          return true;
        });
        if (requestId === walletPanelRequestRef.current) setWalletPanelData((current) => ({ ...current, nfts }));
      } else if (tab === 'defi') {
        const defi = await getUserStakingInfo(address as Address);
        if (requestId === walletPanelRequestRef.current) setWalletPanelData((current) => ({ ...current, defi }));
      } else {
        const response = await fetch(`/api/transactions?address=${encodeURIComponent(address)}&network=mainnet`);
        if (!response.ok) throw new Error('Unable to load Injective history.');
        const payload = await response.json() as { current_block?: unknown; items?: Array<Record<string, unknown>> };
        const latestBlock = typeof payload.current_block === 'number' && Number.isSafeInteger(payload.current_block)
          ? payload.current_block
          : null;
        const activity = (payload.items || []).slice(0, 24).map((item): WalletActivityItem => {
          const transactionBlock = typeof item.block_number === 'number'
            ? item.block_number
            : typeof item.block_number === 'string'
              ? Number.parseInt(item.block_number, 10)
              : Number.NaN;
          const confirmations = latestBlock !== null && Number.isSafeInteger(transactionBlock)
            ? Math.max(0, latestBlock - transactionBlock + 1)
            : null;
          return {
            hash: typeof item.hash === 'string' ? item.hash : '',
            timestamp: typeof item.timestamp === 'string' ? item.timestamp : '',
            method: typeof item.method === 'string' && item.method ? item.method : 'Transaction',
            status: typeof item.status === 'string' ? item.status : 'confirmed',
            confirmations,
            from: typeof item.from === 'object' && item.from && 'hash' in item.from ? String((item.from as { hash?: unknown }).hash || '') : undefined,
            to: typeof item.to === 'object' && item.to && 'hash' in item.to ? String((item.to as { hash?: unknown }).hash || '') : undefined,
          };
        }).filter((item) => item.hash);
        if (requestId === walletPanelRequestRef.current) setWalletPanelData((current) => ({ ...current, activity }));
      }
    } catch (error) {
      if (requestId === walletPanelRequestRef.current) setWalletPanelError(error instanceof Error ? error.message : 'Unable to load wallet data.');
    } finally {
      if (requestId === walletPanelRequestRef.current) setWalletPanelLoading(false);
    }
  };

  const executeClientWalletPendingAction = async (currentPending: PendingAgentConfirmation) => {
    if (!currentPending.toolUseId) {
      throw new Error('Missing client tool use id');
    }
    if (!address) {
      throw new Error('Unlock your main wallet first so INJ Pass can sign this action locally.');
    }
    const signingKey = await requireWalletPrivateKey();

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
        privateKey: privateKeyToHex(signingKey),
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
      const txHash = await sendTransaction(signingKey, toAddress, amount);
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
      conversationId: currentPending.conversationId,
      toolUseId: currentPending.toolUseId,
      result: JSON.stringify(resultPayload),
    });

    if (!result.ok) {
      throw new Error(result.error || 'Client tool result submit failed');
    }

    appendAgentMessages(result.messages);
    setPendingConfirmation(result.pendingConfirmation
      ? { ...result.pendingConfirmation, conversationId: currentPending.conversationId }
      : null);
  };

  const handleAgentConfirmation = async (approve: boolean) => {
    if (!pendingConfirmation || isAgentRunning) return;

    setIsAgentRunning(true);
    beginThinkingProgress(
      `${approve ? 'Approve' : 'Reject'} ${pendingConfirmation.toolName}`,
      'chat',
    );
    try {
      if (approve && pendingConfirmation.executionMode === 'client_wallet') {
        await executeClientWalletPendingAction(pendingConfirmation);
        return;
      }

      const result = await confirmAgentAction({
        conversationId: pendingConfirmation.conversationId,
        approve,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Agent confirmation failed');
      }

      appendAgentMessages(result.messages);
      setPendingConfirmation(result.pendingConfirmation
        ? {
          ...result.pendingConfirmation,
          conversationId: result.conversationId || pendingConfirmation.conversationId,
        }
        : null);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: uid('confirm-error'),
          role: 'assistant',
          body: `Confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isError: true,
        },
      ]);
    } finally {
      stopThinkingProgress();
      setIsAgentRunning(false);
    }
  };

  const requestCreativeProjectPlan = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || isCreativePlanning) return;
    const conversationId = creativeConversationId || uid('creative');

    setCreativeConversationId(conversationId);
    setSelectedStoredConversationId(conversationId);
    setCreativePrompt(prompt);
    setCurrentConversationTitle(prompt.slice(0, 48));
    setCreativeStage('guide');
    setCreativePlan(null);
    setCreativeBuild(null);
    setCreativeCompileResult(null);
    setCreativeCompileStatus('idle');
    setCreativeBuildError('');
    setCreativeBuildStep(0);
    setSelectedCreativeFileIndex(0);
    setCreativeError('');
    setCreativeFaucetState('idle');
    setCreativeFaucetError('');
    setModelMenuOpen(false);
    setDraft('');
    setIsCreativePlanning(true);
    setCreativeWorkStatus('working');
    void requestCreativeTestnetGas();
    const controller = new AbortController();
    creativeAbortControllerRef.current?.abort();
    creativeAbortControllerRef.current = controller;
    beginThinkingProgress(prompt, 'build');

    try {
      const result = await createCreativePlan({
        prompt,
        language: selectedLanguage.label,
      }, controller.signal);
      if (!result.ok || !result.plan) {
        throw new Error(result.error || 'Project graph generation failed');
      }
      setCreativePlan(result.plan);
      setCreativeStage('plan');
      setCreativeWorkStatus('complete');
      if (isAuthenticated) {
        const synced = await syncAgentConversation({
          conversationId,
          title: prompt.slice(0, 80),
          model: 'agent-os-build',
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: formatCreativePlanForHistory(result.plan) },
          ],
        });
        if (synced) {
          const now = new Date().toISOString();
          const planBody = formatCreativePlanForHistory(result.plan);
          conversationCacheRef.current.set(conversationId, {
            title: prompt.slice(0, 80),
            messages: [
              { id: `${conversationId}-user`, role: 'user', body: prompt },
              { id: `${conversationId}-plan`, role: 'assistant', body: planBody },
            ],
          });
          upsertStoredConversation({
            id: conversationId,
            title: prompt.slice(0, 80),
            model: 'agent-os-build',
            createdAt: now,
            updatedAt: now,
          });
          void getStoredAgentConversations().then(commitStoredConversations);
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        setCreativeWorkStatus('idle');
        return;
      }
      setCreativeError(copy.agentUnavailable);
      setCreativeWorkStatus('idle');
    } finally {
      stopThinkingProgress();
      if (creativeAbortControllerRef.current === controller) {
        creativeAbortControllerRef.current = null;
        setIsCreativePlanning(false);
      }
    }
  };

  const addComposerToken = (token: ComposerToken) => {
    setComposerTokens((current) => [
      ...current.filter((item) => item.id !== token.id),
      token,
    ]);
  };

  const removeComposerToken = (tokenId: string) => {
    setComposerTokens((current) => current.filter((token) => token.id !== tokenId));
  };

  const addAppComposerToken = (app: DAppMarketItem) => {
    addComposerToken({
      id: `app-${app.id}`,
      label: app.name,
      caption: app.category,
      symbol: '@',
      app,
    });
  };

  const selectComposerSuggestion = (suggestion: ComposerSuggestion) => {
    if (!composerTrigger) return;
    const prefix = draft.slice(0, composerTrigger.start).trimEnd();
    const nextDraft = prefix ? `${prefix} ` : '';
    setComposerDemoDismissed(true);
    setDraft(nextDraft);
    addComposerToken(suggestion);
    setComposerSuggestionIndex(0);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.setSelectionRange(nextDraft.length, nextDraft.length);
    });
  };

  const handleComposerInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'Backspace' || event.key === 'Delete') && draft.length === 0) {
      const lastToken = composerTokens[composerTokens.length - 1];
      if (lastToken) {
        event.preventDefault();
        removeComposerToken(lastToken.id);
        return;
      }
      if (droppedContext) {
        event.preventDefault();
        setDroppedContext('');
        return;
      }
    }
    if (!composerTrigger || composerSuggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setComposerSuggestionIndex((current) => (current + 1) % composerSuggestions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setComposerSuggestionIndex((current) => (current - 1 + composerSuggestions.length) % composerSuggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectComposerSuggestion(composerSuggestions[Math.min(composerSuggestionIndex, composerSuggestions.length - 1)]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(draft.slice(0, composerTrigger.start));
      setComposerSuggestionIndex(0);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draftText = draft.trim();
    const tokenReferences = composerTokens.map((token) => `${token.symbol}${token.label}`).join(' ');
    const text = [tokenReferences, draftText].filter(Boolean).join(' ')
      || (droppedContext ? 'Use the attached context.' : '');
    if (!text) return;

    const tokenContext = composerTokens
      .filter((token) => token.app)
      .map((token) => `DApp: ${token.app?.name} (${token.app?.category}) - ${token.app?.body}`)
      .join('\n');
    const context = [tokenContext, droppedContext].filter(Boolean).join('\n');

    if (activeMode === 'creative') {
      setComposerTokens([]);
      setDroppedContext('');
      void requestCreativeProjectPlan(text);
      return;
    }

    void sendChatMessage(text, { context });
  };

  const handleComposerDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeMode !== 'chat') return;

    const droppedFile = event.dataTransfer.files?.[0]?.name;
    const droppedText = event.dataTransfer.getData('text/plain');
    const nextContext = droppedFile || droppedText || 'Dropped asset or dApp';
    const draggedDApp = dappMarketItems.find((app) => droppedText.includes(`DApp: ${app.name}`));
    if (draggedDApp) {
      addAppComposerToken(draggedDApp);
      return;
    }
    setDroppedContext(nextContext.length > 86 ? `${nextContext.slice(0, 83)}...` : nextContext);
  };

  const handleDAppDragStart = (event: DragEvent<HTMLElement>, app: DAppMarketItem) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', `DApp: ${app.name} (${app.category}) - ${app.body}`);
  };

  const attachDAppToComposer = (app: DAppMarketItem) => {
    switchProductMode('chat');
    setActiveChatSurface('default');
    addAppComposerToken(app);
    if (app.prompt) {
      setDraft(app.prompt);
    }
  };

  const handleDAppPointerDown = (event: ReactPointerEvent<HTMLElement>, app: DAppMarketItem) => {
    if ((event.target as HTMLElement).closest('button')) return;
    pointerDAppRef.current = app;
  };

  const clearPointerDApp = () => {
    pointerDAppRef.current = null;
  };

  const handleComposerPointerUp = () => {
    const app = pointerDAppRef.current;
    if (!app) return;
    attachDAppToComposer(app);
    pointerDAppRef.current = null;
  };

  const showAppsTab = (tabId: string) => {
    if (miniAppLoadingTimerRef.current) {
      window.clearTimeout(miniAppLoadingTimerRef.current);
      miniAppLoadingTimerRef.current = null;
    }
    setActiveMiniAppTabId(tabId);
    setActiveMiniApp(null);
    setMiniAppUrl('');
    setMiniAppNavigation(initialMiniAppNavigation);
    setMiniAppLoading(false);
    switchProductMode('chat');
    setActiveChatSurface('dapp-market');
    setActiveWalletTab(null);
  };

  const activateMiniApp = (app: DAppMarketItem, tabId: string, path?: string) => {
    const manifest = getMiniAppManifest(app.id);
    if (manifest) {
      try {
        const url = resolveMiniAppUrl(manifest, path, app.url);
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.delete('injpass_miniapp');
        parsedUrl.searchParams.delete('injpass_host_origin');
        const initialPath = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || '/';
        setActiveMiniAppTabId(tabId);
        setActiveMiniApp(app);
        setMiniAppUrl(url);
        setMiniAppNavigation({
          path: initialPath,
          title: app.name,
          canGoBack: initialPath !== '/',
          canGoForward: false,
        });
        setMiniAppLoading(true);
        setMiniAppFrameNonce((current) => current + 1);
        switchProductMode('chat');
        setActiveChatSurface('mini-app');
        setActiveWalletTab(null);
        setConversationSearchOpen(false);
        return;
      } catch (error) {
        console.warn('[MiniApp] Invalid INJ Gift URL:', error);
      }
    }

    if (app.url) {
      window.open(app.url, '_blank', 'noopener,noreferrer');
      return;
    }
    attachDAppToComposer(app);
  };

  const selectMiniAppTab = (tab: MiniAppBrowserTab) => {
    if (tab.app) {
      activateMiniApp(tab.app, tab.id);
      return;
    }
    showAppsTab(tab.id);
  };

  const openDAppMarket = () => {
    const existingAppsTab = [...miniAppTabs].reverse().find((tab) => tab.app === null);
    if (existingAppsTab) {
      showAppsTab(existingAppsTab.id);
    } else {
      const tab: MiniAppBrowserTab = { id: uid('apps-tab'), app: null };
      setMiniAppTabs((current) => [...current, tab]);
      showAppsTab(tab.id);
    }
    setDappMarketOpen((current) => !current);
  };

  const openDApp = (app: DAppMarketItem, path?: string) => {
    setMobileSidebarOpen(false);
    if (!getMiniAppManifest(app.id)) {
      if (app.url) {
        window.open(app.url, '_blank', 'noopener,noreferrer');
      } else {
        attachDAppToComposer(app);
      }
      return;
    }

    const existingTab = miniAppTabs.find((tab) => tab.app?.id === app.id);
    if (existingTab) {
      activateMiniApp(app, existingTab.id, path);
      return;
    }

    const tab: MiniAppBrowserTab = { id: uid('app-tab'), app };
    setMiniAppTabs((current) => [...current, tab]);
    activateMiniApp(app, tab.id, path);
  };

  const openDAppFromMarket = (app: DAppMarketItem) => {
    const activeTab = miniAppTabs.find((tab) => tab.id === activeMiniAppTabId);
    if (!activeTab || activeTab.app || !getMiniAppManifest(app.id)) {
      openDApp(app);
      return;
    }

    setMiniAppTabs((current) => current.map((tab) => (
      tab.id === activeTab.id ? { ...tab, app } : tab
    )));
    activateMiniApp(app, activeTab.id);
  };

  const openNewMiniAppTab = () => {
    const tab: MiniAppBrowserTab = { id: uid('apps-tab'), app: null };
    setMiniAppTabs((current) => [...current, tab]);
    showAppsTab(tab.id);
  };

  const closeMiniAppTab = (tabId: string) => {
    const closingIndex = miniAppTabs.findIndex((tab) => tab.id === tabId);
    const remaining = miniAppTabs.filter((tab) => tab.id !== tabId);
    setMiniAppTabs(remaining);
    if (activeMiniAppTabId !== tabId) return;
    const nextTab = remaining[Math.min(Math.max(closingIndex, 0), remaining.length - 1)];
    if (nextTab) {
      selectMiniAppTab(nextTab);
      return;
    }
    const freshTab: MiniAppBrowserTab = { id: uid('apps-tab'), app: null };
    setMiniAppTabs([freshTab]);
    showAppsTab(freshTab.id);
  };

  const navigateMiniApp = (action: MiniAppNavigationAction) => {
    if (!activeMiniApp || !miniAppUrl) return;
    const manifest = getMiniAppManifest(activeMiniApp.id);
    if (!manifest) return;

    let miniAppOrigin: string;
    try {
      miniAppOrigin = new URL(miniAppUrl).origin;
    } catch {
      return;
    }
    if (!isAllowedMiniAppOrigin(manifest, miniAppOrigin, activeMiniApp.url)) return;

    setMiniAppLoading(true);
    if (miniAppLoadingTimerRef.current) window.clearTimeout(miniAppLoadingTimerRef.current);
    miniAppLoadingTimerRef.current = window.setTimeout(() => {
      setMiniAppLoading(false);
      miniAppLoadingTimerRef.current = null;
    }, 4_000);
    (miniAppWindowRef.current || miniAppIframeRef.current?.contentWindow)?.postMessage({
      channel: 'injpass-miniapp-v1',
      type: 'navigation-command',
      action,
    }, miniAppOrigin);
  };

  const openCampaign = () => {
    switchProductMode('chat');
    setActiveChatSurface('campaign');
    setActiveWalletTab(null);
    setCampaignOpen((current) => !current);
  };

  const openSkills = () => {
    setMobileSidebarOpen(false);
    switchProductMode('chat');
    setActiveChatSurface('skills');
    setActiveWalletTab(null);
  };

  const openCloudDrive = () => {
    setMobileSidebarOpen(false);
    switchProductMode('chat');
    setActiveChatSurface('cloud-drive');
    setActiveWalletTab(null);
    setConversationSearchOpen(false);
  };

  const addCustomSkill = (skill: AgentSkill) => {
    if (!address) return;
    setCustomSkills((current) => {
      const next = [skill, ...current.filter((item) => item.id !== skill.id)];
      cacheCustomSkills(address, next);
      return next;
    });
    void createMySkill({
      name: skill.name,
      app: skill.app,
      body: skill.body,
      prompt: skill.prompt,
    }).then((savedSkill) => {
      setCustomSkills((current) => {
        const next = [savedSkill, ...current.filter((item) => item.id !== skill.id && item.id !== savedSkill.id)];
        cacheCustomSkills(address, next);
        return next;
      });
    }).catch((error) => {
      console.warn('[Skills] Backend save failed; keeping the local copy.', error);
    });
  };

  const useSkill = (prompt: string) => {
    switchProductMode('chat');
    setActiveChatSurface('default');
    setActiveWalletTab(null);
    setDraft(prompt);
    window.setTimeout(() => composerInputRef.current?.focus(), 60);
  };

  const startNewSkillBuild = () => {
    chatAbortControllerRef.current?.abort();
    creativeAbortControllerRef.current?.abort();
    stopThinkingProgress();
    creativeDraftRef.current = '';
    switchProductMode('creative');
    chatDraftRef.current = '';
    setActiveChatSurface('default');
    setMessages([]);
    setCurrentConversationTitle('');
    setAgentConversationId(undefined);
    setSelectedStoredConversationId(undefined);
    setCreativeConversationId(undefined);
    setCreativePrompt('');
    setCreativeStage('guide');
    setCreativePlan(null);
    setCreativeBuild(null);
    setCreativeCompileResult(null);
    setCreativeCompileStatus('idle');
    setCreativeBuildError('');
    setCreativeError('');
    setCreativeBuildStep(0);
    setSelectedCreativeFileIndex(0);
    setIsCreativePlanning(false);
    setPendingConfirmation(null);
    setActiveWalletTab(null);
    setConversationSearchOpen(false);
    setDroppedContext('');
    setComposerTokens([]);
    setDraft('');
    setChatWorkStatus('idle');
    setCreativeWorkStatus('idle');
    setModelMenuOpen(false);
    setComposerToolsOpen(false);
    setComposerDemoDismissed(false);
    window.setTimeout(() => composerInputRef.current?.focus(), 60);
  };

  const startCreativeFromShortcut = (text: string) => {
    switchProductMode('creative');
    void requestCreativeProjectPlan(text);
  };

  const acceptCreativePlan = async () => {
    if (!creativePlan || (creativeStage === 'building' && !creativeBuildError)) return;

    setCreativeStage('building');
    setCreativeBuild(null);
    setCreativeCompileResult(null);
    setCreativeCompileStatus('idle');
    setCreativeBuildError('');
    setCreativeBuildStep(0);
    setCreativeProgressOpen(true);
    setSelectedCreativeFileIndex(0);
    setCreativeWorkStatus('working');
    const controller = new AbortController();
    creativeAbortControllerRef.current?.abort();
    creativeAbortControllerRef.current = controller;

    try {
      let result = await createCreativeBuildStream(
        {
          prompt: creativePrompt,
          language: selectedLanguage.label,
          plan: creativePlan,
        },
        (draftBuild) => {
          setCreativeBuild(draftBuild);
          if (draftBuild.files.length > 0) {
            setSelectedCreativeFileIndex(draftBuild.files.length - 1);
            setCreativeBuildStep(Math.min(draftBuild.files.length - 1, creativePlan.nodes.length - 1));
          }
        },
        controller.signal
      );
      if (!result.ok) {
        result = await createCreativeBuild({
          prompt: creativePrompt,
          language: selectedLanguage.label,
          plan: creativePlan,
        }, controller.signal);
      }
      if (!result.ok || !result.build) {
        throw new Error(result.error || 'Source generation failed');
      }
      setCreativeBuild(result.build);
      setCreativeBuildStep(creativePlan.nodes.length);
      const hasSolidity = result.build.files.some((file) => file.path.toLowerCase().endsWith('.sol'));
      if (hasSolidity) {
        setCreativeCompileStatus('compiling');
        const compileResult = await compileCreativeContracts(result.build.files, controller.signal);
        setCreativeCompileResult(compileResult);
        setCreativeCompileStatus(compileResult.ok ? 'success' : 'error');
      } else {
        setCreativeCompileStatus('unsupported');
      }
      setCreativeStage('published');
      setCreativeWorkStatus('complete');
      if (isAuthenticated && creativeConversationId) {
        const synced = await syncAgentConversation({
          conversationId: creativeConversationId,
          title: creativePrompt.slice(0, 80),
          model: 'agent-os-build',
          messages: [
            { role: 'user', content: creativePrompt },
            { role: 'assistant', content: formatCreativePlanForHistory(creativePlan) },
            { role: 'assistant', content: `${result.build.summary}\n\nGenerated files:\n${result.build.files.map((file) => `- ${file.path}`).join('\n')}` },
          ],
        });
        if (synced) {
          const buildBody = `${result.build.summary}\n\nGenerated files:\n${result.build.files.map((file) => `- ${file.path}`).join('\n')}`;
          conversationCacheRef.current.set(creativeConversationId, {
            title: creativePrompt.slice(0, 80),
            messages: [
              { id: `${creativeConversationId}-user`, role: 'user', body: creativePrompt },
              { id: `${creativeConversationId}-plan`, role: 'assistant', body: formatCreativePlanForHistory(creativePlan) },
              { id: `${creativeConversationId}-build`, role: 'assistant', body: buildBody },
            ],
          });
          const now = new Date().toISOString();
          upsertStoredConversation({
            id: creativeConversationId,
            title: creativePrompt.slice(0, 80),
            model: 'agent-os-build',
            createdAt: now,
            updatedAt: now,
          });
          void getStoredAgentConversations().then(commitStoredConversations);
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        setCreativeStage('plan');
        setCreativeWorkStatus('idle');
        return;
      }
      setCreativeBuildError(copy.agentUnavailable);
      setCreativeWorkStatus('idle');
    } finally {
      if (creativeAbortControllerRef.current === controller) {
        creativeAbortControllerRef.current = null;
      }
    }
  };

  const stopActiveAiTask = () => {
    stopThinkingProgress();
    if (activeMode === 'chat') {
      chatAbortControllerRef.current?.abort();
      chatAbortControllerRef.current = null;
      setIsAgentRunning(false);
      setChatWorkStatus('idle');
      return;
    }

    creativeAbortControllerRef.current?.abort();
    creativeAbortControllerRef.current = null;
    setIsCreativePlanning(false);
    setCreativeWorkStatus('idle');
    if (creativeStage === 'building') {
      setCreativeStage('plan');
      return;
    }
    if (isCreativePlanning) {
      const interruptedPrompt = creativePrompt;
      setCreativePrompt('');
      setDraft(interruptedPrompt);
      creativeDraftRef.current = interruptedPrompt;
      window.requestAnimationFrame(() => composerInputRef.current?.focus());
    }
  };

  const reviseCreativePlan = () => {
    const idea = creativePrompt.trim() || creativeDraftRef.current.trim() || currentConversationTitle.trim();
    setCreativeStage('guide');
    setCreativePrompt(idea);
    setCreativePlan(null);
    setCreativeBuild(null);
    setCreativeCompileResult(null);
    setCreativeCompileStatus('idle');
    setCreativeBuildError('');
    setCreativeBuildStep(0);
    setSelectedCreativeFileIndex(0);
    setCreativeError('');
    setCreativeFaucetState('idle');
    setCreativeFaucetError('');
    setCreativeWorkStatus('idle');
    creativeDraftRef.current = idea;
    setDraft(idea);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        composerInputRef.current?.focus();
        composerInputRef.current?.setSelectionRange(idea.length, idea.length);
      }, 0);
    });
  };

  const openMnemonicBackup = async () => {
    setMnemonicBackupOpen(true);
    setMnemonicStep('words');
    setMnemonicBackupError('');
    if (mnemonicWords.length > 0) return;
    if (!keystore || (!keystore.encryptedMnemonic && keystore.keyScheme !== 'local-mnemonic-v1')) {
      setMnemonicBackupError('This wallet was not created with a recovery phrase.');
      return;
    }

    setMnemonicBackupLoading(true);
    try {
      const password = keystore.keyScheme === 'local-mnemonic-v1'
        ? (await requestLocalWalletUnlock(keystore)).password
        : undefined;
      const mnemonic = await revealWalletMnemonic(keystore, { password });
      setMnemonicWords(mnemonic.split(/\s+/));
    } catch (error) {
      setMnemonicBackupError(error instanceof Error ? error.message : 'Unable to reveal the recovery phrase.');
    } finally {
      setMnemonicBackupLoading(false);
    }
  };

  const startMnemonicVerification = () => {
    setMnemonicChecks(pickMnemonicVerificationIndexes(mnemonicWords.length));
    setMnemonicAnswers({});
    setMnemonicBackupError('');
    setMnemonicStep('verify');
  };

  const confirmMnemonicVerification = () => {
    const isCorrect = mnemonicChecks.every((index) => (
      mnemonicAnswers[index]?.trim().toLowerCase() === mnemonicWords[index]?.toLowerCase()
    ));
    if (!isCorrect || !address) {
      setMnemonicBackupError('Some words do not match. Check your written copy and try again.');
      return;
    }

    markMnemonicBackedUp(address);
    setMnemonicBackedUpLocally(true);
    setMnemonicAnswers({});
    setMnemonicBackupError('');
    setMnemonicStep('success');
  };

  const closeMnemonicBackup = () => {
    setMnemonicBackupOpen(false);
    setMnemonicWords([]);
    setMnemonicAnswers({});
    setMnemonicBackupError('');
    setComposerIntroDeferredForBackup(false);
  };

  const submitPinAction = async () => {
    if (!pinAction) return;
    setPinActionError('');
    if (!/^\d{6}$/.test(pinValues.next) || pinValues.next !== pinValues.confirm) {
      setPinActionError('Enter the same 6-digit PIN twice.');
      return;
    }

    setWalletActionPending(true);
    try {
      if (pinAction === 'change') {
        const changed = await changePin(pinValues.current, pinValues.next);
        if (!changed) throw new Error('The current PIN is incorrect.');
      } else {
        if (pinAction === 'reset') {
          if (!keystore) throw new Error('No wallet is available.');
          await requireWalletPrivateKey();
        }
        await setPin(pinValues.next);
      }
      setPinAction(null);
      setPinValues({ current: '', next: '', confirm: '' });
    } catch (error) {
      setPinActionError(error instanceof Error ? error.message : 'Unable to update the PIN.');
    } finally {
      setWalletActionPending(false);
    }
  };

  const revealPrivateKeyForExport = async () => {
    if (!keystore) return;
    setWalletActionPending(true);
    setPinActionError('');
    try {
      const nextPrivateKey = privateKey || await requireWalletPrivateKey();
      setExportedPrivateKey(privateKeyToHex(nextPrivateKey));
    } catch (error) {
      setPinActionError(error instanceof Error ? error.message : 'Unable to export the private key.');
    } finally {
      setWalletActionPending(false);
    }
  };

  const unlockWithWalletKey = (nextPrivateKey: Uint8Array, nextKeystore: LocalKeystore) => {
    unlock(nextPrivateKey, nextKeystore);
  };

  const requestLocalWalletUnlock = (wallet: LocalKeystore): Promise<LocalUnlockResult> => {
    if (localUnlockResolverRef.current) {
      localUnlockResolverRef.current.reject(new Error('A wallet unlock request was replaced.'));
    }
    setLocalUnlockWallet(wallet);
    setLocalUnlockPassword('');
    setLocalUnlockError('');
    setOrphanWalletAddress(null);
    return new Promise((resolve, reject) => {
      localUnlockResolverRef.current = { resolve, reject };
    });
  };

  const closeLocalWalletUnlock = (reason = 'Wallet unlock cancelled.'): void => {
    localUnlockResolverRef.current?.reject(new Error(reason));
    localUnlockResolverRef.current = null;
    setLocalUnlockWallet(null);
    setLocalUnlockPassword('');
    setLocalUnlockError('');
    setLocalUnlockBusy(false);
  };

  const submitLocalWalletUnlock = async (): Promise<void> => {
    if (!localUnlockWallet || localUnlockBusy) return;
    setLocalUnlockBusy(true);
    setLocalUnlockError('');
    try {
      const nextPrivateKey = await unlockWalletKey(localUnlockWallet, { password: localUnlockPassword });
      await authenticateWalletSession({
        privateKey: nextPrivateKey,
        walletAddress: localUnlockWallet.address,
        walletName: localUnlockWallet.walletName,
      });
      const resolver = localUnlockResolverRef.current;
      localUnlockResolverRef.current = null;
      setLocalUnlockWallet(null);
      setLocalUnlockPassword('');
      setLocalUnlockBusy(false);
      resolver?.resolve({ password: localUnlockPassword, privateKey: nextPrivateKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to unlock this wallet.';
      setLocalUnlockError(message);
      if (error instanceof Error && error.name === 'LocalVaultMissingError') {
        setOrphanWalletAddress(localUnlockWallet.address);
      }
      setLocalUnlockBusy(false);
    }
  };

  const requireWalletPrivateKey = async (): Promise<Uint8Array> => {
    if (privateKey) return privateKey;
    if (!keystore) throw new Error(copy.walletLocked);
    const nextPrivateKey = keystore.keyScheme === 'local-mnemonic-v1'
      ? (await requestLocalWalletUnlock(keystore)).privateKey
      : await unlockWalletKey(keystore);
    unlockWithWalletKey(nextPrivateKey, keystore);
    return nextPrivateKey;
  };

  const miniAppSessionAddress = getMiniAppSessionAddress(isAuthenticated, address);

  useEffect(() => {
    requireWalletPrivateKeyRef.current = requireWalletPrivateKey;
  });

  useEffect(() => {
    if (!activeMiniApp || !miniAppUrl) return;
    const manifest = getMiniAppManifest(activeMiniApp.id);
    if (!manifest) return;

    let miniAppOrigin: string;
    try {
      miniAppOrigin = new URL(miniAppUrl).origin;
    } catch {
      return;
    }
    if (!isAllowedMiniAppOrigin(manifest, miniAppOrigin, activeMiniApp.url)) return;

    const postToMiniApp = (payload: Record<string, unknown>, target?: WindowProxy | null) => {
      (target || miniAppWindowRef.current || miniAppIframeRef.current?.contentWindow)?.postMessage({
        channel: 'injpass-miniapp-v1',
        ...payload,
      }, miniAppOrigin);
    };
    const sendSession = (target?: WindowProxy | null) => postToMiniApp({
      type: 'session',
      session: {
        authenticated: isAuthenticated,
        address: miniAppSessionAddress,
        walletName: keystore?.walletName,
        chainId: manifest.chainId,
        language: selectedLanguageCode,
      },
    }, target);

    const handleMiniAppMessage = (event: MessageEvent) => {
      if (event.origin !== miniAppOrigin || !event.source) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.channel !== 'injpass-miniapp-v1') return;
      const source = event.source as WindowProxy;
      miniAppWindowRef.current = source;
      if (message.type === 'navigation' && typeof message.path === 'string') {
        const nextPath = message.path.startsWith('/') ? message.path.slice(0, 2_048) : '/';
        setMiniAppNavigation({
          path: nextPath,
          title: typeof message.title === 'string' ? message.title.slice(0, 160) : activeMiniApp.name,
          canGoBack: message.canGoBack === true,
          canGoForward: message.canGoForward === true,
        });
        setMiniAppLoading(false);
        if (miniAppLoadingTimerRef.current) {
          window.clearTimeout(miniAppLoadingTimerRef.current);
          miniAppLoadingTimerRef.current = null;
        }
        return;
      }
      if (message.type === 'ready') {
        sendSession(source);
        return;
      }
      if (
        message.type !== 'rpc-request'
        || typeof message.id !== 'string'
        || typeof message.method !== 'string'
      ) return;

      const respond = (result?: unknown, error?: { code: number; message: string; data?: unknown }) => {
        postToMiniApp({
          type: 'rpc-response',
          id: message.id,
          ...(error ? { error } : { result }),
        }, source);
      };

      if (message.method === 'injpass_requestLogin') {
        setAuthError('');
        setOrphanWalletAddress(null);
        setLocalWallets(loadWallets());
        void detectPrfSupport().then(setPrfDetection).catch(() => undefined);
        authMenuPinnedRef.current = true;
        if (authMenuTimerRef.current) {
          window.clearTimeout(authMenuTimerRef.current);
          authMenuTimerRef.current = null;
        }
        setAuthMethod('mnemonic');
        setAuthMenuOpen(true);
        respond(true);
        return;
      }

      if (message.method === 'injpass_requestLogout') {
        void logout()
          .then(() => respond(true))
          .catch((error) => respond(undefined, {
            code: -32603,
            message: error instanceof Error ? error.message : 'Unable to sign out.',
          }));
        return;
      }

      if (message.method === 'injpass_mintCatNft') {
        if (activeMiniApp.id !== 'eric-mfer') {
          respond(undefined, { code: 4100, message: 'This app cannot request a CatNFT mint.' });
          return;
        }
        if (!miniAppSessionAddress) {
          respond(undefined, { code: 4100, message: 'Log in to INJ Pass before minting.' });
          return;
        }

        void requireWalletPrivateKeyRef.current()
          .then((signingKey) => mintSponsoredCatNFT(signingKey))
          .then((result) => {
            resetTxAuth();
            setWalletPanelData((current) => ({ ...current, nfts: undefined }));
            respond(result);
          })
          .catch((error) => respond(undefined, {
            code: -32603,
            message: error instanceof Error ? error.message : 'Unable to mint this NFT.',
          }));
        return;
      }

      void handleMiniAppRpc(
        message.method,
        Array.isArray(message.params) ? message.params : [],
        {
          manifest,
          address: miniAppSessionAddress as Address | null,
          getPrivateKey: () => requireWalletPrivateKeyRef.current(),
        },
      ).then((result) => respond(result)).catch((error) => {
        const bridgeError = error instanceof MiniAppHostError ? error : null;
        respond(undefined, {
          code: bridgeError?.code ?? -32603,
          message: error instanceof Error ? error.message : 'INJ Pass mini app request failed.',
          data: bridgeError?.data,
        });
      });
    };

    window.addEventListener('message', handleMiniAppMessage);
    sendSession();
    return () => {
      window.removeEventListener('message', handleMiniAppMessage);
      miniAppWindowRef.current = null;
    };
  }, [activeMiniApp, isAuthenticated, keystore?.walletName, logout, miniAppSessionAddress, miniAppUrl, resetTxAuth, selectedLanguageCode]);

  useEffect(() => {
    if (!miniAppAgentRun) return;

    let miniAppOrigin: string;
    try {
      miniAppOrigin = new URL(miniAppAgentRun.src).origin;
    } catch {
      return;
    }
    if (!isAllowedMiniAppOrigin(
      miniAppAgentRun.manifest,
      miniAppOrigin,
      miniAppAgentRun.baseOverride,
    )) return;

    let commandSent = false;
    const postToAgentApp = (payload: Record<string, unknown>, target?: WindowProxy | null) => {
      (target || miniAppAgentWindowRef.current || miniAppAgentIframeRef.current?.contentWindow)?.postMessage({
        channel: 'injpass-miniapp-v1',
        ...payload,
      }, miniAppOrigin);
    };
    const sendSession = (target?: WindowProxy | null) => postToAgentApp({
      type: 'session',
      session: {
        authenticated: isAuthenticated,
        address: address || null,
        walletName: keystore?.walletName,
        chainId: miniAppAgentRun.manifest.chainId,
        language: selectedLanguageCode,
      },
    }, target);
    const sendCommand = (target?: WindowProxy | null) => {
      if (commandSent) return;
      commandSent = true;
      postToAgentApp({
        type: 'agent-command',
        id: miniAppAgentRun.id,
        command: miniAppAgentRun.command,
      }, target);
    };
    const respond = (
      id: string,
      result?: unknown,
      error?: { code: number; message: string; data?: unknown },
      target?: WindowProxy | null,
    ) => postToAgentApp({
      type: 'rpc-response',
      id,
      ...(error ? { error } : { result }),
    }, target);

    const handleAgentAppMessage = (event: MessageEvent) => {
      if (event.origin !== miniAppOrigin || !event.source) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.channel !== 'injpass-miniapp-v1') return;
      const source = event.source as WindowProxy;
      miniAppAgentWindowRef.current = source;

      if (message.type === 'ready') {
        sendSession(source);
        sendCommand(source);
        return;
      }

      if (
        message.type === 'agent-command-result'
        && message.id === miniAppAgentRun.id
      ) {
        const pending = miniAppAgentResolverRef.current;
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pending.cleanupAbort?.();
        miniAppAgentResolverRef.current = null;
        setMiniAppAgentRun((current) => current?.id === miniAppAgentRun.id ? null : current);
        const result = message.result && typeof message.result === 'object'
          ? message.result as MiniAppAgentCommandResult
          : { ok: false, key: 'unknown_error' };
        pending.resolve(result);
        return;
      }

      if (
        message.type !== 'rpc-request'
        || typeof message.id !== 'string'
        || typeof message.method !== 'string'
      ) return;
      const requestId = message.id;
      const requestMethod = message.method;

      if (requestMethod === 'injpass_requestLogin') {
        setAuthError('');
        setOrphanWalletAddress(null);
        setLocalWallets(loadWallets());
        void detectPrfSupport().then(setPrfDetection).catch(() => undefined);
        authMenuPinnedRef.current = true;
        setAuthMethod('mnemonic');
        setAuthMenuOpen(true);
        respond(requestId, true, undefined, source);
        return;
      }

      if (requestMethod === 'injpass_requestLogout') {
        void logout()
          .then(() => respond(requestId, true, undefined, source))
          .catch((error) => respond(requestId, undefined, {
            code: -32603,
            message: error instanceof Error ? error.message : 'Unable to sign out.',
          }, source));
        return;
      }

      void handleMiniAppRpc(
        requestMethod,
        Array.isArray(message.params) ? message.params : [],
        {
          manifest: miniAppAgentRun.manifest,
          address: address ? address as Address : null,
          getPrivateKey: () => requireWalletPrivateKeyRef.current(),
        },
      ).then((result) => respond(requestId, result, undefined, source)).catch((error) => {
        const bridgeError = error instanceof MiniAppHostError ? error : null;
        respond(requestId, undefined, {
          code: bridgeError?.code ?? -32603,
          message: error instanceof Error ? error.message : 'INJ Pass mini app request failed.',
          data: bridgeError?.data,
        }, source);
      });
    };

    window.addEventListener('message', handleAgentAppMessage);
    sendSession();
    return () => {
      window.removeEventListener('message', handleAgentAppMessage);
      miniAppAgentWindowRef.current = null;
    };
  }, [address, isAuthenticated, keystore?.walletName, logout, miniAppAgentRun, selectedLanguageCode]);

  const refreshAccountDeletionStatus = async () => {
    if (!isAuthenticated || accountActionState === 'deleted') {
      setAccountDeletionStatus(null);
      return;
    }
    setAccountStatusLoading(true);
    setAccountActionError('');
    try {
      setAccountDeletionStatus(await getAccountDeletionStatus());
    } catch (error) {
      setAccountActionError(
        error instanceof Error ? error.message : 'Unable to verify wallet assets.',
      );
    } finally {
      setAccountStatusLoading(false);
    }
  };

  const handleSweepAccountAssets = async () => {
    if (!keystore || !accountDeletionStatus) return;
    setAccountActionState('sweeping');
    setAccountActionError('');
    setAccountActionProgress(copy.checkingAssets);

    try {
      const signingKey = await requireWalletPrivateKey();
      unlockWithWalletKey(signingKey, keystore);
      await sweepAccountAssets(
        accountDeletionStatus,
        accountSweepTarget.trim(),
        signingKey,
        setAccountActionProgress,
      );
      resetTxAuth();
      setAccountActionProgress(copy.checkingAssets);
      await new Promise((resolve) => window.setTimeout(resolve, 2200));
      const refreshedStatus = await getAccountDeletionStatus();
      setAccountDeletionStatus(refreshedStatus);
      setAccountActionProgress('');
      setAccountActionState('idle');
    } catch (error) {
      setAccountActionError(
        error instanceof Error ? error.message : 'Unable to clear wallet assets.',
      );
      setAccountActionProgress('');
      setAccountActionState('idle');
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !keystore ||
      !accountDeletionStatus?.canDelete ||
      accountDeleteConfirmation !== 'DELETE'
    ) return;

    setAccountActionState('deleting');
    setAccountActionError('');
    setAccountActionProgress(copy.deleteRequiresPasskey);
    try {
      await requireWalletPrivateKey();
      await deleteInjPassAccount();
      const signaled = keystore.credentialId
        ? await signalDeletedPasskey(keystore.credentialId)
        : false;
      setPasskeyRemovalSignaled(signaled);
      deleteWallet();
      await logout();
      setLocalWallets(loadWallets());
      setAccountActionProgress('');
      setAccountActionState('deleted');
    } catch (error) {
      setAccountActionError(
        error instanceof Error ? error.message : 'Unable to delete this account.',
      );
      setAccountActionProgress('');
      setAccountActionState('idle');
    }
  };

  useEffect(() => {
    if (
      profileOpen &&
      profilePanel === 'preferences' &&
      preferenceSection === 'account' &&
      isAuthenticated &&
      accountActionState !== 'deleted'
    ) {
      void refreshAccountDeletionStatus();
    }
    // The status is intentionally refreshed only when the account section opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen, profilePanel, preferenceSection, isAuthenticated]);

  const updateWalletInviteCode = (value: string) => {
    walletInviteValidationRequestRef.current += 1;
    setWalletInviteCode(normalizeWalletInviteCode(value));
    setWalletInviteValidation('idle');
    setWalletInviteValidationMessage('');
    setAuthError('');
  };

  const prepareWalletInviteCode = (includeInvite: boolean) => {
    walletInviteValidationRequestRef.current += 1;
    setWalletInviteCode(includeInvite ? readInviteCodeFromLocation() : '');
    setWalletInviteValidation('idle');
    setWalletInviteValidationMessage('');
  };

  const handleValidateWalletInvite = async () => {
    const code = normalizeWalletInviteCode(walletInviteCode);
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      setWalletInviteValidation('invalid');
      setWalletInviteValidationMessage('Enter a valid 8-character INJ Pass invite code.');
      return;
    }

    const requestId = ++walletInviteValidationRequestRef.current;
    setWalletInviteValidation('checking');
    setWalletInviteValidationMessage('Checking this invite code...');
    const result = await validateInviteCode(code);
    if (requestId !== walletInviteValidationRequestRef.current) return;

    if (result.valid) {
      setWalletInviteValidation('valid');
      setWalletInviteValidationMessage('Invite code applied. Referral rewards will be added after registration.');
    } else {
      setWalletInviteValidation('invalid');
      setWalletInviteValidationMessage('This invite code is not valid. Check it or skip this step.');
    }
  };

  const openTraditionalWalletWizard = (mode: TraditionalWalletWizardMode) => {
    setWalletSetupMethod('traditional');
    setTraditionalWalletWizardMode(mode);
    setTraditionalWalletWizardStep(0);
    setNewWalletName('My INJ Pass');
    setNewWalletPassword('');
    setNewWalletPasswordConfirm('');
    setRecoveryMnemonic('');
    setPreparedMnemonicWallet(mode === 'create' ? prepareLocalWalletSetup() : null);
    prepareWalletInviteCode(mode === 'create');
    setAuthError('');
    setOrphanWalletAddress(null);
    setAuthMenuOpen(false);
    setTraditionalWalletWizardOpen(true);
  };

  const openPasskeyWalletWizard = () => {
    setWalletSetupMethod('passkey');
    setTraditionalWalletWizardMode('create');
    setTraditionalWalletWizardStep(0);
    setNewWalletName('My INJ Pass');
    setNewWalletPassword('');
    setNewWalletPasswordConfirm('');
    setRecoveryMnemonic('');
    setPreparedMnemonicWallet(null);
    prepareWalletInviteCode(true);
    setAuthError('');
    setOrphanWalletAddress(null);
    setAuthMenuOpen(false);
    setTraditionalWalletWizardOpen(true);
    void detectPrfSupport().then(setPrfDetection).catch(() => undefined);
  };

  const closeTraditionalWalletWizard = () => {
    if (authPendingAction) return;
    setTraditionalWalletWizardOpen(false);
    setTraditionalWalletWizardStep(0);
    setNewWalletName('');
    setNewWalletPassword('');
    setNewWalletPasswordConfirm('');
    setRecoveryMnemonic('');
    setPreparedMnemonicWallet(null);
    prepareWalletInviteCode(false);
    setAuthError('');
  };

  const handleCreateTraditionalWallet = async () => {
    if (authPendingAction) return;
    setAuthPendingAction('create');
    setAuthError('');
    setOrphanWalletAddress(null);

    try {
      const walletName = newWalletName.trim() || 'My INJ Pass';
      const preparedMnemonic = preparedMnemonicWallet?.mnemonic;
      if (newWalletPassword !== newWalletPasswordConfirm) {
        throw new Error('The two wallet passwords do not match.');
      }
      if (traditionalWalletWizardMode === 'create' && !preparedMnemonic) {
        throw new Error('The wallet address preview expired. Close this window and start again.');
      }
      const result = traditionalWalletWizardMode === 'recover'
        ? await importMnemonicWallet({
          mnemonic: recoveryMnemonic,
          password: newWalletPassword,
          walletName,
        })
        : await completeLocalWalletSetup({
          password: newWalletPassword,
          walletName,
          mnemonic: preparedMnemonic,
        });
      const createdWallet = loadWallet();
      if (!createdWallet) {
        throw new Error('The encrypted wallet was saved, but its local metadata could not be loaded.');
      }
      await authenticateWalletSession({
        privateKey: result.privateKey,
        walletAddress: result.address,
        walletName,
        inviteCode: traditionalWalletWizardMode === 'create' && walletInviteValidation === 'valid'
          ? walletInviteCode
          : undefined,
      });
      unlockWithWalletKey(result.privateKey, createdWallet);
      setMnemonicWords(result.mnemonicForBackup.split(/\s+/));
      setMnemonicBackedUpLocally(false);
      setMnemonicStep('words');
      setComposerIntroDeferredForBackup(true);
      setTraditionalWalletWizardOpen(false);
      setMnemonicBackupOpen(true);
      setNewWalletName('');
      setNewWalletPassword('');
      setNewWalletPasswordConfirm('');
      setRecoveryMnemonic('');
      setPreparedMnemonicWallet(null);
      prepareWalletInviteCode(false);
      setTraditionalWalletWizardStep(0);
      setLocalWallets(loadWallets());
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to create INJ Pass.');
    } finally {
      setAuthPendingAction(null);
    }
  };

  const handleCreatePasskeyWallet = async () => {
    if (authPendingAction) return;
    setAuthPendingAction('create');
    setAuthError('');
    setOrphanWalletAddress(null);

    try {
      const walletName = newWalletName.trim() || 'My INJ Pass';
      const detection = prfDetection || await detectPrfSupport();
      setPrfDetection(detection);
      // Detection is advisory only. The authenticator selected in the actual
      // WebAuthn ceremony is the source of truth for PRF support.
      const result = await createPrfWallet(
        walletName,
        walletInviteValidation === 'valid' ? walletInviteCode : undefined,
      );
      const createdWallet = loadWallet();
      if (!createdWallet) {
        throw new Error('The Passkey wallet was created but its local metadata could not be loaded.');
      }
      unlockWithWalletKey(result.privateKey, createdWallet);
      setMnemonicWords([]);
      setMnemonicBackedUpLocally(true);
      setTraditionalWalletWizardOpen(false);
      setAuthMenuOpen(false);
      setNewWalletName('');
      prepareWalletInviteCode(false);
      setLocalWallets(loadWallets());
    } catch (error) {
      if (error instanceof PrfUnsupportedError) {
        // Match the test-branch behavior: keep the creation wizard open and
        // switch to the user-selectable mnemonic/password method after the real
        // authenticator confirms PRF is unavailable.
        setWalletSetupMethod('traditional');
        setTraditionalWalletWizardMode('create');
        setTraditionalWalletWizardStep(0);
        setNewWalletPassword('');
        setNewWalletPasswordConfirm('');
        setPreparedMnemonicWallet(prepareLocalWalletSetup());
        setAuthError(
          'This authenticator does not support secure Passkey PRF. Continue with the Traditional wallet option to create a recoverable 24-word wallet protected by a local password.',
        );
      } else {
        setAuthError(error instanceof Error ? error.message : 'Failed to create INJ Pass.');
      }
    } finally {
      setAuthPendingAction(null);
    }
  };

  const handleEnterPasskey = async () => {
    if (authPendingAction) return;
    setAuthPendingAction('enter');
    setAuthError('');
    setOrphanWalletAddress(null);

    try {
      await enterExistingPasskey({
        recover: recoverWallet,
        loadRecoveredWallet: loadWallet,
        unlock: unlockWithWalletKey,
      });
      setLocalWallets(loadWallets());
      setAuthMenuOpen(false);
    } catch (error) {
      setAuthMenuOpen(true);
      setAuthError(error instanceof Error ? error.message : 'Failed to enter INJ Pass.');
    } finally {
      setAuthPendingAction(null);
    }
  };

  const handleEnterLocalWallet = async (wallet: LocalKeystore) => {
    if (authPendingAction) return;
    setAuthPendingAction('enter');
    setAuthError('');
    try {
      const selectedWallet = setActiveWallet(wallet.address) || wallet;
      const nextPrivateKey = selectedWallet.keyScheme === 'local-mnemonic-v1'
        ? (await requestLocalWalletUnlock(selectedWallet)).privateKey
        : await unlockWalletKey(selectedWallet);
      unlockWithWalletKey(nextPrivateKey, selectedWallet);
      setAuthMenuOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to enter this wallet.');
    } finally {
      setAuthPendingAction(null);
    }
  };

  const handleLoginEntry = () => {
    setAuthError('');
    setOrphanWalletAddress(null);
    setLocalWallets(loadWallets());
    void detectPrfSupport().then(setPrfDetection).catch(() => undefined);
    authMenuPinnedRef.current = false;
    setAuthMenuOpen((current) => !current);
  };

  const keepAuthMenuOpen = () => {
    if (authMenuTimerRef.current) window.clearTimeout(authMenuTimerRef.current);
    authMenuTimerRef.current = null;
  };

  const scheduleAuthMenuClose = () => {
    if (authMenuPinnedRef.current) return;
    if (authMenuTimerRef.current) window.clearTimeout(authMenuTimerRef.current);
    authMenuTimerRef.current = window.setTimeout(() => {
      setAuthMenuOpen(false);
      authMenuTimerRef.current = null;
    }, 850);
  };

  const pinAuthMenuOpen = () => {
    authMenuPinnedRef.current = true;
    if (authMenuTimerRef.current) window.clearTimeout(authMenuTimerRef.current);
    authMenuTimerRef.current = null;
  };

  const keepModelMenuOpen = () => {
    if (modelMenuTimerRef.current) window.clearTimeout(modelMenuTimerRef.current);
    modelMenuTimerRef.current = window.setTimeout(() => {
      setModelMenuOpen(false);
      modelMenuTimerRef.current = null;
    }, 850);
  };

  const keepComposerToolsOpen = () => {
    if (composerToolsTimerRef.current) window.clearTimeout(composerToolsTimerRef.current);
    composerToolsTimerRef.current = window.setTimeout(() => {
      setComposerToolsOpen(false);
      composerToolsTimerRef.current = null;
    }, 850);
  };

  const keepProfileMenuOpen = () => {
    if (!profileOpen || profilePanel !== 'menu') return;
    if (profileMenuTimerRef.current) window.clearTimeout(profileMenuTimerRef.current);
    profileMenuTimerRef.current = window.setTimeout(() => {
      setProfileOpen(false);
      profileMenuTimerRef.current = null;
    }, QUICK_MENU_AUTO_HIDE_MS);
  };

  const pauseComposerDemo = () => {
    if (composerDemoResumeTimerRef.current) window.clearTimeout(composerDemoResumeTimerRef.current);
    composerDemoResumeTimerRef.current = null;
    setComposerDemoDismissed(true);
  };

  const scheduleComposerDemoResume = (value: string) => {
    if (composerDemoResumeTimerRef.current) window.clearTimeout(composerDemoResumeTimerRef.current);
    composerDemoResumeTimerRef.current = null;
    if (value.trim()) return;
    composerDemoResumeTimerRef.current = window.setTimeout(() => {
      if (!composerInputRef.current?.value.trim()) setComposerDemoDismissed(false);
      composerDemoResumeTimerRef.current = null;
    }, 3000);
  };

  const openSupportChat = () => {
    setMobileSidebarOpen(false);
    setProfileOpen(false);
    window.dispatchEvent(new CustomEvent('injpass:open-support'));
  };

  if (!isThemeReady) {
    return <ShellWarmup />;
  }

  return (
    <main className={cx('inj-shell-font relative h-dvh overflow-hidden transition-colors', isCreativeBuildSession && 'inj-creative-build-active', surfaceTone)} data-inj-entry={entry}>
      <ShellMotionStyles />
      <SandboxIntroModal
        open={sandboxIntroOpen}
        page={sandboxIntroPage}
        pages={localizedSandboxIntro}
        controls={sandboxIntroControls[selectedLanguageCode]}
        isLight={isLight}
        onPage={setSandboxIntroPage}
        onComplete={completeSandboxIntro}
      />
      <ComposerSyntaxIntroModal
        open={composerIntroOpen}
        page={composerIntroPage}
        pages={composerIntroByLanguage[selectedLanguageCode]}
        controls={composerIntroControls[selectedLanguageCode]}
        isLight={isLight}
        onPage={setComposerIntroPage}
        onComplete={completeComposerIntro}
        onContinueSandbox={continueComposerIntroToSandbox}
      />
      <CreativeIntroModal
        open={creativeIntroOpen}
        page={creativeIntroPage}
        pages={localizedCreativeIntro}
        controls={creativeIntroControls[selectedLanguageCode]}
        isLight={isLight}
        onPage={setCreativeIntroPage}
        onComplete={completeCreativeIntro}
      />
      <ConversationSearchModal
        open={conversationSearchOpen}
        isAuthenticated={isAuthenticated}
        isLight={isLight}
        copy={copy}
        query={conversationSearchQuery}
        inputRef={conversationSearchInputRef}
        results={conversationSearchResults}
        loading={isSearchingConversations || isLoadingConversations}
        onQuery={setConversationSearchQuery}
        onClose={() => setConversationSearchOpen(false)}
        onOpenConversation={(conversationId) => {
          setConversationSearchOpen(false);
          void openStoredConversation(conversationId);
        }}
      />
      <div className="flex h-full min-h-0">
        <MobileSidebarFrame
          open={mobileSidebarOpen}
          isLight={isLight}
          onClose={() => setMobileSidebarOpen(false)}
        >
        <div
          className={cx(
            'inj-glass-surface flex h-full w-full shrink-0 flex-col overflow-y-auto border-r py-3 px-3 transition-[width,padding] duration-300',
            sidebarCollapsed ? 'lg:w-[76px] lg:px-2' : 'lg:w-[286px] lg:px-3',
            sidebarTone
          )}
        >
          <div className={cx('flex items-center py-2', sidebarCollapsed ? 'justify-center px-1' : 'justify-between px-3')}>
            <div className={sidebarCollapsed ? 'lg:hidden' : undefined}>
              <div className="text-sm font-bold">INJ Pass</div>
              <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.brandSubtitle}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.matchMedia('(max-width: 1023px)').matches) {
                  setMobileSidebarOpen(false);
                } else {
                  setSidebarCollapsed((current) => !current);
                }
                setProfileOpen(false);
              }}
              className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition', isLight ? 'text-black/52 hover:bg-black/5 hover:text-black' : 'text-white/52 hover:bg-white/8 hover:text-white')}
              aria-label={mobileSidebarOpen ? 'Close navigation menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={mobileSidebarOpen ? 'Close navigation menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <CloseIcon className="h-4 w-4 lg:hidden" />
              <span className="hidden lg:block"><SidebarCollapseIcon collapsed={sidebarCollapsed} /></span>
            </button>
          </div>

          <div className="mt-3 space-y-1">
            <button
              type="button"
              onClick={() => {
                setMobileSidebarOpen(false);
                switchProductMode('chat');
                setActiveChatSurface('default');
                setMessages([]);
                setCurrentConversationTitle('');
                setAgentConversationId(undefined);
                setSelectedStoredConversationId(undefined);
                setCreativeConversationId(undefined);
                setCreativePrompt('');
                setCreativeStage('guide');
                setCreativePlan(null);
                setCreativeBuild(null);
                setCreativeCompileResult(null);
                setCreativeCompileStatus('idle');
                setCreativeBuildError('');
                setCreativeError('');
                setCreativeBuildStep(0);
                setIsCreativePlanning(false);
                setPendingConfirmation(null);
                setActiveWalletTab(null);
                setConversationSearchOpen(false);
                setDraft('');
                setComposerTokens([]);
                setDroppedContext('');
                chatDraftRef.current = '';
                setChatWorkStatus('idle');
                setCreativeWorkStatus('idle');
                setSandboxAddress('');
                setSandboxPrivateKey('');
                setComposerToolsOpen(false);
                if (isAuthenticated) {
                  void getStoredAgentConversations().then(commitStoredConversations);
                }
              }}
              className={cx('flex h-10 w-full items-center rounded-xl text-sm font-semibold transition', sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
              title={sidebarCollapsed ? copy.newChat : undefined}
            >
              <PlusIcon />
              {!sidebarCollapsed && copy.newChat}
            </button>
            <button
              type="button"
              onClick={() => {
                if (sidebarCollapsed) setSidebarCollapsed(false);
                void loadBackendConversations();
              }}
              className={cx('flex h-10 w-full items-center rounded-xl text-sm font-semibold transition', sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
              title={sidebarCollapsed ? copy.searchChats : undefined}
            >
              <SearchIcon />
              {!sidebarCollapsed && copy.searchChats}
            </button>
          </div>

          <div className={cx('my-3 h-px', isLight ? 'bg-black/8' : 'bg-white/8')} />

          <button
            type="button"
            onClick={() => setWalletOpen((current) => !current)}
            aria-expanded={walletOpen}
            className={cx(
              'flex h-10 w-full items-center rounded-xl text-sm font-bold transition',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3',
              walletOpen ? (isLight ? 'bg-white' : 'bg-white/[0.07]') : (isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')
            )}
          >
            <span className="flex items-center gap-3">
              <WalletIcon />
              {!sidebarCollapsed && copy.wallet}
            </span>
            {!sidebarCollapsed && <ChevronDownIcon
              className={cx(
                'h-4 w-4 transition-transform duration-300',
                walletOpen && 'rotate-180',
                isLight ? 'text-black/42' : 'text-white/42'
              )}
            />}
          </button>

          {walletOpen && !sidebarCollapsed && (
            <div className="inj-liquid-menu mt-1 space-y-1 pl-2">
              {walletTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => void openWalletPanel(tab.id)}
                  className={cx(
                    'inj-subtle-line flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition',
                    activeWalletTab === tab.id && activeMode === 'chat'
                    && activeChatSurface === 'default'
                      ? isLight
                        ? 'bg-black text-white'
                        : 'bg-white text-black'
                      : isLight
                        ? 'text-black/70 hover:bg-black/5'
                        : 'text-white/70 hover:bg-white/8'
                  )}
                  data-active={activeWalletTab === tab.id && activeMode === 'chat' && activeChatSurface === 'default'}
                >
                  <span>{tab.id === 'tokens' ? copy.assets : tab.label}</span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={openDAppMarket}
            aria-expanded={dappMarketOpen}
            className={cx(
              'mt-2 flex h-10 w-full items-center rounded-xl text-sm font-bold transition',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3',
              activeMode === 'chat' && activeChatSurface === 'dapp-market'
                ? isLight
                  ? 'bg-white'
                  : 'bg-white/[0.07]'
                : isLight
                  ? 'hover:bg-black/5'
                  : 'hover:bg-white/8'
            )}
          >
            <span className="flex items-center gap-3">
              <DAppMarketIcon />
              {!sidebarCollapsed && copy.dappMarket}
            </span>
            {!sidebarCollapsed && <ChevronDownIcon
              className={cx(
                'h-4 w-4 transition-transform duration-300',
                dappMarketOpen && 'rotate-180',
                isLight ? 'text-black/42' : 'text-white/42'
              )}
            />}
          </button>

          {dappMarketOpen && !sidebarCollapsed && (
            <div className="inj-liquid-menu mt-1 space-y-1 pl-2">
              {pinnedDApps.length === 0 && (
                <div className={cx('rounded-xl px-3 py-2 text-xs leading-5', isLight ? 'text-black/42' : 'text-white/42')}>
                  {copy.pinnedEmpty}
                </div>
              )}
              {pinnedDApps.map((app) => (
                <div
                  key={app.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(event) => handleDAppDragStart(event, app)}
                  onPointerDown={(event) => handleDAppPointerDown(event, app)}
                  onPointerUp={clearPointerDApp}
                  onClick={() => openDApp(app)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDApp(app);
                    }
                  }}
                  className={cx(
                    'inj-subtle-line flex w-full cursor-grab items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition active:cursor-grabbing',
                    isLight ? 'text-black/70 hover:bg-black/5' : 'text-white/70 hover:bg-white/8'
                  )}
                >
                  <span className="min-w-0 truncate">{app.name}</span>
                  <span className="text-[10px] opacity-54">{copy.drag}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={openCampaign}
            aria-expanded={campaignOpen}
            className={cx(
              'mt-2 flex h-10 w-full items-center rounded-xl text-sm font-bold transition',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3',
              activeMode === 'chat' && activeChatSurface === 'campaign'
                ? isLight ? 'bg-white' : 'bg-white/[0.07]'
                : isLight ? 'hover:bg-black/5' : 'hover:bg-white/8'
            )}
          >
            <span className="flex items-center gap-3">
              <CampaignIcon />
              {!sidebarCollapsed && copy.campaign}
            </span>
            {!sidebarCollapsed && <ChevronDownIcon className={cx('h-4 w-4 transition-transform duration-300', campaignOpen && 'rotate-180', isLight ? 'text-black/42' : 'text-white/42')} />}
          </button>

          {campaignOpen && !sidebarCollapsed && (
            <div className="inj-liquid-menu mt-1 pl-2">
              <button
                type="button"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  switchProductMode('chat');
                  setActiveChatSurface('campaign');
                  setActiveWalletTab(null);
                }}
                className={cx('inj-subtle-line w-full rounded-xl px-3 py-2 text-left text-sm transition', isLight ? 'text-black/70 hover:bg-black/5' : 'text-white/70 hover:bg-white/8')}
              >
                {copy.comingSoon}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={openSkills}
            className={cx(
              'mt-2 flex h-10 w-full items-center rounded-xl text-sm font-semibold transition',
              sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
              activeMode === 'chat' && activeChatSurface === 'skills'
                ? isLight ? 'bg-white' : 'bg-white/[0.07]'
                : isLight ? 'hover:bg-black/5' : 'hover:bg-white/8'
            )}
            title={sidebarCollapsed ? copy.skills : undefined}
          >
            <SkillsIcon />
            {!sidebarCollapsed && copy.skills}
          </button>

          <button
            type="button"
            onClick={openCloudDrive}
            className={cx(
              'mt-2 flex h-10 w-full items-center rounded-xl text-sm font-semibold transition',
              sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
              activeMode === 'chat' && activeChatSurface === 'cloud-drive'
                ? isLight ? 'bg-white' : 'bg-white/[0.07]'
                : isLight ? 'hover:bg-black/5' : 'hover:bg-white/8'
            )}
            title={sidebarCollapsed ? copy.createSpace : undefined}
          >
            <CloudIcon />
            {!sidebarCollapsed && copy.createSpace}
          </button>

          <div className={cx('my-3 h-px', isLight ? 'bg-black/8' : 'bg-white/8')} />

          <div className={cx('space-y-1', sidebarCollapsed && 'hidden')}>
            <div className="flex items-center justify-between px-3">
              <div className={cx('text-xs font-semibold uppercase tracking-[0.16em]', isLight ? 'text-black/38' : 'text-white/38')}>
                {copy.recent}
              </div>
            </div>
            {currentConversationTitle && !agentConversationId && !creativeConversationId && !selectedStoredConversationId && (
              <button
                type="button"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  setActiveChatSurface('default');
                  switchProductMode('chat');
                }}
                className={cx('block w-full truncate rounded-xl px-3 py-2 text-left text-sm font-semibold transition', isLight ? 'bg-white text-black' : 'bg-white/[0.08] text-white')}
              >
                {currentConversationTitle}
              </button>
            )}
            {visibleStoredConversations.length > 0
              ? visibleStoredConversations
                .slice(0, currentConversationTitle && !selectedStoredConversationId ? 7 : 8)
                .map((conversation) => (
                <div
                  key={conversation.id}
                  className="relative"
                  onMouseEnter={() => showConversationDelete(conversation.id)}
                >
                  <button
                    type="button"
                    onClick={() => void openStoredConversation(conversation.id)}
                    className={cx(
                      'flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 pr-[4.25rem] text-left text-sm transition',
                      conversation.id === selectedStoredConversationId
                        ? isLight ? 'bg-white text-black' : 'bg-white/[0.08] text-white'
                        : isLight ? 'text-black/62 hover:bg-black/5' : 'text-white/58 hover:bg-white/8'
                    )}
                  >
                    <span className={cx('shrink-0 text-[9px] font-bold uppercase tracking-[0.08em]', isLight ? 'text-black/34' : 'text-white/34')}>
                      {conversation.model === 'agent-os-build' ? 'Build' : 'Chat'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{conversation.title || 'New chat'}</span>
                  </button>
                  {historyDeleteVisibleId === conversation.id && (
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5" onMouseEnter={() => showConversationDelete(conversation.id)}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePinnedConversation(conversation.id);
                        }}
                        className={cx('flex h-7 w-7 items-center justify-center rounded-lg transition', pinnedConversationIds.includes(conversation.id) ? 'text-violet-500' : isLight ? 'text-black/42 hover:bg-black/5 hover:text-black' : 'text-white/42 hover:bg-white/8 hover:text-white')}
                        aria-label={`${pinnedConversationIds.includes(conversation.id) ? 'Unpin' : 'Pin'} ${conversation.title || 'conversation'}`}
                        title={pinnedConversationIds.includes(conversation.id) ? 'Unpin conversation' : 'Pin conversation'}
                      >
                        <PinIcon pinned={pinnedConversationIds.includes(conversation.id)} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteConversation(conversation.id);
                        }}
                        className={cx('flex h-7 w-7 items-center justify-center rounded-lg transition', isLight ? 'text-black/42 hover:bg-rose-50 hover:text-rose-600' : 'text-white/42 hover:bg-rose-300/10 hover:text-rose-200')}
                        aria-label={`Delete ${conversation.title || 'conversation'}`}
                        title="Delete conversation"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
              : !currentConversationTitle && (
                <div className={cx('rounded-xl px-3 py-2 text-xs', isLight ? 'text-black/36' : 'text-white/36')}>
                  {copy.noSavedChats}
                </div>
              )}
          </div>

          <div className="mt-auto space-y-3">
            {hasPendingMnemonicBackup && !sidebarCollapsed && (
              <button
                type="button"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  void openMnemonicBackup();
                }}
                className={cx(
                  'w-full rounded-2xl border px-3 py-3 text-left transition',
                  isLight ? 'border-amber-300/70 bg-amber-50 text-amber-950 hover:bg-amber-100/70' : 'border-amber-200/18 bg-amber-200/8 text-amber-100 hover:bg-amber-200/12'
                )}
              >
                <span className="block text-sm font-bold">{copy.recoveryPending}</span>
                <span className="mt-1 block text-xs leading-5 opacity-65">{copy.recoveryPendingBody}</span>
                <span className="mt-2 block text-xs font-bold">{copy.backUpNow}</span>
              </button>
            )}
            {isAuthenticated && <div className={cx('relative', !profileOpen && !sidebarCollapsed ? 'pt-7' : 'pt-0')}>
              {!profileOpen && !sidebarCollapsed && <div className="absolute left-3 top-px z-10 flex h-7 items-end gap-1 text-[10px] font-bold">
                <span className={cx('inline-flex h-7 items-center rounded-t-lg border border-b-0 px-2', isLight ? 'border-black/9 bg-[#f5f5f3] text-black/48' : 'border-white/8 bg-[#141416] text-white/48')}>
                  INJ · {formatAmount(sidebarWalletSummary.inj)}
                </span>
                <span className={cx('inline-flex h-7 items-center rounded-t-lg border border-b-0 px-2', isLight ? 'border-black/9 bg-[#f5f5f3] text-black/48' : 'border-white/8 bg-[#141416] text-white/48')}>
                  LAM · {formatAmount(sidebarWalletSummary.lam, 2)}
                </span>
              </div>}
              {profileOpen && (
                <OverlayPortal enabled={profilePanel !== 'menu'}>
                  <div
                    className={profilePanel === 'menu'
                      ? cx(
                        'inj-glass-surface inj-liquid-menu absolute bottom-[58px] left-0 right-0 overflow-hidden rounded-2xl border shadow-2xl',
                        isLight ? 'border-black/8 bg-white/88 text-black shadow-black/10' : 'border-white/10 bg-[#19191c]/88 text-white shadow-black/40'
                      )
                      : 'fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm'}
                    onPointerEnter={profilePanel === 'menu' ? keepProfileMenuOpen : undefined}
                    onPointerMove={profilePanel === 'menu' ? keepProfileMenuOpen : undefined}
                    onFocusCapture={profilePanel === 'menu' ? keepProfileMenuOpen : undefined}
                    onClick={profilePanel === 'menu' ? undefined : () => {
                      setProfilePanel('menu');
                      setProfileOpen(false);
                    }}
                  >
                    <div
                      role={profilePanel === 'menu' ? undefined : 'dialog'}
                      aria-modal={profilePanel === 'menu' ? undefined : true}
                      aria-label={profilePanel === 'menu' ? undefined : profilePanel === 'language' ? copy.language : profilePanel === 'tokens' ? copy.aiTokens : copy.preferences}
                      onClick={(event) => event.stopPropagation()}
                      className={cx(
                        'max-h-[min(82vh,720px)] overflow-y-auto p-2',
                        profilePanel !== 'menu' && 'inj-glass-surface inj-liquid-menu w-full max-w-4xl rounded-2xl border p-4 shadow-2xl',
                        profilePanel !== 'menu' && (isLight ? 'border-black/8 bg-white/96 text-black' : 'border-white/10 bg-[#19191c]/96 text-white')
                      )}
                    >
                    {profilePanel !== 'menu' && (
                      <div className="mb-1 flex items-center gap-2 px-1 py-1">
                        <button
                          type="button"
                          onClick={() => setProfilePanel('menu')}
                          className={cx('rounded-full px-2.5 py-1 text-xs font-bold transition', isLight ? 'hover:bg-black/5 text-black/62' : 'hover:bg-white/8 text-white/62')}
                        >
                          {copy.back}
                        </button>
                        <div className="text-sm font-semibold">
                          {profilePanel === 'language'
                            ? copy.language
                            : profilePanel === 'tokens'
                              ? copy.aiTokens
                              : copy.preferences}
                        </div>
                      </div>
                    )}

                    {profilePanel === 'menu' && (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setMobileSidebarOpen(false);
                            setProfilePanel('tokens');
                            void refreshAiTokenPanel();
                          }}
                          className={cx('w-full rounded-xl px-3 py-2 text-left transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">{copy.aiTokens}</div>
                            <div className={cx('truncate text-xs font-semibold', isLight ? 'text-black/48' : 'text-white/48')}>
                              {formatAmount(aiTokenStatus?.balance ?? aiTokenProfile?.ninjaBalance ?? sidebarWalletSummary.lam, 2)} LAM
                            </div>
                          </div>
                          <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.aiTokensCaption}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileSidebarOpen(false);
                            setProfilePanel('language');
                          }}
                          className={cx('w-full rounded-xl px-3 py-2 text-left transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">{copy.language}</div>
                            <div className={cx('truncate text-xs font-semibold', isLight ? 'text-black/48' : 'text-white/48')}>{selectedLanguage.label}</div>
                          </div>
                          <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.languageCaption}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileSidebarOpen(false);
                            setProfilePanel('preferences');
                          }}
                          className={cx('w-full rounded-xl px-3 py-2 text-left transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                        >
                          <div className="text-sm font-semibold">{copy.preferences}</div>
                          <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.preferencesCaption}</div>
                        </button>
                        <a
                          href="https://t.me/injpass"
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMobileSidebarOpen(false)}
                          className={cx('block w-full rounded-xl px-3 py-2 text-left transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                        >
                          <div className="text-sm font-semibold">{copy.community}</div>
                          <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.communityCaption}</div>
                        </a>
                        <button
                          type="button"
                          onClick={openSupportChat}
                          className={cx('block w-full rounded-xl px-3 py-2 text-left transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                        >
                          <div className="text-sm font-semibold">{copy.support}</div>
                          <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.supportCaption}</div>
                        </button>
                      </div>
                    )}

                    {profilePanel === 'tokens' && (
                      <div className="space-y-3">
                        {!isAuthenticated ? (
                          <div className={cx('rounded-xl border p-3 text-sm leading-6', isLight ? 'border-black/8 bg-black/[0.025] text-black/62' : 'border-white/8 bg-white/[0.04] text-white/62')}>
                            {copy.lockedTokenHint}
                          </div>
                        ) : (
                          <>
                            <div className={cx('inj-soft-panel rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                              <div className={cx('text-[11px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/42' : 'text-white/42')}>
                                {copy.aiTokenBalance}
                              </div>
                              <div className="mt-2 flex items-end justify-between gap-3">
                                <div className="inj-display-serif text-4xl leading-none">
                                  {formatAmount(aiTokenStatus?.balance ?? aiTokenProfile?.ninjaBalance ?? sidebarWalletSummary.lam, 2)}
                                </div>
                                <div className={cx('pb-1 text-sm font-semibold', isLight ? 'text-black/46' : 'text-white/46')}>LAM</div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleDailyCheckIn()}
                              disabled={dailyCheckInState === 'claiming' || dailyCheckInState === 'claimed' || dailyCheckInState === 'already-claimed'}
                              className={cx(
                                'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition disabled:cursor-default',
                                dailyCheckInState === 'claimed' || dailyCheckInState === 'already-claimed'
                                  ? isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-200/16 bg-emerald-300/8 text-emerald-200'
                                  : dailyCheckInState === 'error'
                                    ? isLight ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-200/16 bg-amber-300/8 text-amber-100'
                                    : isLight ? 'border-black/8 hover:bg-black/[0.035]' : 'border-white/8 hover:bg-white/[0.06]'
                              )}
                            >
                              <span>
                                <span className="block text-sm font-bold">{copy.dailyCheckIn}</span>
                                <span className={cx('mt-0.5 block text-xs', isLight ? 'text-black/46' : 'text-white/46')}>
                                  {dailyCheckInState === 'claimed' || dailyCheckInState === 'already-claimed' ? copy.checkedIn : copy.checkInReward}
                                </span>
                              </span>
                              <span className="text-sm font-bold">
                                {dailyCheckInState === 'claiming' ? '...' : dailyCheckInState === 'claimed' || dailyCheckInState === 'already-claimed' ? '✓' : '+1 LAM'}
                              </span>
                            </button>

                            <div className={cx('rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-bold">{copy.buyLam}</div>
                                  <div className={cx('mt-0.5 text-xs', isLight ? 'text-black/46' : 'text-white/46')}>{copy.buyLamBody}</div>
                                </div>
                                <span className={cx('shrink-0 text-xs font-bold', lamPurchaseState === 'complete' ? 'text-emerald-500' : isLight ? 'text-black/42' : 'text-white/42')}>
                                  {lamPurchaseState === 'complete' ? copy.purchaseComplete : 'INJ → LAM'}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                {LAM_PURCHASE_PLANS.map((plan) => (
                                  <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedLamPlanId(plan.planId);
                                      setLamPurchaseState('idle');
                                      setLamPurchaseError('');
                                    }}
                                    className={cx(
                                      'rounded-lg border px-2 py-2 text-xs font-bold transition',
                                      selectedLamPlanId === plan.planId
                                        ? isLight ? 'border-black bg-black text-white' : 'border-white bg-white text-black'
                                        : isLight ? 'border-black/8 hover:bg-black/5' : 'border-white/8 hover:bg-white/8'
                                    )}
                                  >
                                    <span className="block">{plan.lam} LAM</span>
                                    <span className={cx('mt-0.5 block text-[10px] font-semibold', selectedLamPlanId === plan.planId ? 'opacity-70' : isLight ? 'text-black/42' : 'text-white/42')}>
                                      {plan.inj} INJ
                                    </span>
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleLamPurchase()}
                                disabled={lamPurchaseState === 'submitting' || lamPurchaseState === 'confirming'}
                                className={cx('mt-2 h-10 w-full rounded-lg text-sm font-bold transition disabled:opacity-45', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}
                              >
                                {lamPurchaseState === 'submitting' || lamPurchaseState === 'confirming'
                                  ? `${copy.purchasing}...`
                                  : copy.buyLam}
                              </button>
                              {lamPurchaseError && (
                                <div className={cx('mt-2 text-xs leading-5', isLight ? 'text-rose-700' : 'text-rose-200')}>{lamPurchaseError}</div>
                              )}
                            </div>

                            <div className={cx('rounded-xl border p-3 text-sm', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                              <div className="flex items-center justify-between gap-3">
                                <span className={cx('font-semibold', isLight ? 'text-black/62' : 'text-white/62')}>{copy.inviteCode}</span>
                                <span className="font-mono font-semibold">{aiTokenProfile?.inviteCode || '—'}</span>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <span className={cx('font-semibold', isLight ? 'text-black/62' : 'text-white/62')}>{copy.memberSince}</span>
                                <span>{formatShortDate(aiTokenProfile?.createdAt)}</span>
                              </div>
                            </div>

                            <div className={cx('rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div className={cx('text-[11px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/42' : 'text-white/42')}>
                                  {copy.aiTokenLedger}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void refreshAiTokenPanel()}
                                  disabled={isAiTokenLoading}
                                  className={cx('rounded-full px-2.5 py-1 text-xs font-bold transition disabled:opacity-45', isLight ? 'hover:bg-black/5 text-black/62' : 'hover:bg-white/8 text-white/62')}
                                >
                                  {isAiTokenLoading ? copy.loading : copy.refresh}
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                {aiTokenTransactions.length === 0 && (
                                  <div className={cx('rounded-lg px-2 py-2 text-xs', isLight ? 'text-black/46' : 'text-white/46')}>
                                    {isAiTokenLoading ? copy.loading : copy.noTokenActivity}
                                  </div>
                                )}
                                {aiTokenTransactions.map((transaction) => (
                                  <div
                                    key={transaction.id}
                                    className={cx('flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs', isLight ? 'bg-white/70' : 'bg-black/18')}
                                  >
                                    <span className="min-w-0 truncate">{describePointsTransaction(transaction)}</span>
                                    <span className={transaction.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                      {transaction.amount >= 0 ? '+' : ''}
                                      {formatAmount(transaction.amount, 2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {profilePanel === 'language' && (
                      <div className="space-y-1">
                        {languageOptions.map((option) => {
                          const isActive = selectedLanguageCode === option.code;

                          return (
                            <button
                              key={option.code}
                              type="button"
                              onClick={() => selectLanguage(option.code)}
                              className={cx(
                                'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition',
                                isActive
                                  ? isLight
                                    ? 'bg-black text-white'
                                    : 'bg-white text-black'
                                  : isLight
                                    ? 'hover:bg-black/5'
                                    : 'hover:bg-white/8'
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className={cx('block text-xs', isActive ? 'opacity-70' : isLight ? 'text-black/46' : 'text-white/46')}>{option.caption}</span>
                              </span>
                              {isActive && <span className="text-xs font-bold">{copy.selected}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {profilePanel === 'preferences' && (
                      <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                        <nav className={cx('space-y-1 border-b pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3', isLight ? 'border-black/8' : 'border-white/8')} aria-label={`${copy.preferences} sections`}>
                          {([
                            { id: 'display', label: copy.display },
                            { id: 'security', label: copy.pinSecurity },
                            { id: 'wallet', label: copy.walletActions },
                            { id: 'account', label: copy.account },
                          ] as const).map((section) => (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() => setPreferenceSection(section.id)}
                              className={cx('block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition', preferenceSection === section.id ? isLight ? 'bg-black text-white' : 'bg-white text-black' : isLight ? 'text-black/54 hover:bg-black/5' : 'text-white/54 hover:bg-white/8')}
                            >
                              {section.label}
                            </button>
                          ))}
                          <Link href="/settings" className={cx('block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition', isLight ? 'text-black/54 hover:bg-black/5' : 'text-white/54 hover:bg-white/8')}>{copy.settings}</Link>
                        </nav>
                        <div className="min-w-0 space-y-3">
                        {preferenceSection === 'display' && (
                        <div className={cx('rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                          <div className={cx('mb-2 text-[11px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/42' : 'text-white/42')}>{copy.display}</div>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { id: 'sandbox', label: copy.sandbox },
                              { id: 'main', label: copy.mainWallet },
                            ] as const).map((mode) => {
                              const isActive = walletExecutionMode === mode.id;

                              return (
                                <button
                                  key={mode.id}
                                  type="button"
                                  onClick={() => selectWalletExecutionMode(mode.id)}
                                  className={cx(
                                    'rounded-lg border px-2 py-2 text-xs font-bold transition',
                                    isActive
                                      ? mode.id === 'sandbox'
                                        ? isLight
                                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                          : 'border-emerald-300/35 bg-emerald-300/12 text-emerald-200'
                                        : isLight
                                          ? 'border-violet-300 bg-violet-50 text-violet-700'
                                          : 'border-violet-300/35 bg-violet-300/12 text-violet-200'
                                      : isLight
                                        ? 'border-black/8 text-black/54 hover:bg-black/5'
                                        : 'border-white/8 text-white/54 hover:bg-white/8'
                                  )}
                                >
                                  {mode.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        )}

                        {preferenceSection === 'security' && (
                        <div className={cx('rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                          <div className={cx('mb-2 text-[11px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/42' : 'text-white/42')}>{copy.pinSecurity}</div>
                          <div className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm">
                            <span className="font-semibold">{copy.transactionPin}</span>
                            <span className={cx('text-xs font-bold', hasPin ? 'text-emerald-500' : isLight ? 'text-black/42' : 'text-white/42')}>
                              {hasPin ? copy.enabled : copy.notSet}
                            </span>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            {(['passkey', 'pin'] as const).map((method) => {
                              const disabled = method === 'pin' && !hasPin;
                              const isActive = defaultAuthMethod === method;

                              return (
                                <button
                                  key={method}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => setDefaultAuthMethod(method)}
                                  className={cx(
                                    'rounded-lg border px-2 py-2 text-xs font-bold capitalize transition disabled:cursor-not-allowed disabled:opacity-35',
                                    isActive
                                      ? isLight
                                        ? 'border-black bg-black text-white'
                                        : 'border-white bg-white text-black'
                                      : isLight
                                        ? 'border-black/8 text-black/54 hover:bg-black/5'
                                        : 'border-white/8 text-white/54 hover:bg-white/8'
                                  )}
                                >
                                  {method}
                                </button>
                              );
                            })}
                          </div>
                          <div className={cx('mt-3 px-2 text-xs font-semibold', isLight ? 'text-black/54' : 'text-white/54')}>{copy.pinFreeTransactions}</div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            {pinFreeWindows.map((minutes) => {
                              const isActive = autoLockMinutes === minutes;

                              return (
                                <button
                                  key={minutes}
                                  type="button"
                                  onClick={() => setAutoLockMinutes(minutes)}
                                  className={cx(
                                    'rounded-lg border px-2 py-1.5 text-[11px] font-bold transition',
                                    isActive
                                      ? isLight
                                        ? 'border-black bg-black text-white'
                                        : 'border-white bg-white text-black'
                                      : isLight
                                        ? 'border-black/8 text-black/54 hover:bg-black/5'
                                        : 'border-white/8 text-white/54 hover:bg-white/8'
                                )}
                              >
                                  {minutes === 0 ? copy.off : `${minutes}m`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        )}

                        {preferenceSection === 'wallet' && (
                        <div className={cx('rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-white/[0.04]')}>
                          <div className={cx('mb-2 text-[11px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/42' : 'text-white/42')}>{copy.walletActions}</div>
                          <button
                            type="button"
                            onClick={() => {
                              setPinAction(hasPin ? 'change' : 'setup');
                              setPinActionError('');
                              setExportedPrivateKey('');
                            }}
                            className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                          >
                            <span>{copy.managePin}</span>
                            <span className={cx('text-xs', isLight ? 'text-black/42' : 'text-white/42')}>{hasPin ? 'Change' : 'Set up'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={!isAuthenticated}
                            onClick={() => {
                              setPinAction('reset');
                              setPinActionError('');
                              setExportedPrivateKey('');
                            }}
                            className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                          >
                            <span>{copy.resetPin}</span>
                            <span className={cx('text-xs', isLight ? 'text-black/42' : 'text-white/42')}>Secure reset</span>
                          </button>
                          <button
                            type="button"
                            disabled={!isAuthenticated || walletActionPending}
                            onClick={() => void revealPrivateKeyForExport()}
                            className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                          >
                            <span>{copy.privateKeyExport}</span>
                            <span className={cx('text-xs', isLight ? 'text-black/42' : 'text-white/42')}>Passkey gated</span>
                          </button>

                          {pinAction && (
                            <div className={cx('mt-2 space-y-2 rounded-xl border p-3', isLight ? 'border-black/8 bg-white' : 'border-white/8 bg-black/18')}>
                              {pinAction === 'change' && (
                                <input
                                  type="password"
                                  inputMode="numeric"
                                  maxLength={6}
                                  value={pinValues.current}
                                  onChange={(event) => setPinValues((current) => ({ ...current, current: event.target.value.replace(/\D/g, '') }))}
                                  placeholder="Current 6-digit PIN"
                                  className={cx('h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none', isLight ? 'border-black/10' : 'border-white/10')}
                                />
                              )}
                              <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={pinValues.next}
                                onChange={(event) => setPinValues((current) => ({ ...current, next: event.target.value.replace(/\D/g, '') }))}
                                placeholder="New 6-digit PIN"
                                className={cx('h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none', isLight ? 'border-black/10' : 'border-white/10')}
                              />
                              <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={pinValues.confirm}
                                onChange={(event) => setPinValues((current) => ({ ...current, confirm: event.target.value.replace(/\D/g, '') }))}
                                placeholder="Confirm PIN"
                                className={cx('h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none', isLight ? 'border-black/10' : 'border-white/10')}
                              />
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setPinAction(null)} className={cx('h-9 rounded-full px-3 text-xs font-bold', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}>Cancel</button>
                                <button type="button" disabled={walletActionPending} onClick={() => void submitPinAction()} className={cx('h-9 rounded-full px-4 text-xs font-bold disabled:opacity-45', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Save PIN</button>
                              </div>
                            </div>
                          )}

                          {exportedPrivateKey && (
                            <div className={cx('mt-2 rounded-xl border p-3', isLight ? 'border-black/8 bg-white' : 'border-white/8 bg-black/18')}>
                              <div className="break-all font-mono text-xs leading-5">{exportedPrivateKey}</div>
                              <button type="button" onClick={() => void navigator.clipboard.writeText(exportedPrivateKey)} className={cx('mt-2 h-8 rounded-full px-3 text-xs font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>Copy private key</button>
                            </div>
                          )}

                          {pinActionError && (
                            <p className={cx('mt-2 px-2 text-xs leading-5', isLight ? 'text-amber-800' : 'text-amber-200')}>{pinActionError}</p>
                          )}
                          {isAuthenticated && (
                            <button
                              type="button"
                              onClick={lock}
                              className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold transition', isLight ? 'text-rose-700 hover:bg-rose-50' : 'text-rose-200 hover:bg-rose-300/10')}
                            >
                              <span>{copy.lockWallet}</span>
                              <span className={cx('text-xs', isLight ? 'text-rose-500/70' : 'text-rose-200/70')}>{copy.session}</span>
                            </button>
                          )}
                        </div>
                        )}

                        {preferenceSection === 'account' && (
                          <div className="min-w-0 px-1 py-1">
                            {accountActionState === 'deleted' ? (
                              <div className="py-7 text-center">
                                <div className={cx('mx-auto flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold', isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-300/12 text-emerald-200')}>✓</div>
                                <h3 className="inj-display-serif mt-4 text-2xl">{copy.accountDeleted}</h3>
                                <p className={cx('mx-auto mt-2 max-w-lg text-sm leading-6', isLight ? 'text-black/54' : 'text-white/54')}>{copy.accountDeletedBody}</p>
                                <p className={cx('mx-auto mt-2 max-w-lg text-xs leading-5', isLight ? 'text-black/42' : 'text-white/42')}>
                                  {passkeyRemovalSignaled ? copy.passkeyRemovalComplete : copy.passkeyRemovalNote}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => window.location.assign('/welcome')}
                                  className={cx('mt-5 h-10 rounded-full px-5 text-sm font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}
                                >
                                  {copy.returnToLogin}
                                </button>
                              </div>
                            ) : !isAuthenticated ? (
                              <p className={cx('py-10 text-center text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{copy.accountLogin}</p>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-4 border-b border-current/8 pb-4">
                                  <div>
                                    <h3 className="inj-display-serif text-2xl">{copy.deleteAccount}</h3>
                                    <p className={cx('mt-1 max-w-xl text-sm leading-6', isLight ? 'text-black/52' : 'text-white/52')}>{copy.deleteAccountBody}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void refreshAccountDeletionStatus()}
                                    disabled={accountStatusLoading || accountActionState !== 'idle'}
                                    className={cx('h-9 shrink-0 rounded-full px-3 text-xs font-bold transition disabled:opacity-40', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                                  >
                                    {copy.checkAssets}
                                  </button>
                                </div>

                                <div className="py-4">
                                  {accountStatusLoading && (
                                    <p className={cx('text-sm', isLight ? 'text-black/48' : 'text-white/48')}>{copy.checkingAssets}</p>
                                  )}
                                  {!accountStatusLoading && accountDeletionStatus?.canDelete && (
                                    <p className={cx('text-sm font-semibold', isLight ? 'text-emerald-700' : 'text-emerald-200')}>{copy.noAssetsRemain}</p>
                                  )}
                                  {!accountStatusLoading && accountDeletionStatus && !accountDeletionStatus.canDelete && (
                                    <div>
                                      <p className={cx('text-sm font-semibold', isLight ? 'text-rose-700' : 'text-rose-200')}>{copy.assetsMustBeCleared}</p>
                                      <div className={cx('mt-3 divide-y', isLight ? 'divide-black/8' : 'divide-white/8')}>
                                        {accountDeletionStatus.blockers.map((blocker, index) => (
                                          <div key={`${blocker.kind}-${blocker.label}-${index}`} className="flex items-center justify-between gap-4 py-2 text-sm">
                                            <span className="min-w-0 truncate font-semibold">{blocker.label}</span>
                                            <span className="flex shrink-0 items-center gap-2">
                                              <span className={cx('font-mono text-xs', isLight ? 'text-black/52' : 'text-white/52')}>{blocker.amount}</span>
                                              {!blocker.canAutoSweep && <span className={cx('text-[10px] font-bold uppercase', isLight ? 'text-amber-700' : 'text-amber-200')}>{copy.manualAssetAction}</span>}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {accountDeletionStatus && accountDeletionStatus.forfeitedLam > 0 && (
                                    <p className={cx('mt-3 text-xs leading-5', isLight ? 'text-amber-800' : 'text-amber-200')}>
                                      {formatAmount(accountDeletionStatus.forfeitedLam, 2)} LAM · {copy.lamWillBeRemoved}
                                    </p>
                                  )}
                                </div>

                                {accountDeletionStatus && !accountDeletionStatus.canDelete && (
                                  <div className={cx('border-t pt-4', isLight ? 'border-black/8' : 'border-white/8')}>
                                    <label className="block text-xs font-bold" htmlFor="account-sweep-target">{copy.sweepDestination}</label>
                                    <input
                                      id="account-sweep-target"
                                      value={accountSweepTarget}
                                      onChange={(event) => setAccountSweepTarget(event.target.value)}
                                      placeholder="0x..."
                                      spellCheck={false}
                                      className={cx('mt-2 h-11 w-full rounded-xl border bg-transparent px-3 font-mono text-sm outline-none transition focus:border-current', isLight ? 'border-black/10' : 'border-white/12')}
                                    />
                                    <p className={cx('mt-1.5 text-xs leading-5', isLight ? 'text-black/44' : 'text-white/44')}>{copy.sweepDestinationHint}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleSweepAccountAssets()}
                                      disabled={accountActionState !== 'idle' || !accountSweepTarget.trim() || !accountDeletionStatus.blockers.some((blocker) => blocker.canAutoSweep)}
                                      className={cx('mt-3 h-10 w-full rounded-xl text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-38', isLight ? 'bg-black text-white' : 'bg-white text-black')}
                                    >
                                      {accountActionState === 'sweeping' ? accountActionProgress || copy.checkingAssets : copy.sweepAssets}
                                    </button>
                                  </div>
                                )}

                                <div className={cx('mt-4 border-t pt-4', isLight ? 'border-black/8' : 'border-white/8')}>
                                  <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-bold">{copy.irreversible}</span>
                                    <span className={cx('text-xs', isLight ? 'text-black/42' : 'text-white/42')}>{copy.deleteRequiresPasskey}</span>
                                  </div>
                                  <input
                                    value={accountDeleteConfirmation}
                                    onChange={(event) => setAccountDeleteConfirmation(event.target.value)}
                                    placeholder={copy.deleteConfirmation}
                                    autoComplete="off"
                                    className={cx('mt-3 h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none transition focus:border-rose-500', isLight ? 'border-black/10' : 'border-white/12')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteAccount()}
                                    disabled={accountActionState !== 'idle' || !accountDeletionStatus?.canDelete || accountDeleteConfirmation !== 'DELETE'}
                                    className={cx('mt-2 h-10 w-full rounded-xl text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35', isLight ? 'bg-rose-700 text-white hover:bg-rose-800' : 'bg-rose-500 text-white hover:bg-rose-400')}
                                  >
                                    {accountActionState === 'deleting' ? accountActionProgress || copy.deleteRequiresPasskey : copy.deleteAccount}
                                  </button>
                                  <p className={cx('mt-2 text-xs leading-5', isLight ? 'text-black/42' : 'text-white/42')}>{copy.passkeyRemovalNote}</p>
                                </div>

                                {accountActionError && (
                                  <p className={cx('mt-3 text-sm leading-6', isLight ? 'text-rose-700' : 'text-rose-200')}>{accountActionError}</p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        </div>
                      </div>
                    )}

                    {isAuthenticated && (
                      <>
                        <div className={cx('my-2 h-px', isLight ? 'bg-black/8' : 'bg-white/8')} />
                        <button
                          type="button"
                          onClick={() => void logout()}
                          className={cx('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition', isLight ? 'text-rose-700 hover:bg-rose-50' : 'text-rose-200 hover:bg-rose-300/10')}
                        >
                          {copy.signOut}
                        </button>
                      </>
                    )}
                    </div>
                  </div>
                </OverlayPortal>
              )}

              <button
                type="button"
                onClick={() => setProfileOpen((current) => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                    setProfilePanel('menu');
                    return true;
                  }
                  const nextOpen = !current;
                  if (nextOpen) setProfilePanel('menu');
                  return nextOpen;
                })}
                className={cx('inj-glass-surface flex h-12 w-full items-center rounded-2xl border transition', sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3', isLight ? 'border-black/8 bg-white/80 hover:bg-[#f8f8f5]' : 'border-white/8 bg-white/[0.05] hover:bg-white/8')}
                title={sidebarCollapsed ? displayAddress : undefined}
              >
                <div className={cx('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold', isLight ? 'bg-black text-white' : 'bg-white text-black')}>
                  {isAuthenticated ? 'INJ' : 'G'}
                </div>
                {!sidebarCollapsed && <div className="min-w-0 text-left">
                  <div className="truncate text-sm font-semibold">{isCheckingSession ? copy.checkingSession : displayAddress}</div>
                  <div className={cx('text-xs', isLight ? 'text-black/46' : 'text-white/46')}>
                    {isAuthenticated ? copy.walletConnected : copy.lightAccess}
                  </div>
                </div>}
              </button>
            </div>}
          </div>
        </div>
        </MobileSidebarFrame>

        <section inert={mobileSidebarOpen ? true : undefined} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className={cx('pointer-events-none fixed inset-x-0 top-0 z-20 px-4 py-4 transition-[left] duration-300 sm:px-6', sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-[286px]')}>
            <div className="relative flex items-center justify-between">
              <div className="pointer-events-auto flex items-center gap-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label="Open navigation menu"
                  aria-controls="injpass-primary-sidebar"
                  aria-expanded={mobileSidebarOpen}
                  className={cx(
                    'flex h-11 w-11 items-center justify-center rounded-xl transition',
                    isLight ? 'text-black/72 hover:bg-black/5' : 'text-white/72 hover:bg-white/8',
                  )}
                >
                  <MenuIcon />
                </button>
                <div className="text-sm font-bold">INJ Pass</div>
              </div>
              {!activeWalletTab && activeChatSurface !== 'mini-app' && activeChatSurface !== 'skills' && activeChatSurface !== 'dapp-market' && <div className="pointer-events-auto absolute left-1/2 top-12 -translate-x-1/2 sm:top-0">
                  <ModeToggle
                    activeMode={activeMode}
                    setActiveMode={switchProductMode}
                    isLight={isLight}
                    labels={{ chat: copy.modeChat, creative: copy.modeCreate }}
                    statuses={{ chat: chatWorkStatus, creative: creativeWorkStatus }}
                  />
                </div>}
              <div className="pointer-events-auto relative ml-auto flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={cx('flex h-9 w-9 items-center justify-center rounded-full transition', isLight ? 'text-black/62 hover:bg-black/5 hover:text-black' : 'text-white/62 hover:bg-white/8 hover:text-white')}
                  aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
                  title={isLight ? copy.dark : copy.light}
                >
                  <ThemeIcon isLight={isLight} />
                </button>
                <button
                  ref={authMenuTriggerRef}
                  type="button"
                  onClick={handleLoginEntry}
                  disabled={authPendingAction !== null}
                  className={cx(
                    'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold outline-none transition disabled:opacity-55 motion-safe:animate-[injFadeDown_620ms_cubic-bezier(0.22,1,0.36,1)_both]',
                    isLight ? 'text-black hover:bg-black/5' : 'text-white hover:bg-white/8'
                  )}
                >
                  {authPendingAction === 'enter'
                    ? 'Passkey...'
                    : isAuthenticated
                      ? keystore?.walletName || displayAddress
                      : copy.logIn}
                </button>
                {authMenuOpen && (
                  <div
                    ref={authMenuPanelRef}
                    onPointerEnter={keepAuthMenuOpen}
                    onPointerMove={keepAuthMenuOpen}
                    onPointerLeave={scheduleAuthMenuClose}
                    onFocusCapture={(event) => {
                      const tagName = (event.target as HTMLElement).tagName;
                      if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                        pinAuthMenuOpen();
                      } else {
                        keepAuthMenuOpen();
                      }
                    }}
                    onKeyDownCapture={keepAuthMenuOpen}
                    className={cx(
                      'inj-glass-surface inj-liquid-menu absolute right-0 top-11 max-h-[min(680px,calc(100dvh-5rem))] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border p-2 shadow-2xl backdrop-blur-2xl motion-safe:animate-[injFadeDown_360ms_cubic-bezier(0.22,1,0.36,1)_both]',
                      isLight ? 'border-black/8 bg-white/92 text-black shadow-black/12' : 'border-white/10 bg-[#18181b]/92 text-white shadow-black/45'
                    )}
                  >
                    <div className={cx('mb-2 grid grid-cols-2 rounded-xl p-1', isLight ? 'bg-black/[0.045]' : 'bg-white/[0.06]')}>
                      {([
                        { id: 'mnemonic', label: 'Traditional wallet' },
                        { id: 'passkey', label: 'Passkey' },
                      ] as const).map((method) => (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => {
                            setAuthMethod(method.id);
                            setAuthError('');
                          }}
                          className={cx(
                            'h-8 rounded-lg text-xs font-bold transition',
                            authMethod === method.id
                              ? isLight ? 'bg-white text-black shadow-sm' : 'bg-white/12 text-white'
                              : isLight ? 'text-black/48' : 'text-white/48',
                          )}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                    {authMethod === 'mnemonic' ? (
                      <div className="px-1 pb-1">
                        <button
                          type="button"
                          onClick={() => openTraditionalWalletWizard('create')}
                          className={cx(
                            'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition duration-300',
                            isLight
                              ? 'border-white bg-black/[0.025] shadow-[0_0_0_1px_rgba(0,0,0,0.07)] hover:bg-black/5'
                              : 'border-white/35 bg-white/[0.035] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] hover:border-white/55 hover:bg-white/8',
                          )}
                        >
                          <span>
                            <span className="block text-sm font-bold">Create New Wallet</span>
                            <span className={cx('mt-0.5 block text-xs', isLight ? 'text-black/46' : 'text-white/46')}>24 words + encrypted local password</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold">Create</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openTraditionalWalletWizard('recover')}
                          className={cx('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                        >
                          <span>
                            <span className="block text-sm font-bold">Recover with 24 words</span>
                            <span className={cx('mt-0.5 block text-xs', isLight ? 'text-black/46' : 'text-white/46')}>Import an existing wallet on this device</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold">Recover</span>
                        </button>
                      </div>
                    ) : (
                      <PasskeyWalletActions
                        isLight={isLight}
                        pendingAction={authPendingAction}
                        onCreate={openPasskeyWalletWizard}
                        onEnterExisting={() => void handleEnterPasskey()}
                      />
                    )}
                    {localWallets.length > 0 && (
                      <div className={cx('my-1 border-y py-1', isLight ? 'border-black/7' : 'border-white/8')}>
                        {localWallets.map((wallet) => (
                          <button
                            key={wallet.address}
                            type="button"
                            onClick={() => void handleEnterLocalWallet(wallet)}
                            disabled={authPendingAction !== null}
                            className={cx('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-55', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold">{wallet.walletName || 'INJ Pass wallet'}</span>
                              <span className={cx('mt-0.5 block font-mono text-[10px]', isLight ? 'text-black/42' : 'text-white/42')}>{truncateAddress(wallet.address)}</span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold">Enter</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {isAuthenticated && (
                      <button
                        type="button"
                        onClick={() => {
                          authMenuPinnedRef.current = false;
                          setAuthMenuOpen(false);
                          void logout();
                        }}
                        className={cx(
                          'mt-1 flex w-full items-center justify-between rounded-xl border-t px-3 py-3 text-left text-sm font-bold transition',
                          isLight
                            ? 'border-black/8 text-rose-700 hover:bg-rose-50'
                            : 'border-white/8 text-rose-300 hover:bg-rose-300/10',
                        )}
                      >
                        <span>Disconnect</span>
                      </button>
                    )}
                    {authError && (
                      <p className={cx('mx-2 mt-2 px-1 pb-1 text-xs leading-5', isLight ? 'text-rose-700' : 'text-rose-200')}>
                        {authError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          <div
            ref={mainContentScrollRef}
            className={cx(
              'flex min-h-0 flex-1 flex-col px-4 pb-5 pt-32 sm:px-6 sm:pt-16',
              mainContentOverflowClass(activeChatSurface),
            )}
          >
            <div
              className={cx(
                'relative isolate mx-auto flex w-full flex-1 flex-col',
                activeChatSurface === 'mini-app' || activeChatSurface === 'dapp-market'
                  ? 'max-w-[1440px]'
                  : 'max-w-[1280px]',
                hasActiveSession
                  ? cx(
                    'min-h-0 justify-start pt-4 sm:pt-7',
                    isCreativeBuildSession
                      ? 'pb-40'
                      : 'pb-4'
                  )
                  : shouldCenterContent
                    ? 'justify-start pb-20 pt-[calc(22vh-18px)] sm:pt-[calc(30vh-18px)]'
                    : 'justify-start pb-12 pt-4 sm:pt-7'
              )}
            >
              {!hasActiveSession && (
                <div className="text-center">
                  <h1 className="inj-display-serif text-3xl tracking-normal sm:text-[44px]">{title}</h1>
                </div>
              )}

              {activeMode === 'chat' && (
                <>
                  {activeChatSurface === 'default' && (
                    <>
                      {activeWalletTab && (
                        activeWalletTab === 'tokens' && assetWalletView !== 'assets' ? (
                          <WalletTransferPanel
                            mode={assetWalletView}
                            address={address}
                            privateKey={privateKey}
                            onRequirePrivateKey={requireWalletPrivateKey}
                            isLight={isLight}
                            copy={copy}
                            onBack={() => setAssetWalletView('assets')}
                            onComplete={() => {
                              resetTxAuth();
                              setWalletPanelData({});
                            }}
                          />
                        ) : activeWalletTab === 'nfts' && assetWalletView === 'send' ? (
                          <NFTTransferPanel
                            nfts={walletPanelData.nfts || []}
                            address={address}
                            privateKey={privateKey}
                            onRequirePrivateKey={requireWalletPrivateKey}
                            isLight={isLight}
                            copy={copy}
                            onBack={() => setAssetWalletView('assets')}
                            onComplete={() => {
                              resetTxAuth();
                              setWalletPanelData((current) => ({ ...current, nfts: undefined }));
                            }}
                          />
                        ) : activeWalletTab === 'nfts' && assetWalletView === 'receive' ? (
                          <WalletTransferPanel
                            mode="receive"
                            assetLabel="NFTs"
                            address={address}
                            privateKey={privateKey}
                            onRequirePrivateKey={requireWalletPrivateKey}
                            isLight={isLight}
                            copy={copy}
                            onBack={() => setAssetWalletView('assets')}
                            onComplete={() => undefined}
                          />
                        ) : (
                          <WalletDataPanel
                            tab={activeWalletTab}
                            data={walletPanelData}
                            loading={walletPanelLoading}
                            error={walletPanelError}
                            isAuthenticated={isAuthenticated}
                            lamBalance={sidebarWalletSummary.lam}
                            onRefresh={() => void openWalletPanel(activeWalletTab, true)}
                            onSend={() => setAssetWalletView('send')}
                            onReceive={() => setAssetWalletView('receive')}
                            isLight={isLight}
                            languageCode={selectedLanguageCode}
                            copy={copy}
                          />
                        )
                      )}
                      {!activeWalletTab && messages.length > 0 && (
                        <div className="mx-auto w-full max-w-3xl space-y-6 py-5">
                          {messages.filter((message) => message.role !== 'tool').map((message) => (
                            <div
                              key={message.id}
                              className={cx(
                                'flex w-full gap-3 text-sm leading-7',
                                message.role === 'user' ? 'justify-end' : 'justify-start'
                              )}
                            >
                              <div
                                className={cx(
                                  'min-w-0 max-w-[88%]',
                                  message.role === 'user'
                                    ? isLight ? 'rounded-2xl bg-black/[0.06] px-4 py-2.5 text-black' : 'rounded-2xl bg-white/[0.09] px-4 py-2.5 text-white'
                                    : message.role === 'tool'
                                      ? isLight ? 'text-emerald-900' : 'text-emerald-100'
                                      : message.isError
                                        ? isLight ? 'text-black/62' : 'text-white/62'
                                        : isLight ? 'text-black' : 'text-white'
                                )}
                              >
                                {message.role === 'user' ? message.body : (
                                  <>
                                    <MarkdownMessage body={message.body} isLight={isLight} />
                                    {!isAuthenticated && (
                                      message.action === 'login'
                                      || responseRequiresWalletLogin(message.body)
                                    ) && (
                                      <button
                                        type="button"
                                        onClick={handleLoginEntry}
                                        className={cx(
                                          'mt-4 inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-bold transition hover:-translate-y-0.5',
                                          isLight
                                            ? 'border-black/12 bg-white text-black hover:border-black/22 hover:bg-black/[0.025]'
                                            : 'border-white/14 bg-white/[0.06] text-white hover:border-white/28 hover:bg-white/[0.1]',
                                        )}
                                      >
                                        {copy.logIn}
                                        <OpenAppIcon className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                          {isAgentRunning && (
                            <div className="w-full max-w-md py-1">
                              <ThinkingProgress
                                label={copy.agentThinking}
                                progress={thinkingProgress}
                                isLight={isLight}
                              />
                            </div>
                          )}
                          <div ref={conversationEndRef} />
                        </div>
                      )}
                      {!activeWalletTab && pendingConfirmation && (
                        <div
                          className={cx(
                            'mx-auto mb-5 w-full max-w-3xl rounded-2xl border px-4 py-3 text-left',
                            isLight ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-amber-200/20 bg-amber-300/10 text-amber-100'
                          )}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-bold">{copy.confirmAction}</div>
                              <div className="mt-1 text-xs opacity-70">
                                {pendingConfirmation.toolName} · {pendingConfirmation.executionMode || 'backend_sandbox'}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAgentConfirmation(false)}
                                disabled={isAgentRunning}
                                className={cx('h-9 rounded-full border px-4 text-xs font-bold transition disabled:opacity-45', isLight ? 'border-amber-900/12 bg-white/70 hover:bg-white' : 'border-amber-100/16 bg-white/6 hover:bg-white/10')}
                              >
                                {copy.reject}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleAgentConfirmation(true)}
                                disabled={isAgentRunning}
                                className={cx('h-9 rounded-full px-4 text-xs font-bold transition disabled:opacity-45', isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86')}
                              >
                                {copy.confirm}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {activeChatSurface === 'dapp-market' && (
                    <DAppMarketPanel
                      apps={marketDApps}
                      tabs={miniAppTabs}
                      activeTabId={activeMiniAppTabId}
                      onOpenApp={openDAppFromMarket}
                      onSelectTab={selectMiniAppTab}
                      onCloseTab={closeMiniAppTab}
                      onAddApp={openNewMiniAppTab}
                      onDragStart={handleDAppDragStart}
                      onPointerDown={handleDAppPointerDown}
                      onPointerUp={clearPointerDApp}
                      isLight={isLight}
                      copy={copy}
                    />
                  )}
                  {activeChatSurface === 'campaign' && (
                    <CampaignPanel isLight={isLight} copy={copy} />
                  )}
                  {activeChatSurface === 'skills' && (
                    <SkillsPanel isLight={isLight} copy={copy} skills={allSkills} canCreate={isAuthenticated} onCreate={addCustomSkill} onUse={useSkill} />
                  )}
                  {activeChatSurface === 'cloud-drive' && (
                    <CloudDrivePanel
                      isLight={isLight}
                      copy={copy}
                      isAuthenticated={isAuthenticated}
                      address={address}
                      onRequirePrivateKey={requireWalletPrivateKey}
                    />
                  )}
                  {activeChatSurface === 'mini-app' && activeMiniApp && activeMiniAppManifest && miniAppUrl && (
                    <MiniAppPanel
                      app={activeMiniApp}
                      tabs={miniAppTabs}
                      activeTabId={activeMiniAppTabId}
                      manifest={activeMiniAppManifest}
                      src={miniAppUrl}
                      iframeKey={getMiniAppFrameKey(activeMiniApp.id, miniAppFrameNonce)}
                      iframeRef={miniAppIframeRef}
                      navigation={miniAppNavigation}
                      isLoading={miniAppLoading}
                      address={miniAppSessionAddress}
                      walletName={keystore?.walletName}
                      isLight={isLight}
                      onSelectTab={selectMiniAppTab}
                      onCloseTab={closeMiniAppTab}
                      onAddApp={openNewMiniAppTab}
                      onNavigate={navigateMiniApp}
                      onOpenWallet={() => {
                        setAuthError('');
                        setOrphanWalletAddress(null);
                        setLocalWallets(loadWallets());
                        void detectPrfSupport().then(setPrfDetection).catch(() => undefined);
                        authMenuPinnedRef.current = true;
                        setAuthMenuOpen(true);
                      }}
                      onOpenExternal={() => {
                        const externalUrl = new URL(miniAppNavigation.path || '/', miniAppUrl);
                        externalUrl.searchParams.delete('injpass_miniapp');
                        externalUrl.searchParams.delete('injpass_host_origin');
                        window.open(externalUrl.toString(), '_blank', 'noopener,noreferrer');
                      }}
                      onFrameLoad={() => {
                        setMiniAppLoading(false);
                        if (miniAppLoadingTimerRef.current) {
                          window.clearTimeout(miniAppLoadingTimerRef.current);
                          miniAppLoadingTimerRef.current = null;
                        }
                      }}
                    />
                  )}
                </>
              )}

              {activeMode === 'creative' && creativePrompt && (
                <div className="mx-auto mt-4 w-full max-w-3xl">
                  <div className="flex justify-end">
                    <div className={cx('max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-7', isLight ? 'bg-black/[0.06] text-black' : 'bg-white/[0.09] text-white')}>
                      {creativePrompt}
                    </div>
                  </div>
                  {creativeFaucetState !== 'idle' && (
                    <div className="mt-3 flex flex-col items-end gap-2">
                      <div className={cx('text-right text-xs', creativeFaucetState === 'ready' ? 'text-emerald-600' : creativeFaucetState === 'error' ? 'text-amber-600' : isLight ? 'text-black/42' : 'text-white/42')}>
                        {creativeFaucetState === 'claiming' && 'Sending INJ testnet gas...'}
                        {creativeFaucetState === 'verification' && 'Verify once to receive INJ testnet gas'}
                        {creativeFaucetState === 'ready' && 'INJ testnet gas is ready'}
                        {creativeFaucetState === 'needs-wallet' && 'Log in to receive INJ testnet gas'}
                        {creativeFaucetState === 'error' && creativeFaucetError}
                      </div>
                      {creativeFaucetState === 'verification' && (
                        <div className={cx('overflow-hidden rounded-lg border p-1', isLight ? 'border-black/8 bg-white' : 'border-white/10 bg-[#18181a]')}>
                          <HCaptcha
                            sitekey={INJECTIVE_FAUCET_HCAPTCHA_SITE_KEY}
                            size="compact"
                            theme={isLight ? 'light' : 'dark'}
                            onVerify={(token) => void requestCreativeTestnetGas(token)}
                            onExpire={() => setCreativeFaucetState('verification')}
                            onError={() => {
                              setCreativeFaucetError('Verification could not load. Please try again.');
                              setCreativeFaucetState('error');
                            }}
                          />
                        </div>
                      )}
                      {creativeFaucetState === 'error' && (
                        <button
                          type="button"
                          onClick={() => void requestCreativeTestnetGas()}
                          className={cx('text-xs font-semibold underline decoration-transparent underline-offset-4 transition hover:decoration-current', isLight ? 'text-black/56' : 'text-white/56')}
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeMode === 'creative' && creativeStage === 'plan' && creativePlan && (
                <CreativeGraph
                  stage={creativeStage}
                  nodes={creativePlan.nodes}
                  edges={creativePlan.edges}
                  onAccept={() => void acceptCreativePlan()}
                  onRevise={reviseCreativePlan}
                  isLight={isLight}
                />
              )}

              {activeMode === 'creative' && creativePlan && (creativeStage === 'building' || creativeStage === 'published') && (
                <div className="mx-auto mt-6 grid w-full max-w-[1240px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
                  <CreativeProgressMenu
                    steps={creativePlan.nodes}
                    currentIndex={creativeBuildStep}
                    stage={creativeStage}
                    open={creativeProgressOpen}
                    error={creativeBuildError}
                    onToggle={() => setCreativeProgressOpen((current) => !current)}
                    isLight={isLight}
                  />
                  <CreativeCodeWorkspace
                    key={creativeStage}
                    stage={creativeStage}
                    build={creativeBuild}
                    error={creativeBuildError}
                    compileResult={creativeCompileResult}
                    compileStatus={creativeCompileStatus}
                    selectedFileIndex={selectedCreativeFileIndex}
                    onSelectFile={setSelectedCreativeFileIndex}
                    onRetry={() => void acceptCreativePlan()}
                    isLight={isLight}
                  />
                </div>
              )}

              {activeMode === 'creative' && isCreativePlanning && (
                <div className="mx-auto w-full max-w-3xl py-8">
                  <ThinkingProgress
                    label={copy.agentThinking}
                    progress={thinkingProgress}
                    isLight={isLight}
                  />
                </div>
              )}

              {activeMode === 'creative' && creativeError && !isCreativePlanning && (
                <div className="mx-auto flex w-full max-w-3xl items-start py-6 text-sm leading-7">
                  <div className={cx(isLight ? 'text-black/62' : 'text-white/62')}>
                    <MarkdownMessage body={creativeError} isLight={isLight} />
                  </div>
                </div>
              )}

              {activeMode === 'chat' && activeChatSurface === 'skills' && (
                <div className="sticky bottom-8 z-30 mx-auto mt-auto flex w-full max-w-3xl justify-center py-5">
                  <button
                    type="button"
                    onClick={startNewSkillBuild}
                    className={cx(
                      'text-sm font-semibold underline decoration-1 underline-offset-8 transition-[color,text-decoration-color] duration-200',
                      isLight
                        ? 'text-black/58 decoration-black/24 hover:text-black hover:decoration-black/70'
                        : 'text-white/58 decoration-white/24 hover:text-white hover:decoration-white/70',
                    )}
                  >
                    {createOwnSkillCtaByLanguage[selectedLanguageCode]}
                  </button>
                </div>
              )}

              {activeChatSurface !== 'cloud-drive' && activeChatSurface !== 'mini-app' && activeChatSurface !== 'skills' && activeChatSurface !== 'dapp-market' && <form
                onSubmit={handleSubmit}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleComposerDrop}
                onPointerUp={handleComposerPointerUp}
                style={composerTrigger && composerSuggestions.length > 0 ? { zIndex: 70 } : composerToolsOpen ? { zIndex: 70 } : undefined}
                className={cx(
                  'inj-composer-shell mx-auto flex max-w-3xl items-center gap-2 rounded-[1.65rem] border-2 px-3 py-2.5 transition-all duration-300',
                  activeMode === 'creative' ? 'inj-composer-testnet' : walletExecutionMode === 'main' ? 'inj-composer-main' : 'inj-composer-sandbox',
                  isCreativeBuildSession
                    ? cx('fixed bottom-10 left-1/2 z-40 w-[calc(100%-2rem)] -translate-x-1/2', sidebarCollapsed ? 'lg:left-[calc(50%+38px)]' : 'lg:left-[calc(50%+143px)]')
                    : hasActiveSession ? 'sticky bottom-8 z-30 mt-auto w-full' : 'relative mt-11 w-full',
                  composerTone
                )}
              >
                <div
                  className={cx(
                    'absolute left-5 top-px flex -translate-y-full items-end gap-1 text-[11px] font-bold',
                    isLight ? 'text-black' : 'text-white'
                  )}
                  aria-label={activeMode === 'creative' ? 'Build network' : 'Wallet execution mode'}
                >
                  {activeMode === 'creative' ? (
                    <span className={cx(
                      'flex h-7 items-center rounded-t-lg border border-b-0 px-3 text-amber-800',
                      isLight ? 'border-amber-500/90 bg-[#fbfbfa]' : 'border-amber-300/72 bg-[#0b0b0c] text-amber-200'
                    )}>
                      Testnet
                    </span>
                  ) : ([
                    { id: 'main', label: copy.mainWallet },
                    { id: 'sandbox', label: copy.sandbox },
                  ] as const).map((mode) => {
                    const isActive = walletExecutionMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => selectWalletExecutionMode(mode.id)}
                        className={cx(
                          'h-7 rounded-t-lg border border-b-0 px-3 transition-[background-color,border-color,color] duration-300',
                          isActive
                            ? mode.id === 'sandbox'
                              ? isLight ? 'border-emerald-600/90 bg-[#fbfbfa] text-emerald-800' : 'border-emerald-300/68 bg-[#0b0b0c] text-emerald-100'
                              : isLight ? 'border-violet-600/90 bg-[#fbfbfa] text-violet-800' : 'border-violet-300/70 bg-[#0b0b0c] text-violet-100'
                            : isLight
                              ? 'border-black/8 bg-[#f5f5f3] text-black/42 hover:text-black'
                              : 'border-white/8 bg-[#141416] text-white/42 hover:text-white'
                        )}
                        aria-pressed={isActive}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (activeMode === 'chat' && walletExecutionMode === 'sandbox') {
                      setComposerToolsOpen((current) => !current);
                      setSandboxToolMessage('');
                    }
                  }}
                  className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                  aria-label="Attach"
                  aria-expanded={activeMode === 'chat' && walletExecutionMode === 'sandbox' ? composerToolsOpen : undefined}
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
                {activeMode === 'chat' && walletExecutionMode === 'sandbox' && composerToolsOpen && (
                  <div
                    onPointerMove={keepComposerToolsOpen}
                    onFocusCapture={keepComposerToolsOpen}
                    onKeyDownCapture={keepComposerToolsOpen}
                    className={cx('inj-liquid-menu inj-glass-surface absolute bottom-[calc(100%+12px)] left-0 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border p-2 shadow-2xl', isLight ? 'border-black/8 bg-white/94 text-black shadow-black/12' : 'border-white/10 bg-[#19191c]/94 text-white shadow-black/45')}
                  >
                    <div className="flex items-center justify-between px-2 py-1">
                      <div>
                        <div className="text-sm font-bold">Sandbox wallet</div>
                        <div className={cx('text-xs', isLight ? 'text-black/44' : 'text-white/44')}>Isolated tools for this conversation</div>
                      </div>
                      <button type="button" onClick={() => setComposerToolsOpen(false)} className={cx('flex h-7 w-7 items-center justify-center rounded-full', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')} aria-label="Close Sandbox tools">
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className={cx('my-1 h-px', isLight ? 'bg-black/8' : 'bg-white/8')} />
                    <button
                      type="button"
                      onClick={() => void revealSandboxWallet()}
                      disabled={sandboxToolLoading}
                      className={cx('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-45', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                    >
                      {sandboxPrivateKey ? 'Refresh Sandbox credentials' : 'View Sandbox private key'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void sweepSandboxToMain()}
                      disabled={sandboxToolLoading}
                      className={cx('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-45', isLight ? 'hover:bg-black/5' : 'hover:bg-white/8')}
                    >
                      Sweep all assets to Main
                    </button>
                    {(sandboxAddress || sandboxPrivateKey) && (
                      <div className={cx('mt-1 rounded-xl border p-3', isLight ? 'border-black/8 bg-black/[0.025]' : 'border-white/8 bg-black/20')}>
                        {sandboxAddress && (
                          <button type="button" onClick={() => void navigator.clipboard.writeText(sandboxAddress)} className="block w-full text-left">
                            <span className={cx('block text-[10px] font-bold uppercase tracking-[0.12em]', isLight ? 'text-black/38' : 'text-white/38')}>Address · click to copy</span>
                            <span className="mt-1 block truncate font-mono text-xs">{sandboxAddress}</span>
                          </button>
                        )}
                        {sandboxPrivateKey && (
                          <button type="button" onClick={() => void navigator.clipboard.writeText(sandboxPrivateKey)} className="mt-3 block w-full text-left">
                            <span className={cx('block text-[10px] font-bold uppercase tracking-[0.12em]', isLight ? 'text-black/38' : 'text-white/38')}>Private key · click to copy</span>
                            <span className="mt-1 block break-all font-mono text-[10px] leading-4">{sandboxPrivateKey}</span>
                          </button>
                        )}
                      </div>
                    )}
                    {sandboxToolMessage && (
                      <div className={cx('px-3 py-2 text-xs leading-5', isLight ? 'text-black/58' : 'text-white/58')}>{sandboxToolMessage}</div>
                    )}
                  </div>
                )}
                {composerTrigger && composerSuggestions.length > 0 && (
                  <div
                    role="listbox"
                    aria-label={composerTrigger.symbol === '@' ? 'Application suggestions' : composerTrigger.symbol === '#' ? 'Skill suggestions' : 'Asset suggestions'}
                    className={cx(
                      'inj-liquid-menu absolute left-10 z-[80] max-h-[360px] w-[min(390px,calc(100vw-3rem))] overflow-y-auto rounded-2xl border p-1.5 shadow-2xl',
                      isCreativeBuildSession || hasActiveSession
                        ? 'bottom-[calc(100%+12px)]'
                        : 'top-[calc(100%+12px)]',
                      isLight ? 'border-black/10 bg-white text-black shadow-black/16' : 'border-white/12 bg-[#19191c] text-white shadow-black/55'
                    )}
                  >
                    <div className={cx('px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/38' : 'text-white/38')}>
                      {composerTrigger.symbol === '@' ? copy.dappMarket : composerTrigger.symbol === '#' ? copy.skills : copy.assets}
                    </div>
                    {composerSuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.id}
                        ref={(node) => { composerSuggestionRefs.current[index] = node; }}
                        type="button"
                        role="option"
                        aria-selected={index === composerSuggestionIndex}
                        onPointerDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setComposerSuggestionIndex(index)}
                        onClick={() => selectComposerSuggestion(suggestion)}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                          index === composerSuggestionIndex
                            ? isLight ? 'bg-black/[0.065]' : 'bg-white/[0.1]'
                            : isLight ? 'hover:bg-black/[0.04]' : 'hover:bg-white/[0.065]'
                        )}
                      >
                        <span className={cx('relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold', isLight ? 'bg-black/[0.055]' : 'bg-white/[0.08]')}>
                          {suggestion.app ? <DAppLogo app={suggestion.app} /> : suggestion.symbol}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{suggestion.symbol}{suggestion.label}</span>
                          <span className={cx('mt-0.5 block truncate text-xs', isLight ? 'text-black/44' : 'text-white/44')}>{suggestion.caption}</span>
                        </span>
                        {composerTrigger.symbol === '@' && suggestion.app?.aiDriven && (
                          <span className={cx(
                            'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold',
                            isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-300/12 text-violet-200'
                          )}>
                            AgentOS
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative flex min-w-0 flex-1 items-center gap-2">
                  {composerTokens.length > 0 && (
                    <div className="flex max-w-[58%] shrink-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {composerTokens.map((token) => (
                        <span
                          key={token.id}
                          className={cx(
                            'inline-flex h-7 max-w-40 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-bold',
                            token.symbol === '@'
                              ? isLight ? 'border-violet-200/70 bg-violet-100/70 text-violet-800' : 'border-violet-300/18 bg-violet-300/14 text-violet-100'
                              : token.symbol === '#'
                                ? isLight ? 'border-amber-200/80 bg-amber-100/75 text-amber-800' : 'border-amber-300/18 bg-amber-300/12 text-amber-100'
                                : isLight ? 'border-emerald-200/80 bg-emerald-100/75 text-emerald-800' : 'border-emerald-300/18 bg-emerald-300/12 text-emerald-100',
                          )}
                        >
                          <span className="truncate">{token.symbol}{token.label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              removeComposerToken(token.id);
                              window.requestAnimationFrame(() => composerInputRef.current?.focus());
                            }}
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 transition hover:opacity-100"
                            aria-label={`${copy.remove} ${token.symbol}${token.label}`}
                          >
                            <CloseIcon className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {droppedContext && (
                    <span className={cx(
                      'inline-flex h-7 max-w-[34%] shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-bold',
                      isLight ? 'border-black/8 bg-black/[0.045] text-black/62' : 'border-white/9 bg-white/[0.07] text-white/62',
                    )}>
                      <span className="truncate">Attachment</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDroppedContext('');
                          window.requestAnimationFrame(() => composerInputRef.current?.focus());
                        }}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 transition hover:opacity-100"
                        aria-label={copy.remove}
                      >
                        <CloseIcon className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  <div className="relative min-w-0 flex-1">
                  {composerDemoActive && (
                    <div
                      aria-hidden="true"
                      className={cx(
                        'pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap text-sm',
                        isLight ? 'text-black/48' : 'text-white/48'
                      )}
                    >
                      <span key={composerDemoStep} className="inj-liquid-item block truncate">
                        {composerDemoSegments.map((segment, index) => segment.kind === 'text' ? (
                          <span key={`${segment.kind}-${index}`}>{segment.text}</span>
                        ) : (
                          <span
                            key={`${segment.kind}-${index}`}
                            className={cx(
                              'rounded-md px-1.5 py-0.5 font-semibold',
                              segment.kind === 'app'
                                ? isLight ? 'bg-violet-100/55 text-violet-700/85' : 'bg-violet-300/[0.08] text-violet-200/85'
                                : segment.kind === 'skill'
                                  ? isLight ? 'bg-amber-100/55 text-amber-700/85' : 'bg-amber-300/[0.08] text-amber-200/85'
                                  : isLight ? 'bg-emerald-100/55 text-emerald-700/85' : 'bg-emerald-300/[0.08] text-emerald-200/85'
                            )}
                          >
                            {segment.text}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  <input
                    ref={composerInputRef}
                    value={draft}
                    onFocus={pauseComposerDemo}
                    onBlur={(event) => scheduleComposerDemoResume(event.currentTarget.value)}
                    onChange={(event) => {
                      pauseComposerDemo();
                      setDraft(event.target.value);
                      setComposerSuggestionIndex(0);
                    }}
                    onKeyDown={handleComposerInputKeyDown}
                    placeholder={composerDemoActive ? '' : promptPlaceholder}
                    className={cx(
                      'h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-current placeholder:opacity-46',
                      isLight ? 'text-black' : 'text-white'
                    )}
                  />
                  </div>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setModelMenuOpen((current) => !current)}
                    className={cx(
                      'flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition',
                      isLight ? 'text-black/62 hover:bg-black/5 hover:text-black' : 'text-white/62 hover:bg-white/8 hover:text-white'
                    )}
                    aria-expanded={modelMenuOpen}
                    aria-label="Select model"
                  >
                    <span>{selectedReasoningLevel}</span>
                    <ChevronDownIcon />
                  </button>
                  {modelMenuOpen && (
                    <div
                      onPointerMove={keepModelMenuOpen}
                      onFocusCapture={keepModelMenuOpen}
                      onKeyDownCapture={keepModelMenuOpen}
                      className={cx(
                        'inj-liquid-menu inj-glass-surface absolute bottom-11 right-0 z-30 w-52 rounded-2xl border p-2 text-sm shadow-2xl',
                        isLight ? 'border-black/8 bg-white text-black shadow-black/12' : 'border-white/10 bg-[#19191c] text-white shadow-black/40'
                      )}
                    >
                      <div className={cx('px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/38' : 'text-white/38')}>
                        {copy.reasoning}
                      </div>
                      {reasoningOptions.map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => {
                            setSelectedReasoningLevel(level);
                            setModelMenuOpen(false);
                          }}
                          className={cx(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-semibold transition',
                            selectedReasoningLevel === level
                              ? isLight
                                ? 'bg-black text-white'
                                : 'bg-white text-black'
                              : isLight
                                ? 'hover:bg-black/5'
                                : 'hover:bg-white/8'
                          )}
                        >
                          <span>{level}</span>
                          {selectedReasoningLevel === level && <span className="text-xs opacity-70">{copy.active}</span>}
                        </button>
                      ))}
                      <div className={cx('my-2 h-px', isLight ? 'bg-black/8' : 'bg-white/10')} />
                      <div className={cx('px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]', isLight ? 'text-black/38' : 'text-white/38')}>
                        {copy.model}
                      </div>
                      {agentModelOptions.map((model) => (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            setSelectedAgentModel(model);
                            setModelMenuOpen(false);
                          }}
                          className={cx(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-semibold transition',
                            selectedAgentModel === model
                              ? isLight
                                ? 'bg-black text-white'
                                : 'bg-white text-black'
                              : isLight
                                ? 'hover:bg-black/5'
                                : 'hover:bg-white/8'
                          )}
                        >
                          <span>{model}</span>
                          {selectedAgentModel === model && <span className="text-xs opacity-70">{copy.active}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type={activeAiRunning ? 'button' : 'submit'}
                  onClick={activeAiRunning ? stopActiveAiTask : undefined}
                  disabled={!activeAiRunning && !draft.trim() && composerTokens.length === 0 && !droppedContext}
                  className={cx(
                    'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-35',
                    activeAiRunning && 'before:absolute before:inset-[-3px] before:rounded-full before:border before:border-current before:border-t-transparent before:opacity-45 before:motion-safe:animate-spin',
                    isLight ? 'bg-black text-white hover:bg-black/82' : 'bg-white text-black hover:bg-white/86'
                  )}
                  aria-label={activeAiRunning ? 'Stop generating' : 'Send'}
                  title={activeAiRunning ? 'Stop generating' : 'Send'}
                >
                  {activeAiRunning ? <StopIcon className="h-3.5 w-3.5" /> : <ArrowUpIcon />}
                </button>
              </form>}
              {activeMode === 'creative' && creativeStage === 'guide' && !isCreativePlanning && !creativePrompt && (
                <div className="mx-auto mt-4 w-full max-w-3xl">
                  <p className={cx('mx-auto max-w-2xl text-center text-sm leading-6 motion-safe:animate-[injFadeUp_680ms_cubic-bezier(0.22,1,0.36,1)_both]', isLight ? 'text-black/58' : 'text-white/58')}>
                    {localizedBuildGuide.intro}
                  </p>
                  <ChatGuide isLight={isLight} cards={localizedBuildGuide.cards} />
                </div>
              )}
              {activeMode === 'chat' && activeChatSurface === 'default' && !activeWalletTab && messages.length === 0 && (
                <div className="mx-auto mt-4 w-full max-w-3xl">
                  <ChatGuide isLight={isLight} cards={localizedChatGuideCards} />
                </div>
              )}
              {!hasActiveSession && (activeMode === 'creative' || activeChatSurface === 'default') && (
                <div className="mx-auto mt-4 grid w-full max-w-3xl grid-cols-5 gap-2">
                  {(activeMode === 'chat' ? visibleChatShortcuts : creativeShortcutsByLanguage[selectedLanguageCode]).map((shortcut) => (
                    <button
                      key={shortcut}
                      type="button"
                      title={shortcut}
                      onClick={() => {
                        if (activeMode === 'creative') {
                          startCreativeFromShortcut(shortcut);
                        } else if (shortcut === newUserGuideLabelByLanguage[selectedLanguageCode]) {
                          setComposerIntroPage(0);
                          setComposerIntroOpen(true);
                          setComposerDemoDismissed(true);
                        } else {
                          setDraft(shortcut);
                        }
                      }}
                      className={cx(
                        'inline-flex min-h-9 items-center rounded-full border text-xs font-semibold transition',
                        'min-w-0 justify-center overflow-hidden px-2',
                        activeMode === 'chat' && shortcut === newUserGuideLabelByLanguage[selectedLanguageCode]
                          ? isLight
                            ? 'border-violet-300 bg-violet-50 text-violet-700 hover:border-violet-400'
                            : 'border-violet-300/30 bg-violet-300/[0.08] text-violet-200 hover:border-violet-300/50'
                          : isLight
                            ? 'border-black/10 bg-white text-black/62 hover:text-black'
                            : 'border-white/10 bg-white/[0.04] text-white/62 hover:text-white'
                      )}
                    >
                      <span className="min-w-0 truncate">{shortcut}</span>
                    </button>
                  ))}
                </div>
              )}

              {activeChatSurface !== 'mini-app' && <div className={cx(
                'pointer-events-none mx-auto mt-8 flex w-full max-w-3xl items-center justify-center gap-1.5 pb-16 text-[11px] transition-[left] duration-300 sm:fixed sm:bottom-1 sm:left-1/2 sm:z-20 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:py-1 sm:pb-0',
                sidebarCollapsed ? 'lg:left-[calc(50%+38px)]' : 'lg:left-[calc(50%+143px)]',
                isLight ? 'text-black/38' : 'text-white/38'
              )}>
                <span>{copy.poweredBy}</span>
                <Image
                  src={isLight ? '/injective-wordmark-color.png' : '/injective-wordmark-white.png'}
                  alt="Injective"
                  width={481}
                  height={96}
                  className="h-[14px] w-auto object-contain"
                />
              </div>}

            </div>
          </div>
        </section>
      </div>
      {miniAppAgentRun && (
        <iframe
          key={miniAppAgentRun.id}
          ref={miniAppAgentIframeRef}
          src={miniAppAgentRun.src}
          title={`${miniAppAgentRun.manifest.name} AgentOS command runner`}
          allow="clipboard-read; clipboard-write; publickey-credentials-get; publickey-credentials-create"
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none fixed -left-[10000px] top-0 h-px w-px border-0 opacity-0"
        />
      )}
      <WalletSetupWizard
        open={traditionalWalletWizardOpen}
        method={walletSetupMethod}
        mode={traditionalWalletWizardMode}
        step={traditionalWalletWizardStep}
        walletName={newWalletName}
        password={newWalletPassword}
        passwordConfirm={newWalletPasswordConfirm}
        recoveryMnemonic={recoveryMnemonic}
        preparedWalletAddress={preparedMnemonicWallet?.address || null}
        inviteCode={walletInviteCode}
        inviteValidation={walletInviteValidation}
        inviteValidationMessage={walletInviteValidationMessage}
        busy={authPendingAction === 'create'}
        error={authError}
        prfDetection={prfDetection}
        isLight={isLight}
        onStep={setTraditionalWalletWizardStep}
        onWalletName={setNewWalletName}
        onPassword={setNewWalletPassword}
        onPasswordConfirm={setNewWalletPasswordConfirm}
        onRecoveryMnemonic={setRecoveryMnemonic}
        onInviteCode={updateWalletInviteCode}
        onValidateInvite={() => void handleValidateWalletInvite()}
        onClearError={() => setAuthError('')}
        onClose={closeTraditionalWalletWizard}
        onSubmit={() => void (
          walletSetupMethod === 'passkey'
            ? handleCreatePasskeyWallet()
            : handleCreateTraditionalWallet()
        )}
      />
      <MnemonicBackupModal
        open={mnemonicBackupOpen}
        words={mnemonicWords}
        step={mnemonicStep}
        checks={mnemonicChecks}
        answers={mnemonicAnswers}
        loading={mnemonicBackupLoading}
        error={mnemonicBackupError}
        isLight={isLight}
        onClose={closeMnemonicBackup}
        onRecorded={startMnemonicVerification}
        onReview={() => {
          setMnemonicStep('words');
          setMnemonicBackupError('');
        }}
        onAnswer={(index, value) => setMnemonicAnswers((current) => ({ ...current, [index]: value }))}
        onVerify={confirmMnemonicVerification}
      />
      <LocalWalletUnlockModal
        wallet={localUnlockWallet}
        password={localUnlockPassword}
        error={localUnlockError}
        busy={localUnlockBusy}
        orphaned={Boolean(orphanWalletAddress)}
        isLight={isLight}
        onPasswordChange={setLocalUnlockPassword}
        onSubmit={() => void submitLocalWalletUnlock()}
        onClose={() => closeLocalWalletUnlock()}
        onRecoverOrphan={() => {
          const walletToRecover = localUnlockWallet;
          if (!walletToRecover) return;
          localUnlockResolverRef.current?.reject(new Error(''));
          localUnlockResolverRef.current = null;
          setLocalUnlockWallet(null);
          setLocalUnlockPassword('');
          setLocalUnlockError('');
          setLocalUnlockBusy(false);
          openTraditionalWalletWizard('recover');
          setNewWalletName(walletToRecover.walletName || 'My INJ Pass');
        }}
        onRemoveOrphan={() => {
          if (!orphanWalletAddress) return;
          deleteWalletByAddress(orphanWalletAddress);
          if (keystore?.address.toLowerCase() === orphanWalletAddress.toLowerCase()) lock();
          setLocalWallets(loadWallets());
          closeLocalWalletUnlock('The incomplete local wallet record was removed.');
        }}
      />
    </main>
  );
}
