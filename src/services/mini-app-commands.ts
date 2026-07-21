import { formatEther } from 'viem';

import { isInjGiftMessage, parseInjGiftCommand } from '@/services/inj-gift';

/** Format a raw wei string as a human-readable INJ amount ('' when absent/invalid). */
function formatWeiToInj(raw: string): string {
  if (!raw) return '';
  try {
    return formatEther(BigInt(raw));
  } catch {
    return raw;
  }
}

export type MiniAppCommandAppId = 'bankrupt-elon-musk' | 'omisper' | 'inj-gift';

export type MiniAppCommandAction =
  | 'open'
  | 'balance'
  | 'portfolio'
  | 'buy'
  | 'sell'
  | 'rank'
  | 'inbox'
  | 'send'
  | 'broadcast'
  | 'group'
  | 'history'
  | 'create'
  | 'claim'
  | 'query';

export interface MiniAppAgentCommand {
  appId: MiniAppCommandAppId;
  action: MiniAppCommandAction;
  rawText: string;
  language: string;
  params: {
    addresses?: string[];
    message?: string;
    product?: string;
    quantity?: number;
    amount?: string;
    count?: number;
    password?: string;
    durationSec?: number;
    mode?: 'random' | 'equal';
    packetReference?: string;
  };
}

export interface MiniAppAgentCommandResult {
  ok: boolean;
  key: string;
  data?: Record<string, unknown>;
  message?: string;
}

const ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/g;
const OMISPER_PATTERN = /(?:@\s*)?(?:omisper|omnisper|omispher|欧米斯珀|歐米斯珀|欧米思珀|歐米思珀|奥米斯珀|奧米斯珀|오미스퍼|옴니스퍼|オミスパー|オムニスパー)/i;
const ELON_PATTERN = /(?:@\s*)?(?:bankrupt[\s_-]*elon(?:[\s_-]*musk)?|elon[\s_-]*musk|musk|马斯克|馬斯克)/i;

