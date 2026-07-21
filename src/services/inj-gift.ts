const PACKET_ID_PATTERN = /0x[a-fA-F0-9]{64}/;
const SHARE_CODE_PATTERN = /(?:^|[\s"'`])([1-9A-HJ-NP-Za-km-z]{8})(?=$|[\s,，;；.!?。！？"'`])/;
const SHARE_URL_PATTERN = /https?:\/\/[^\s/]+(?:\/[^\s/]+)*\/claim\/(?:0x[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{8})/;

export type InjGiftCommand =
  | {
      kind: 'create';
      amount: string;
      count: number;
      password: string;
      durationSec: number;
      mode: 'random' | 'equal';
      generatedPassword: boolean;
    }
  | { kind: 'claim'; packetReference: string; password: string }
  | { kind: 'query'; packetReference: string }
  | { kind: 'help'; intent?: 'create' | 'create-passcode' | 'claim' | 'query' };

function parseDuration(text: string): number {
  const match = text.match(
    /(\d+)\s*(分钟|分|min(?:ute)?s?|小时|时|hours?|hrs?|天|days?)/i,
  );
  if (!match) return 24 * 60 * 60;
  const amount = Math.max(1, Number(match[1]));
  const unit = match[2].toLocaleLowerCase();
  if (unit.includes('分') || unit.startsWith('min')) return amount * 60;
  if (unit.includes('天') || unit.startsWith('day')) return amount * 24 * 60 * 60;
  return amount * 60 * 60;
}

function parsePassword(text: string): string | null {
  const match = text.match(
    /(?:密码|口令|兑换码|验证码|pass(?:word|code)?|code)\s*[:：=]?\s*["']?([^\s,，;；"']+)/i,
  );
  return match?.[1]?.trim() || null;
}

export function isInjGiftMessage(text: string): boolean {
  return /@\s*inj(?:\s|-|_)?gift\b/i.test(text) || /@\s*injift\b/i.test(text);
}

export function parseInjGiftCommand(rawText: string): InjGiftCommand {
  const text = rawText
    .replace(/@\s*inj(?:\s|-|_)?gift\b/ig, ' ')
    .replace(/@\s*injift\b/ig, ' ')
    .trim();
  const packetReference = text.match(SHARE_URL_PATTERN)?.[0]
    || text.match(PACKET_ID_PATTERN)?.[0]
    || text.match(SHARE_CODE_PATTERN)?.[1];
  const password = parsePassword(text);
  const queryIntent = /(查询|查看|余额|状态|剩余|详情|check|query|status|balance|remaining)/i.test(text);
  const claimIntent = /(领取|接收|打开红包|领红包|claim|receive|redeem)/i.test(text);
  const createIntent = /(创建|新建|发送|发一个|发红包|生成|create|send|make)/i.test(text);

  if (createIntent) {
    const amount = text.match(/(\d+(?:\.\d+)?)\s*INJ\b/i)?.[1];
    if (!amount || Number(amount) <= 0) return { kind: 'help', intent: 'create' };
    // A gift must have a claim passcode — never auto-generate one. If the user
    // didn't provide it, ask them to before creating.
    if (!password) return { kind: 'help', intent: 'create-passcode' };
    const countMatch = text.match(/(\d+)\s*(?:份|个|人|packets?|gifts?|copies?)/i);
    return {
      kind: 'create',
      amount,
      count: Math.max(1, countMatch ? Number(countMatch[1]) : 1),
      password,
      durationSec: parseDuration(text),
      mode: /(平分|平均|等额|equal|even)/i.test(text) ? 'equal' : 'random',
      generatedPassword: false,
    };
  }

  if (packetReference && queryIntent) return { kind: 'query', packetReference };
  if (packetReference && (claimIntent || password)) {
    return password
      ? { kind: 'claim', packetReference, password }
      : { kind: 'help', intent: 'claim' };
  }
  if (packetReference) return { kind: 'query', packetReference };
  if (claimIntent) return { kind: 'help', intent: 'claim' };
  if (queryIntent) return { kind: 'help', intent: 'query' };
  return { kind: 'help' };
}

export function injGiftHelpMessage(
  intent: 'create' | 'create-passcode' | 'claim' | 'query' | undefined,
  languageCode: string,
): string {
  const zh = languageCode.startsWith('zh');
  if (zh) {
    if (intent === 'create-passcode') {
      return '红包必须设置领取口令。请补上口令再创建，例如：`@INJ Gift 发 0.1 INJ 红包，2 份，口令 8888`。';
    }
    if (intent === 'create') {
      return '请带上金额，例如：`@INJ Gift 创建 0.1 INJ 红包，5 份，密码 lucky，24 小时，随机分配`。';
    }
    if (intent === 'claim') {
      return '请粘贴分享链接或 8 位分享码，并附上领取口令。';
    }
    if (intent === 'query') {
      return '请粘贴分享链接、8 位分享码或完整红包 ID。';
    }
    return 'INJ Gift 支持创建、领取和查询红包，所有业务操作均由独立的 INJ Gift mini-app 执行。';
  }
  if (intent === 'create-passcode') {
    return 'A gift needs a claim passcode. Add one before creating, e.g. `@INJ Gift send a 0.1 INJ gift for 2 people, passcode 8888`.';
  }
  if (intent === 'create') {
    return 'Include an amount, for example: `@INJ Gift create a 0.1 INJ gift for 5 people, password lucky`.';
  }
  if (intent === 'claim') {
    return 'Paste the share link or 8-character share code and include the claim passcode.';
  }
  if (intent === 'query') {
    return 'Paste the share link, 8-character share code, or full packet ID.';
  }
  return 'INJ Gift supports creating, claiming, and querying gifts through the independent INJ Gift mini-app.';
}
