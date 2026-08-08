import type { LotteryLanguage, LotteryState } from '@/services/ai-token-lottery';

export interface LotteryCopy {
  live: string;
  title: string;
  subtitle: string;
  pull: string;
  pulling: string;
  release: string;
  reward: string;
  remaining: string;
  expires: string;
  eligibility: string;
  interactions: string;
  lamEquivalent: string;
  countdownUnits: { day: string; hour: string; minute: string };
  retry: string;
  chat: string;
  states: Record<LotteryState, string>;
  tiers: Record<string, string>;
}

const en: LotteryCopy = {
  live: 'LIVE DROP',
  title: 'Claim your AI Token allocation.',
  subtitle: 'New AgentOS wallets get one guaranteed reward.',
  pull: 'PULL TO CLAIM',
  pulling: 'Keep pulling',
  release: 'Release to reveal',
  reward: 'Your reward',
  remaining: 'Remaining reward',
  expires: 'Expires in',
  eligibility: 'Claim window',
  interactions: 'Estimated 1–5 AI interactions. Actual usage varies by model and message length.',
  lamEquivalent: 'LAM equivalent',
  countdownUnits: { day: 'd', hour: 'h', minute: 'm' },
  retry: 'Retry',
  chat: 'Start AI Chat',
  states: {
    eligible: 'Your wallet is eligible. Pull once to reveal your reward.',
    claimed: 'Your reward is active and ready to use in AI Chat.',
    expired: 'This promotional reward has expired.',
    eligibility_expired: 'The 7-day claim window for this wallet has ended.',
    wallet_unavailable: 'Sign in with an AgentOS wallet to check eligibility.',
    campaign_disabled: 'This campaign is currently unavailable.',
  },
  tiers: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' },
};