const OMISPER_HISTORY_PATTERN = /\b(?:conversation|chat|message|thread|dm)\s+(?:history|log)\b|\b(?:past|previous|recent|older)\s+messages?\s+(?:with|from|to)\b|\bmessages?\s+with\b|\b(?:show|read|view|check)\s+messages?\s+(?:from|to)\b|\bwhat\s+did\s+<address>\s+(?:say|send)\b|chatverlauf|nachrichtenverlauf|unterhaltung\s+mit|nachrichten\s+von\s+<address>|(?:letzte|frühere|bisherige)\s+nachrichten\s+mit|historique(?:\s+(?:de|des|du))?\s*(?:conversation|messages?)?|conversation\s+avec|messages?\s+de\s+<address>|(?:anciens|précédents|derniers)\s+messages\s+avec|대화\s*(?:기록|내역)|메시지\s*(?:기록|내역)|채팅\s*(?:기록|내역)|(?:지난|이전)\s*(?:대화|메시지)|<address>\s*(?:에게서|한테서)\s*온\s*메시지|会話履歴|メッセージ履歴|チャット履歴|過去のメッセージ|との(?:会話|やり取り)|<address>\s*からのメッセージ|(?:聊天|会话|會話|对话|對話|消息|訊息|往来|往來)(?:历史|歷史)?(?:记录|紀錄|記錄)|聊过什么|聊過什麼|说过什么|說過什麼|<address>\s*(?:发来|發來|传来|傳來)的?(?:消息|訊息)/i;
const OMISPER_INBOX_PATTERN = /\b(?:inbox|unread(?:\s+messages?)?|new messages?|latest messages?|check (?:my )?(?:inbox|messages?)|show (?:my )?(?:inbox|messages?)|read (?:my )?messages?|view (?:my )?(?:inbox|messages?)|sync (?:my )?(?:inbox|messages?)|refresh (?:my )?(?:inbox|messages?)|messages? (?:received|for me)|do i have (?:any )?messages?|did i (?:get|receive) (?:any )?messages?)\b|posteingang|ungelesene\s+nachrichten|neue\s+nachrichten|nachrichten\s*(?:abrufen|anzeigen|prüfen|lesen|synchronisieren|aktualisieren)|habe\s+ich\s+(?:neue\s+|ungelesene\s+)?nachrichten|bo[iî]te\s+de\s+r[eé]ception|messages?\s+non\s+lus|nouveaux\s+messages|(?:consulter|afficher|lire|vérifier|actualiser|synchroniser)\s+(?:mes\s+)?messages|ai-je\s+(?:reçu|des)\s+(?:de\s+)?(?:nouveaux\s+)?messages|받은\s*편지함|안\s*읽은\s*메시지|읽지\s*않은\s*메시지|(?:새|신규|받은)\s*메시지|메시지\s*(?:확인|조회|읽기|새로\s*고침|동기화)|메시지\s*(?:왔|온)\s*(?:어|나요)|受信(?:箱|トレイ)|未読(?:メッセージ)?|新着(?:メッセージ)?|新しいメッセージ|メッセージ(?:を)?(?:確認|一覧|読む|表示|更新|同期)|届いたメッセージ|收件(?:箱|匣)|未读(?:消息|信息)|未讀(?:訊息|消息)|新消息|新訊息|最新消息|最新訊息|收到的(?:消息|訊息)|有没有(?:新)?(?:消息|信息)|有沒有(?:新)?訊息|(?:查看|看看|检查|檢查|读取|讀取|接收|收取|刷新|同步|看)(?:一下|下)?(?:我的)?(?:新|未读|未讀|最新)?(?:消息|訊息|信息|收件箱|收件匣)/i;
const OMISPER_GROUP_PATTERN = /\b(?:(?:create|start|open|make|set up) (?:a )?(?:new )?(?:group|group chat|group conversation)|group (?:chat|conversation) with|add .+ to (?:a )?group)\b|gruppenchat|gruppe\s*(?:erstellen|starten|anlegen|öffnen)|(?:erstelle|starte|öffne)\s+(?:eine[n]?\s+)?gruppe|grupp(?:en)?unterhaltung|(?:cr[eé](?:er|e[rz]?)|d[eé]marr(?:er|e[rz]?)|ouvrir|ouvre[rz]?)\s+(?:un\s+)?groupe|discussion\s+de\s+groupe|conversation\s+de\s+groupe|그룹\s*(?:채팅|대화|만들기|생성|시작)|단체\s*(?:채팅|대화)방?|グループ(?:チャット|会話)(?:を)?(?:作る|作成|開始)?|グループ(?:を)?(?:作る|作成)|群聊|群組聊天|群组聊天|建群|拉群|组群|組群|创建群|創建群|建立群|建立群組|創建群組/i;
const OMISPER_BROADCAST_PATTERN = /\b(?:broadcast|mass message|bulk message|group message|send to (?:all|everyone|everybody|all recipients|both)|message (?:everyone|everybody|all recipients))\b|rundnachricht|sammelnachricht|massennachricht|an\s+alle\s+senden|sende\s+an\s+alle|envoi\s+group[eé]|message\s+collectif|diffusion|envoy(?:er|e[rz]?)\s+[àa]\s+tous|단체\s*메시지|일괄\s*전송|모두에게\s*보내|一斉送信|全員に送|まとめて送|群发|群發|广播消息|廣播訊息|批量发送|批量發送|同时发送|同時傳送|发给(?:所有人|大家|这些地址|這些地址)|發給(?:所有人|大家|這些地址)/i;
const OMISPER_SEND_PATTERN = /\b(?:send|message|dm|direct message|text|notify|tell|say|write(?:\s+to)?|contact|drop (?:a )?note|leave (?:a )?message|reply to)\b|send(?:e|en)|schick(?:e|en)?|schreib(?:e|en)?|sag(?:e|en)?|benachrichtig(?:e|en)?|mitteil(?:e|en)?|kontaktier(?:e|en)?|nachricht\s+senden|envoyer|envoie[rz]?|[eé]cri(?:s|re|vez)|pr[eé]venir|pr[eé]viens|notifier|notifie[rz]?|dis(?:-lui)?|contacter|contacte[rz]?|메시지\s*보내|보내|전송|전해|알려|말해|연락|쪽지|디엠|送信|送って|送る|伝えて|知らせて|言って|連絡して|書いて|ダイレクトメッセージ|(?:发|發|发送|發送|传送|傳送)(?:一个|一個|一条|一條|一封|个|個|条|條|封)?(?:消息|訊息|信息|私信)|(?:发|發|发送|發送|传送|傳送)(?:给|給|到|至)|私信|通知|告诉|告訴|留(?:个|個|句|一条|一條)?(?:言|话|話|消息|訊息)|捎话|捎話|传话|傳話|联系|聯絡|回复|回覆|回信|(?:告诉|告訴|跟|对|對).{0,24}(?:说|說)/i;

