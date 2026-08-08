export type MiniAppCommandAppId = 'bankrupt-elon-musk';

export type MiniAppCommandAction =
  | 'open'
  | 'balance'
  | 'portfolio'
  | 'buy'
  | 'sell'
  | 'rank';

export interface MiniAppAgentCommand {
  appId: MiniAppCommandAppId;
  action: MiniAppCommandAction;
  rawText: string;
  language: string;
  params: {
    product?: string;
    quantity?: number;
  };
}

export interface MiniAppAgentCommandResult {
  ok: boolean;
  key: string;
  data?: Record<string, unknown>;
  message?: string;
}

const ELON_PATTERN = /(?:@\s*)?(?:bankrupt[\s_-]*elon(?:[\s_-]*musk)?|elon[\s_-]*musk|musk|马斯克|馬斯克)/i;

const GAME_RANK_PATTERN = /\b(?:rank|ranking|leaderboard|place)\b|rang|classement|platz|rangliste|순위|ランキング|順位|排名|排行榜/i;
const GAME_PORTFOLIO_PATTERN = /\b(?:portfolio|positions?|holdings?|inventory)\b|portfolio|positionen|portefeuille|positions|포트폴리오|보유|ポートフォリオ|保有|持仓|持倉|仓位|倉位/i;
const GAME_BALANCE_PATTERN = /\b(?:balance|cash|net worth|account value)\b|guthaben|kontostand|solde|valeur nette|잔액|자산|残高|資産|余额|餘額|净值|淨值/i;
const GAME_BUY_PATTERN = /\b(?:buy|purchase|long)\b|kaufen|achat|acheter|매수|구매|買う|購入|买入|買入|购买|購買/i;
const GAME_SELL_PATTERN = /\b(?:sell|close position|liquidate position)\b|verkaufen|vente|vendre|매도|판매|売る|売却|卖出|賣出|出售/i;