export const LOTTERY_COPY: Record<LotteryLanguage, LotteryCopy> = {
  en,
  de: {
    ...en, live: 'LIVE-AKTION', title: 'Sichere dir deine AI-Token-Zuteilung.',
    subtitle: 'Neue AgentOS-Wallets erhalten eine garantierte Belohnung.',
    pull: 'ZIEHEN ZUM EINLÖSEN', pulling: 'Weiterziehen', release: 'Loslassen zum Aufdecken',
    reward: 'Deine Belohnung', remaining: 'Verbleibende Belohnung', expires: 'Läuft ab in',
    eligibility: 'Einlösezeitraum', retry: 'Erneut versuchen', chat: 'AI Chat starten',
    interactions: 'Geschätzt 1–5 AI-Interaktionen. Die tatsächliche Nutzung hängt von Modell und Nachrichtenlänge ab.',
    lamEquivalent: 'LAM-Gegenwert',
    countdownUnits: { day: 'T', hour: 'Std', minute: 'Min' },
    states: {
      eligible: 'Deine Wallet ist berechtigt. Einmal ziehen, um die Belohnung aufzudecken.',
      claimed: 'Deine Belohnung ist aktiv und kann im AI Chat genutzt werden.',
      expired: 'Diese Aktionsbelohnung ist abgelaufen.',
      eligibility_expired: 'Der 7-tägige Einlösezeitraum ist beendet.',
      wallet_unavailable: 'Melde dich mit einer AgentOS-Wallet an.',
      campaign_disabled: 'Diese Aktion ist derzeit nicht verfügbar.',
    },
    tiers: { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär', mythic: 'Mythisch' },
  },
  fr: {
    ...en, live: 'DISTRIBUTION EN DIRECT', title: 'Récupérez votre allocation AI Token.',
    subtitle: 'Chaque nouveau portefeuille AgentOS reçoit une récompense garantie.',
    pull: 'TIRER POUR RÉCUPÉRER', pulling: 'Continuez à tirer', release: 'Relâchez pour révéler',
    reward: 'Votre récompense', remaining: 'Récompense restante', expires: 'Expire dans',
    eligibility: 'Période de retrait', retry: 'Réessayer', chat: 'Ouvrir AI Chat',
    interactions: 'Environ 1 à 5 interactions IA. L’usage réel dépend du modèle et de la longueur des messages.',
    lamEquivalent: 'Équivalent LAM',
    countdownUnits: { day: 'j', hour: 'h', minute: 'min' },
    states: {
      eligible: 'Votre portefeuille est éligible. Tirez une fois pour révéler votre récompense.',
      claimed: 'Votre récompense est active dans AI Chat.',
      expired: 'Cette récompense promotionnelle a expiré.',
      eligibility_expired: 'La période de retrait de 7 jours est terminée.',
      wallet_unavailable: 'Connectez-vous avec un portefeuille AgentOS.',
      campaign_disabled: 'Cette campagne est indisponible.',
    },
    tiers: { common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique' },
  },
  ko: {
    ...en, live: '실시간 지급', title: 'AI Token 할당량을 받으세요.',
    subtitle: '새 AgentOS 지갑은 보상을 한 번 확정 지급받습니다.',
    pull: '당겨서 받기', pulling: '계속 당기기', release: '놓아서 확인',
    reward: '내 보상', remaining: '남은 보상', expires: '만료까지', eligibility: '수령 기간',
    retry: '다시 시도', chat: 'AI Chat 시작', lamEquivalent: 'LAM 환산',
    countdownUnits: { day: '일', hour: '시간', minute: '분' },
    interactions: '예상 AI 상호작용 1–5회. 실제 사용량은 모델과 메시지 길이에 따라 달라집니다.',
    states: {
      eligible: '이 지갑은 대상입니다. 한 번 당겨 보상을 확인하세요.',
      claimed: '보상이 활성화되어 AI Chat에서 사용할 수 있습니다.',
      expired: '프로모션 보상이 만료되었습니다.',
      eligibility_expired: '7일 수령 기간이 종료되었습니다.',
      wallet_unavailable: 'AgentOS 지갑으로 로그인하세요.',
      campaign_disabled: '현재 캠페인을 이용할 수 없습니다.',
    },
    tiers: { common: '일반', rare: '희귀', epic: '에픽', legendary: '전설', mythic: '신화' },
  },
  ja: {
    ...en, live: 'ライブ配布', title: 'AI Token の割り当てを受け取る。',
    subtitle: '新しい AgentOS ウォレットには報酬が1回必ず当たります。',
    pull: '引いて受け取る', pulling: 'そのまま引く', release: '離して表示',
    reward: '報酬', remaining: '残り報酬', expires: '有効期限まで', eligibility: '受取期間',
    retry: '再試行', chat: 'AI Chat を開始', lamEquivalent: 'LAM 換算',
    countdownUnits: { day: '日', hour: '時間', minute: '分' },
    interactions: 'AI 対話の目安は1〜5回です。実際の使用量はモデルとメッセージ長で変わります。',
    states: {
      eligible: 'このウォレットは対象です。1回引いて報酬を確認してください。',
      claimed: '報酬は有効で、AI Chat で利用できます。',
      expired: 'プロモーション報酬は期限切れです。',
      eligibility_expired: '7日間の受取期間は終了しました。',
      wallet_unavailable: 'AgentOS ウォレットでログインしてください。',
      campaign_disabled: 'このキャンペーンは現在利用できません。',
    },
    tiers: { common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー', mythic: 'ミシック' },
  },
  'zh-Hans': {
    ...en, live: '实时发放', title: '领取你的 AI Token 配额。',
    subtitle: '每个新注册的 AgentOS 钱包必得一次奖励。',
    pull: '下拉领取', pulling: '继续下拉', release: '松手揭晓',
    reward: '你的奖励', remaining: '剩余奖励', expires: '距离过期', eligibility: '领取期限',
    retry: '重试', chat: '开始 AI Chat', lamEquivalent: 'LAM 等值',
    countdownUnits: { day: '天', hour: '小时', minute: '分钟' },
    interactions: '预计可进行 1–5 次 AI 交互，实际次数取决于模型和消息长度。',
    states: {
      eligible: '该钱包符合资格，下拉一次即可揭晓奖励。',
      claimed: '奖励已生效，可在 AI Chat 中优先使用。',
      expired: '该活动奖励已经过期。',
      eligibility_expired: '该钱包的 7 天领取期限已经结束。',
      wallet_unavailable: '请先登录 AgentOS 钱包。',
      campaign_disabled: '活动暂未开放。',
    },
    tiers: { common: '普通', rare: '稀有', epic: '史诗', legendary: '传奇', mythic: '神话' },
  },
  'zh-Hant': {
    ...en, live: '即時發放', title: '領取你的 AI Token 配額。',
    subtitle: '每個新註冊的 AgentOS 錢包必得一次獎勵。',
    pull: '下拉領取', pulling: '繼續下拉', release: '鬆手揭曉',
    reward: '你的獎勵', remaining: '剩餘獎勵', expires: '距離過期', eligibility: '領取期限',
    retry: '重試', chat: '開始 AI Chat', lamEquivalent: 'LAM 等值',
    countdownUnits: { day: '天', hour: '小時', minute: '分鐘' },
    interactions: '預計可進行 1–5 次 AI 互動，實際次數取決於模型和訊息長度。',
    states: {
      eligible: '此錢包符合資格，下拉一次即可揭曉獎勵。',
      claimed: '獎勵已生效，可在 AI Chat 中優先使用。',
      expired: '此活動獎勵已經過期。',
      eligibility_expired: '此錢包的 7 天領取期限已經結束。',
      wallet_unavailable: '請先登入 AgentOS 錢包。',
      campaign_disabled: '活動暫未開放。',
    },
    tiers: { common: '普通', rare: '稀有', epic: '史詩', legendary: '傳奇', mythic: '神話' },
  },
};