const GAME_RANK_PATTERN = /\b(?:rank|ranking|leaderboard|place)\b|rang|classement|platz|rangliste|순위|ランキング|順位|排名|排行榜/i;
const GAME_PORTFOLIO_PATTERN = /\b(?:portfolio|positions?|holdings?|inventory)\b|portfolio|positionen|portefeuille|positions|포트폴리오|보유|ポートフォリオ|保有|持仓|持倉|仓位|倉位/i;
const GAME_BALANCE_PATTERN = /\b(?:balance|cash|net worth|account value)\b|guthaben|kontostand|solde|valeur nette|잔액|자산|残高|資産|余额|餘額|净值|淨值/i;
const GAME_BUY_PATTERN = /\b(?:buy|purchase|long)\b|kaufen|achat|acheter|매수|구매|買う|購入|买入|買入|购买|購買/i;
const GAME_SELL_PATTERN = /\b(?:sell|close position|liquidate position)\b|verkaufen|vente|vendre|매도|판매|売る|売却|卖出|賣出|出售/i;

function extractQuotedText(text: string): string | undefined {
  const match = text.match(/["“「『](.+?)["”」』]/);
  return match?.[1]?.trim() || undefined;
}

function extractMessageBeforeAddress(text: string, address: string): string | undefined {
  const addressIndex = text.indexOf(address);
  if (addressIndex < 0) return undefined;
  const head = text.slice(0, addressIndex)
    .replace(OMISPER_PATTERN, ' ')
    .replace(/^[\s,，:：;；-]+|[\s,，:：;；-]+$/g, '')
    .trim();
  const patterns = [
    /^(?:please\s+)?(?:send|message|dm|text|write)\s+(?:a\s+)?(?:message\s+)?(.+?)\s+(?:to|for)$/i,
    /^(?:sende|schicke|schreib(?:e)?)\s+(?:die\s+|eine\s+)?(?:nachricht\s+)?(.+?)\s+an$/i,
    /^(?:envoie|envoyer|[eé]cris)\s+(?:le\s+|un\s+)?(?:message\s+)?(.+?)\s+[àa]$/i,
    /^(?:把|將|将)\s*(.+?)\s*(?:发|發|发送|發送|传送|傳送|私信)(?:给|給|到|至)$/i,
  ];
  for (const pattern of patterns) {
    const match = head.match(pattern);
    const message = match?.[1]?.trim();
    if (message) return message;
  }
  return undefined;
}

