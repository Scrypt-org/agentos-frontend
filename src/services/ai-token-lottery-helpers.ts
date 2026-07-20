export type LotteryLanguage =
  | 'en'
  | 'de'
  | 'fr'
  | 'ko'
  | 'ja'
  | 'zh-Hans'
  | 'zh-Hant';

export type LotteryState =
  | 'eligible'
  | 'claimed'
  | 'expired'
  | 'eligibility_expired'
  | 'wallet_unavailable'
  | 'campaign_disabled';

export function normalizeLotteryLanguage(value?: string | null): LotteryLanguage {
  const language = String(value ?? '').toLowerCase();
  if (language === 'zh-hant' || language.startsWith('zh-tw') || language.startsWith('zh-hk')) return 'zh-Hant';
  if (language === 'zh-hans' || language.startsWith('zh')) return 'zh-Hans';
  if (language.startsWith('de')) return 'de';
  if (language.startsWith('fr')) return 'fr';
  if (language.startsWith('ko')) return 'ko';
  if (language.startsWith('ja')) return 'ja';
  return 'en';
}

export function lotteryStateCanDraw(state: LotteryState): boolean {
  return state === 'eligible';
}