function extractQuantity(text: string): number | undefined {
  const candidates = [...text.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|股|份|枚|个|個|$)/g)];
  const value = Number(candidates[0]?.[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractProduct(text: string): string | undefined {
  const ticker = text.match(/\b[A-Z]{2,8}(?:[.-][A-Z0-9]+)?\b/)?.[0];
  if (ticker && !['INJ', 'PASS', 'APP', 'DM'].includes(ticker)) return ticker;
  const cleaned = text
    .replace(ELON_PATTERN, ' ')
    .replace(GAME_BUY_PATTERN, ' ')
    .replace(GAME_SELL_PATTERN, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/[,@#$，。！？:：;；]/g, ' ')
    .replace(/\b(?:please|for me|shares?|units?|stock|asset)\b/gi, ' ')
    .replace(/(?:帮我|幫我|一下|股票|资产|資產|股|份|枚)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

export function parseMiniAppAgentCommand(text: string, language: string): MiniAppAgentCommand | null {
  if (ELON_PATTERN.test(text)) {
    const action: MiniAppCommandAction = GAME_RANK_PATTERN.test(text)
      ? 'rank'
      : GAME_PORTFOLIO_PATTERN.test(text)
        ? 'portfolio'
        : GAME_BALANCE_PATTERN.test(text)
          ? 'balance'
          : GAME_BUY_PATTERN.test(text)
            ? 'buy'
            : GAME_SELL_PATTERN.test(text)
              ? 'sell'
              : 'open';
    return {
      appId: 'bankrupt-elon-musk',
      action,
      rawText: text,
      language,
      params: {
        product: action === 'buy' || action === 'sell' ? extractProduct(text) : undefined,
        quantity: action === 'buy' || action === 'sell' ? extractQuantity(text) : undefined,
      },
    };
  }

  return null;
}

type SupportedLanguage = 'en' | 'de' | 'fr' | 'ko' | 'ja' | 'zh-Hans' | 'zh-Hant';

function languageOf(value: string): SupportedLanguage {
  if (value === 'de' || value === 'fr' || value === 'ko' || value === 'ja' || value === 'zh-Hans' || value === 'zh-Hant') {
    return value;
  }
  return 'en';
}

function numberValue(value: unknown, maximumFractionDigits = 2): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits })
    : '0';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function listValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

export function formatMiniAppAgentResult(
  result: MiniAppAgentCommandResult,
  language: string,
): string {
  const lang = languageOf(language);
  const data = result.data || {};
  if (result.message) return result.message;

  const genericFailure: Record<SupportedLanguage, string> = {
    en: 'The app could not complete that request.',
    de: 'Die App konnte diese Anfrage nicht abschließen.',
    fr: "L’application n’a pas pu terminer cette demande.",
    ko: '앱에서 요청을 완료하지 못했습니다.',
    ja: 'アプリでリクエストを完了できませんでした。',
    'zh-Hans': '应用暂时无法完成这个请求。',
    'zh-Hant': '應用暫時無法完成這個請求。',
  };

  if (result.key === 'login_required') {
    return {
      en: 'Log in and unlock a wallet before using this app.',
      de: 'Melde dich an und entsperre eine Wallet, bevor du diese App nutzt.',
      fr: 'Connectez-vous et déverrouillez un portefeuille avant d’utiliser cette application.',
      ko: '이 앱을 사용하려면 로그인하고 지갑을 잠금 해제하세요.',
      ja: 'このアプリを使う前にログインしてウォレットを解除してください。',
      'zh-Hans': '请先登录并解锁钱包，再使用这个应用。',
      'zh-Hant': '請先登入並解鎖錢包，再使用這個應用。',
    }[lang];
  }

  if (result.key === 'game_balance') {
    const cash = numberValue(data.cash);
    const netWorth = numberValue(data.netWorth);
    const holdings = numberValue(data.holdingsValue);
    const debt = numberValue(data.debt);
    return {
      en: `Bankrupt Elon Musk account: **$${cash}** cash, **$${netWorth}** net worth, **$${holdings}** holdings, and **$${debt}** debt.`,
      de: `Bankrupt-Elon-Musk-Konto: **$${cash}** Bargeld, **$${netWorth}** Nettovermögen, **$${holdings}** Positionen und **$${debt}** Schulden.`,
      fr: `Compte Bankrupt Elon Musk : **$${cash}** de liquidités, **$${netWorth}** de valeur nette, **$${holdings}** de positions et **$${debt}** de dette.`,
      ko: `Bankrupt Elon Musk 계정: 현금 **$${cash}**, 순자산 **$${netWorth}**, 보유 자산 **$${holdings}**, 부채 **$${debt}**.`,
      ja: `Bankrupt Elon Musk アカウント: 現金 **$${cash}**、純資産 **$${netWorth}**、保有額 **$${holdings}**、負債 **$${debt}**。`,
      'zh-Hans': `马斯克活动账户：现金 **$${cash}**，净值 **$${netWorth}**，持仓 **$${holdings}**，负债 **$${debt}**。`,
      'zh-Hant': `馬斯克活動帳戶：現金 **$${cash}**，淨值 **$${netWorth}**，持倉 **$${holdings}**，負債 **$${debt}**。`,
    }[lang];
  }

  if (result.key === 'game_portfolio') {
    const positions = listValue(data.positions);
    const heading = {
      en: `Current portfolio (${positions.length} positions):`,
      de: `Aktuelles Portfolio (${positions.length} Positionen):`,
      fr: `Portefeuille actuel (${positions.length} positions) :`,
      ko: `현재 포트폴리오 (${positions.length}개 포지션):`,
      ja: `現在のポートフォリオ (${positions.length} ポジション):`,
      'zh-Hans': `当前持仓（${positions.length} 项）：`,
      'zh-Hant': `目前持倉（${positions.length} 項）：`,
    }[lang];
    if (positions.length === 0) return `${heading}\n\n—`;
    return `${heading}\n\n${positions.slice(0, 12).map((item) => `- **${stringValue(item.symbol) || stringValue(item.name)}** · ${numberValue(item.quantity, 6)} · $${numberValue(item.value)}`).join('\n')}`;
  }

  if (result.key === 'game_trade') {
    const side = stringValue(data.side);
    const product = stringValue(data.product);
    const quantity = numberValue(data.quantity, 6);
    const verb = side === 'sell'
      ? { en: 'Sold', de: 'Verkauft', fr: 'Vendu', ko: '매도', ja: '売却', 'zh-Hans': '已卖出', 'zh-Hant': '已賣出' }[lang]
      : { en: 'Bought', de: 'Gekauft', fr: 'Acheté', ko: '매수', ja: '購入', 'zh-Hans': '已买入', 'zh-Hant': '已買入' }[lang];
    return `${verb} **${quantity} ${product}**. ${formatMiniAppAgentResult({ ok: true, key: 'game_balance', data }, lang)}`;
  }

  if (result.key === 'game_rank') {
    const rank = numberValue(data.rank, 0);
    const total = numberValue(data.total, 0);
    const pnl = numberValue(data.pnl);
    return {
      en: `Your current loss ranking is **${rank}/${total}**, with P&L of **$${pnl}**.`,
      de: `Dein aktueller Verlust-Rang ist **${rank}/${total}**, mit **$${pnl}** Gewinn/Verlust.`,
      fr: `Votre classement actuel des pertes est **${rank}/${total}**, avec un P&L de **$${pnl}**.`,
      ko: `현재 손실 순위는 **${rank}/${total}**, 손익은 **$${pnl}**입니다.`,
      ja: `現在の損失ランキングは **${rank}/${total}**、損益は **$${pnl}** です。`,
      'zh-Hans': `你当前的亏损排名是 **${rank}/${total}**，盈亏为 **$${pnl}**。`,
      'zh-Hant': `你目前的虧損排名是 **${rank}/${total}**，盈虧為 **$${pnl}**。`,
    }[lang];
  }

  if (result.key === 'product_not_found') {
    return {
      en: 'I could not match that asset. Try a ticker such as TSLA, NVDA, BTC, or INJ.',
      de: 'Ich konnte diesen Vermögenswert nicht zuordnen. Versuche z. B. TSLA, NVDA, BTC oder INJ.',
      fr: 'Actif introuvable. Essayez un symbole comme TSLA, NVDA, BTC ou INJ.',
      ko: '해당 자산을 찾지 못했습니다. TSLA, NVDA, BTC, INJ 같은 티커를 사용해 보세요.',
      ja: 'その資産を特定できませんでした。TSLA、NVDA、BTC、INJ などのティッカーを指定してください。',
      'zh-Hans': '没有匹配到这项资产，请尝试输入 TSLA、NVDA、BTC 或 INJ 等代码。',
      'zh-Hant': '沒有配對到這項資產，請嘗試輸入 TSLA、NVDA、BTC 或 INJ 等代碼。',
    }[lang];
  }

  if (result.key === 'insufficient_cash' || result.key === 'insufficient_position' || result.key === 'market_locked') {
    const messages: Record<string, Record<SupportedLanguage, string>> = {
      insufficient_cash: {
        en: 'The simulated account does not have enough available cash for that purchase.', de: 'Das simulierte Konto hat nicht genug verfügbares Bargeld für diesen Kauf.', fr: 'Le compte simulé ne dispose pas de suffisamment de liquidités pour cet achat.', ko: '시뮬레이션 계정의 사용 가능한 현금이 부족합니다.', ja: 'シミュレーション口座の利用可能な現金が不足しています。', 'zh-Hans': '模拟账户的可用现金不足，无法完成这笔买入。', 'zh-Hant': '模擬帳戶的可用現金不足，無法完成這筆買入。',
      },
      insufficient_position: {
        en: 'The simulated account does not hold enough of that asset to sell.', de: 'Das simulierte Konto hält nicht genug von diesem Vermögenswert.', fr: 'Le compte simulé ne détient pas assez de cet actif.', ko: '시뮬레이션 계정의 해당 자산 보유량이 부족합니다.', ja: 'シミュレーション口座の保有数量が不足しています。', 'zh-Hans': '模拟账户持仓不足，无法完成这笔卖出。', 'zh-Hant': '模擬帳戶持倉不足，無法完成這筆賣出。',
      },
      market_locked: {
        en: 'Trading is paused during the daily settlement window.', de: 'Während des täglichen Abrechnungsfensters ist der Handel pausiert.', fr: 'Le trading est suspendu pendant la fenêtre de règlement quotidienne.', ko: '일일 정산 시간에는 거래가 일시 중지됩니다.', ja: '日次精算時間中は取引が停止されています。', 'zh-Hans': '当前处于每日结算窗口，交易暂时停止。', 'zh-Hant': '目前處於每日結算視窗，交易暫時停止。',
      },
    };
    return messages[result.key][lang];
  }

  if (result.key === 'app_ready') {
    return {
      en: 'The app is ready. Open it to continue with the full interface.',
      de: 'Die App ist bereit. Öffne sie für die vollständige Oberfläche.',
      fr: 'L’application est prête. Ouvrez-la pour continuer.',
      ko: '앱이 준비되었습니다. 전체 화면을 열어 계속하세요.',
      ja: 'アプリの準備ができました。完全な画面を開いて続行してください。',
      'zh-Hans': '应用已经就绪，打开后可以使用完整界面。',
      'zh-Hant': '應用已經就緒，開啟後可以使用完整介面。',
    }[lang];
  }

  return genericFailure[lang];
}