function extractTrailingMessage(text: string, addresses: string[]): string | undefined {
  const quoted = extractQuotedText(text);
  if (quoted) return quoted;
  if (addresses.length === 0) return undefined;
  const leadingMessage = extractMessageBeforeAddress(text, addresses[0]);
  const lastAddress = addresses[addresses.length - 1];
  const tail = text.slice(text.lastIndexOf(lastAddress) + lastAddress.length)
    .replace(/^[\s,，:：;；-]+/, '')
    .replace(/^(?:(?:please\s+)?(?:send|write|leave|drop)(?:\s+(?:a|the))?\s*(?:message|dm|note)?|(?:a|the)\s+(?:message|dm|note)|(?:message|dm|tell|notify)(?:\s+(?:them|him|her|the recipient))?)(?:\s+(?:saying|that|to say|with|which says))?\s*[:：-]?\s*/i, '')
    .replace(/^(?:saying|that|to say|which says|dass|说|說)\s*[:：-]?\s*/i, '')
    .replace(/^(?:que|pour\s+dire)\s*[:：-]?\s*/i, '')
    .replace(/^(?:에게|한테|께|으로|로|に|へ|宛てに)\s*/i, '')
    .replace(/^(?:拉群|建群|组群|組群|创建群聊|創建群聊|建立群聊|建立群組|創建群組|群聊)\s*[,，:：-]?\s*/i, '')
    .replace(/^(?:(?:给|給|向)\s*(?:他|她|他们|他們|她们|她們|对方|對方)?\s*)?(?:发|發|发送|發送|传送|傳送|送|私信|通知|留言|捎话|捎話|传话|傳話)(?:一个|一個|一条|一條|一封|个|個|条|條|封|则|則)?\s*(?:消息|訊息|信息|私信)?\s*(?:说|說|称|稱|内容(?:是|为)|內容(?:是|為))?\s*[:：-]?\s*/i, '')
    .replace(/^(?:跟|对|對|告诉|告訴)\s*(?:他|她|他们|他們|她们|她們|对方|對方)?\s*(?:说|說)?\s*[:：-]?\s*/i, '')
    .replace(/^(?:消息|訊息|信息|内容|內容)\s*(?:是|为|為)?\s*[:：-]?\s*/i, '')
    .replace(/^(?:bitte\s+)?(?:(?:eine|die)\s+)?nachricht(?:\s+(?:mit\s+dem\s+inhalt|mit|lautet|dass))?\s*[:：-]?\s*/i, '')
    .replace(/^(?:(?:un|le)\s+)?message(?:\s+(?:disant|suivant|qui\s+dit|avec\s+le\s+texte))?\s*[:：-]?\s*/i, '')
    .replace(/^(?:메시지(?:를)?|내용(?:은|는)?)\s*(?:보내|전송|전해)?\s*[:：-]?\s*/i, '')
    .replace(/^(?:メッセージ|内容)(?:を)?(?:送信|送って|伝えて)?\s*[:：-]?\s*/i, '')
    .replace(/\s*(?:라고|이라고|고)?\s*(?:메시지(?:를)?\s*)?(?:보내줘|보내|전송해줘|전송해|전해줘|전해|알려줘|알려|말해줘|말해)\s*[.!。！]?$/i, '')
    .replace(/\s*(?:と|って)?\s*(?:送信して|送って|送信|伝えて|知らせて|言って|連絡して)\s*[.!。！]?$/i, '')
    .trim();
  return tail || leadingMessage || undefined;
}

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
  if (isInjGiftMessage(text)) {
    const gift = parseInjGiftCommand(text);
    if (gift.kind === 'help') return null;
    if (gift.kind === 'create') {
      return {
        appId: 'inj-gift',
        action: 'create',
        rawText: text,
        language,
        params: {
          amount: gift.amount,
          count: gift.count,
          password: gift.password,
          durationSec: gift.durationSec,
          mode: gift.mode,
        },
      };
    }
    return {
      appId: 'inj-gift',
      action: gift.kind,
      rawText: text,
      language,
      params: {
        packetReference: gift.packetReference,
        password: gift.kind === 'claim' ? gift.password : undefined,
      },
    };
  }

  if (OMISPER_PATTERN.test(text)) {
    const addresses = text.match(ADDRESS_PATTERN) || [];
    const intentText = text.replace(ADDRESS_PATTERN, '<address>');
    const trailingMessage = extractTrailingMessage(text, addresses);
    const hasSendIntent = OMISPER_SEND_PATTERN.test(intentText) || Boolean(extractQuotedText(text) && addresses.length > 0);
    const action: MiniAppCommandAction = OMISPER_HISTORY_PATTERN.test(intentText)
      ? 'history'
      : OMISPER_INBOX_PATTERN.test(intentText)
        ? 'inbox'
        : OMISPER_GROUP_PATTERN.test(intentText)
          ? 'group'
          : OMISPER_BROADCAST_PATTERN.test(intentText) || (hasSendIntent && addresses.length > 1)
            ? 'broadcast'
            : hasSendIntent
              ? 'send'
              : 'open';
    return {
      appId: 'omisper',
      action,
      rawText: text,
      language,
      params: {
        addresses,
        message: action === 'send' || action === 'broadcast' || action === 'group'
          ? trailingMessage
          : undefined,
      },
    };
  }

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

function stringListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
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

  if (result.key === 'inj_gift_created') {
    const packetId = stringValue(data.packetId);
    const hash = stringValue(data.transactionHash);
    const password = stringValue(data.password);
    const amount = stringValue(data.amount);
    const count = Number(data.count || 1);
    const shareUrl = stringValue(data.shareUrl);
    return lang === 'zh-Hans' || lang === 'zh-Hant'
      ? `INJ Gift 红包已创建：${amount} INJ，共 ${count} 份。\n\n- 分享链接：${shareUrl || '生成失败，请使用红包 ID'}\n- 领取口令：\`${password}\`\n- 红包 ID：\`${packetId}\`\n- 交易：\`${hash}\``
      : `INJ Gift created a ${amount} INJ packet with ${count} gifts.\n\n- Share link: ${shareUrl || 'Unavailable; use the packet ID'}\n- Claim passcode: \`${password}\`\n- Packet ID: \`${packetId}\`\n- Transaction: \`${hash}\``;
  }

  if (result.key === 'inj_gift_claimed') {
    const hash = stringValue(data.transactionHash);
    const claimed = stringValue(data.claimedAmount);
    const claimedInj = formatWeiToInj(claimed);
    return lang === 'zh-Hans' || lang === 'zh-Hant'
      ? `INJ Gift 红包领取成功${claimedInj ? `，收到 ${claimedInj} INJ` : ''}。\n\n交易：\`${hash}\``
      : `INJ Gift claim succeeded${claimedInj ? ` for ${claimedInj} INJ` : ''}.\n\nTransaction: \`${hash}\``;
  }

  if (result.key === 'inj_gift_packet') {
    const packet = data.packet && typeof data.packet === 'object' ? data.packet as Record<string, unknown> : {};
    const total = stringValue(packet.totalAmount);
    const claimed = stringValue(packet.claimedAmount);
    const count = Number(packet.totalCount || 0);
    const claimedCount = Number(packet.claimedCount || 0);
    return lang === 'zh-Hans' || lang === 'zh-Hant'
      ? `INJ Gift 红包状态：${packet.isActive ? '可领取' : '已结束'}，已领取 ${claimedCount}/${count}，总额 ${total} wei，已领取 ${claimed} wei。`
      : `INJ Gift packet status: ${packet.isActive ? 'claimable' : 'closed'}, ${claimedCount}/${count} claimed, ${total} wei total and ${claimed} wei claimed.`;
  }

  if (result.key === 'user_rejected') {
    return lang === 'zh-Hans' || lang === 'zh-Hant' ? '你已取消 INJ Gift 钱包授权。' : 'You cancelled the INJ Gift wallet authorization.';
  }

  if (result.key === 'login_required') {
    return {
      en: 'Log in to INJ Pass and unlock a wallet before using this Omisper action.',
      de: 'Melde dich bei INJ Pass an und entsperre eine Wallet, bevor du diese Omisper-Aktion nutzt.',
      fr: 'Connectez-vous à INJ Pass et déverrouillez un portefeuille avant cette action Omisper.',
      ko: '이 Omisper 작업을 사용하려면 INJ Pass에 로그인하고 지갑을 잠금 해제하세요.',
      ja: 'この Omisper 操作を使う前に INJ Pass にログインしてウォレットを解除してください。',
      'zh-Hans': '请先登录 INJ Pass 并解锁钱包，再使用这项 Omisper 操作。',
      'zh-Hant': '請先登入 INJ Pass 並解鎖錢包，再使用這項 Omisper 操作。',
    }[lang];
  }

  if (result.key === 'missing_recipient') {
    return {
      en: 'Add a recipient address after @Omisper, then tell me what to send.',
      de: 'Füge nach @Omisper eine Empfängeradresse und anschließend die Nachricht ein.',
      fr: 'Ajoutez une adresse destinataire après @Omisper, puis le message à envoyer.',
      ko: '@Omisper 뒤에 받는 주소와 보낼 메시지를 입력하세요.',
      ja: '@Omisper の後に宛先アドレスと送信内容を入力してください。',
      'zh-Hans': '请在 @Omisper 后加入收件地址，再告诉我要发送的内容。',
      'zh-Hant': '請在 @Omisper 後加入收件地址，再告訴我要傳送的內容。',
    }[lang];
  }

  if (result.key === 'missing_message') {
    return {
      en: 'The recipient is ready. Add the message you want Omisper to send.',
      de: 'Der Empfänger ist bereit. Ergänze jetzt die Nachricht für Omisper.',
      fr: 'Le destinataire est prêt. Ajoutez maintenant le message à envoyer.',
      ko: '받는 주소를 확인했습니다. Omisper가 보낼 메시지를 입력하세요.',
      ja: '宛先を確認しました。Omisper で送るメッセージを追加してください。',
      'zh-Hans': '收件地址已经识别，请再补充要由 Omisper 发送的消息。',
      'zh-Hant': '收件地址已經識別，請再補充要由 Omisper 傳送的訊息。',
    }[lang];
  }

  if (result.key === 'recipient_unavailable') {
    const recipients = stringListValue(data.recipients);
    const target = recipients.length > 0 ? recipients.join(', ') : stringValue(data.recipient);
    return {
      en: `Omisper cannot message ${target || 'that address'} yet because it has not registered an XMTP inbox. Ask the recipient to open Omisper once first.`,
      de: `Omisper kann ${target || 'diese Adresse'} noch nicht erreichen, weil kein XMTP-Postfach registriert ist. Der Empfänger muss Omisper zuerst einmal öffnen.`,
      fr: `Omisper ne peut pas encore contacter ${target || 'cette adresse'}, car aucune boîte XMTP n’est enregistrée. Le destinataire doit d’abord ouvrir Omisper une fois.`,
      ko: `${target || '해당 주소'}에 등록된 XMTP 받은편지함이 없어 아직 메시지를 보낼 수 없습니다. 받는 사람이 Omisper를 한 번 열어야 합니다.`,
      ja: `${target || 'そのアドレス'} には XMTP 受信箱がまだ登録されていません。受信者が先に Omisper を一度開く必要があります。`,
      'zh-Hans': `${target || '该地址'} 尚未注册 XMTP 收件箱，暂时无法发送。请让收件人先打开一次 Omisper。`,
      'zh-Hant': `${target || '該地址'} 尚未註冊 XMTP 收件匣，暫時無法傳送。請讓收件人先開啟一次 Omisper。`,
    }[lang];
  }

  if (result.key === 'omisper_group_sent') {
    const count = Number(data.recipientCount || 0);
    const sentMessage = stringValue(data.message).replace(/\s+/g, ' ').trim();
    const messagePreview = sentMessage.length > 160 ? `${sentMessage.slice(0, 157)}...` : sentMessage;
    return {
      en: `Omisper created an encrypted group with ${count} recipients and sent: “${messagePreview}”`,
      de: `Omisper hat eine verschlüsselte Gruppe mit ${count} Empfängern erstellt und gesendet: „${messagePreview}“`,
      fr: `Omisper a créé un groupe chiffré avec ${count} destinataires et envoyé : « ${messagePreview} »`,
      ko: `Omisper가 ${count}명과 암호화 그룹을 만들고 다음 메시지를 보냈습니다: “${messagePreview}”`,
      ja: `Omisper が ${count} 人の暗号化グループを作成し、次を送信しました:「${messagePreview}」`,
      'zh-Hans': `Omisper 已创建包含 ${count} 位收件人的加密群聊，并发送：“${messagePreview}”`,
      'zh-Hant': `Omisper 已建立包含 ${count} 位收件人的加密群聊，並傳送：「${messagePreview}」`,
    }[lang];
  }

  if (result.key === 'omisper_sent' || result.key === 'omisper_broadcast_sent') {
    const count = Number(data.recipientCount || 1);
    const target = count > 1 ? `${count}` : stringValue(data.recipient);
    const sentMessage = stringValue(data.message).replace(/\s+/g, ' ').trim();
    const messagePreview = sentMessage.length > 160 ? `${sentMessage.slice(0, 157)}...` : sentMessage;
    const suffix = messagePreview ? ` “${messagePreview}”` : '';
    return {
      en: count > 1 ? `Omisper sent the encrypted message to ${target} recipients:${suffix}` : `Omisper sent the encrypted message to ${target}:${suffix}`,
      de: count > 1 ? `Omisper hat die verschlüsselte Nachricht an ${target} Empfänger gesendet:${suffix}` : `Omisper hat die verschlüsselte Nachricht an ${target} gesendet:${suffix}`,
      fr: count > 1 ? `Omisper a envoyé le message chiffré à ${target} destinataires :${suffix}` : `Omisper a envoyé le message chiffré à ${target} :${suffix}`,
      ko: count > 1 ? `Omisper가 ${target}명에게 암호화 메시지를 보냈습니다:${suffix}` : `Omisper가 ${target} 주소로 암호화 메시지를 보냈습니다:${suffix}`,
      ja: count > 1 ? `Omisper が ${target} 人に暗号化メッセージを送信しました:${suffix}` : `Omisper が ${target} に暗号化メッセージを送信しました:${suffix}`,
      'zh-Hans': count > 1 ? `Omisper 已向 ${target} 位收件人发送加密消息：${suffix}` : `Omisper 已向 ${target} 发送加密消息：${suffix}`,
      'zh-Hant': count > 1 ? `Omisper 已向 ${target} 位收件人傳送加密訊息：${suffix}` : `Omisper 已向 ${target} 傳送加密訊息：${suffix}`,
    }[lang];
  }

  if (result.key === 'omisper_inbox') {
    const count = Number(data.conversationCount || 0);
    const latest = listValue(data.latest).slice(0, 5);
    const heading = {
      en: `Omisper synced ${count} conversations.`,
      de: `Omisper hat ${count} Unterhaltungen synchronisiert.`,
      fr: `Omisper a synchronisé ${count} conversations.`,
      ko: `Omisper가 대화 ${count}개를 동기화했습니다.`,
      ja: `Omisper が ${count} 件の会話を同期しました。`,
      'zh-Hans': `Omisper 已同步 ${count} 个会话。`,
      'zh-Hant': `Omisper 已同步 ${count} 個會話。`,
    }[lang];
    if (latest.length === 0) return heading;
    return `${heading}\n\n${latest.map((item) => `- **${stringValue(item.title) || stringValue(item.id)}**: ${stringValue(item.preview) || '—'}`).join('\n')}`;
  }

  if (result.key === 'omisper_history') {
    const messages = listValue(data.messages).slice(-10);
    const target = stringValue(data.target);
    const heading = {
      en: `Recent encrypted conversation with ${target}:`,
      de: `Letzte verschlüsselte Unterhaltung mit ${target}:`,
      fr: `Conversation chiffrée récente avec ${target} :`,
      ko: `${target} 주소와의 최근 암호화 대화:`,
      ja: `${target} との最近の暗号化会話:`,
      'zh-Hans': `与 ${target} 的最近加密会话：`,
      'zh-Hant': `與 ${target} 的最近加密會話：`,
    }[lang];
    if (messages.length === 0) return `${heading}\n\n—`;
    return `${heading}\n\n${messages.map((item) => `- ${stringValue(item.sender)}: ${stringValue(item.content)}`).join('\n')}`;
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
      en: 'The app is ready in INJ Pass Apps. Open it to continue with the full interface.',
      de: 'Die App ist in INJ Pass Apps bereit. Öffne sie für die vollständige Oberfläche.',
      fr: 'L’application est prête dans INJ Pass Apps. Ouvrez-la pour continuer.',
      ko: 'INJ Pass 앱에서 준비되었습니다. 전체 화면을 열어 계속하세요.',
      ja: 'INJ Pass Apps で準備できました。完全な画面を開いて続行してください。',
      'zh-Hans': '应用已经在 INJ Pass Apps 中就绪，打开后可以使用完整界面。',
      'zh-Hant': '應用已經在 INJ Pass Apps 中就緒，開啟後可以使用完整介面。',
    }[lang];
  }

  return genericFailure[lang];
}
