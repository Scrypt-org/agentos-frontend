import assert from 'node:assert/strict';

import {
  formatMiniAppAgentResult,
  parseMiniAppAgentCommand,
} from '../src/services/mini-app-commands';

const addressA = '0x6920cCdC0B23d1Df39Dd29569FCC2a2Ec5Be0658';
const addressB = '0xc6BFEc52cd50e78fDc6B0eaf7430Cb3a434a0efB';

const chineseSend = parseMiniAppAgentCommand(
  `@Omisper 给 ${addressA} 发个消息说7月21日杭州见！`,
  'zh-Hans',
);
assert.equal(chineseSend?.action, 'send');
assert.deepEqual(chineseSend?.params.addresses, [addressA]);
assert.equal(chineseSend?.params.message, '7月21日杭州见！');

const englishSend = parseMiniAppAgentCommand(
  `@Omisper send ${addressA} a message saying See you in Hangzhou on July 21!`,
  'en',
);
assert.equal(englishSend?.action, 'send');
assert.equal(englishSend?.params.message, 'See you in Hangzhou on July 21!');

const frenchSend = parseMiniAppAgentCommand(
  `@Omisper envoyer à ${addressA} le message “Rendez-vous à Hangzhou le 21 juillet !”`,
  'fr',
);
assert.equal(frenchSend?.action, 'send');
assert.equal(frenchSend?.params.message, 'Rendez-vous à Hangzhou le 21 juillet !');

const germanSend = parseMiniAppAgentCommand(
  `@Omisper sende an ${addressA} die Nachricht “Wir sehen uns am 21. Juli in Hangzhou!”`,
  'de',
);
assert.equal(germanSend?.action, 'send');
assert.equal(germanSend?.params.message, 'Wir sehen uns am 21. Juli in Hangzhou!');

const koreanSend = parseMiniAppAgentCommand(
  `@Omisper ${addressA}에게 “7월 21일 항저우에서 만나요!” 메시지를 보내줘`,
  'ko',
);
assert.equal(koreanSend?.action, 'send');
assert.equal(koreanSend?.params.message, '7월 21일 항저우에서 만나요!');

const japaneseSend = parseMiniAppAgentCommand(
  `@Omisper ${addressA} に「7月21日に杭州で会いましょう！」と送信して`,
  'ja',
);
assert.equal(japaneseSend?.action, 'send');
assert.equal(japaneseSend?.params.message, '7月21日に杭州で会いましょう！');

const traditionalChineseSend = parseMiniAppAgentCommand(
  `@Omisper 給 ${addressA} 發個訊息說7月21日杭州見！`,
  'zh-Hant',
);
assert.equal(traditionalChineseSend?.action, 'send');
assert.equal(traditionalChineseSend?.params.message, '7月21日杭州見！');

const chineseInbox = parseMiniAppAgentCommand('@Omisper 看看我有没有新消息', 'zh-Hans');
assert.equal(chineseInbox?.action, 'inbox');

const englishInbox = parseMiniAppAgentCommand('@Omisper show my new messages', 'en');
assert.equal(englishInbox?.action, 'inbox');

const chineseHistory = parseMiniAppAgentCommand(
  `@Omisper 查看我和 ${addressA} 的聊天记录`,
  'zh-Hans',
);
assert.equal(chineseHistory?.action, 'history');
assert.deepEqual(chineseHistory?.params.addresses, [addressA]);

const chineseBroadcast = parseMiniAppAgentCommand(
  `@Omisper 群发给 ${addressA}、${addressB}，消息是杭州见！`,
  'zh-Hans',
);
assert.equal(chineseBroadcast?.action, 'broadcast');
assert.deepEqual(chineseBroadcast?.params.addresses, [addressA, addressB]);
assert.equal(chineseBroadcast?.params.message, '杭州见！');

const inferredBroadcast = parseMiniAppAgentCommand(
  `@Omisper send ${addressA} and ${addressB} a message saying Hello everyone`,
  'en',
);
assert.equal(inferredBroadcast?.action, 'broadcast');
assert.equal(inferredBroadcast?.params.message, 'Hello everyone');

const groupChat = parseMiniAppAgentCommand(
  `@Omisper create a group chat with ${addressA} and ${addressB} saying Hello group`,
  'en',
);
assert.equal(groupChat?.action, 'group');
assert.equal(groupChat?.params.message, 'Hello group');

const commandCases: Array<{
  name: string;
  text: string;
  language: string;
  action: string;
  message?: string;
}> = [
  {
    name: 'English DM shorthand',
    text: `@Omisper DM ${addressA}: See you at seven`,
    language: 'en',
    action: 'send',
    message: 'See you at seven',
  },
  {
    name: 'English message before address',
    text: `@Omisper send See you soon to ${addressA}`,
    language: 'en',
    action: 'send',
    message: 'See you soon',
  },
  {
    name: 'English unread inbox',
    text: '@Omisper do I have any unread messages?',
    language: 'en',
    action: 'inbox',
  },
  {
    name: 'English previous conversation',
    text: `@Omisper show previous messages with ${addressA}`,
    language: 'en',
    action: 'history',
  },
  {
    name: 'German direct message',
    text: `@Omisper schicke ${addressA} bitte die Nachricht: Wir treffen uns morgen`,
    language: 'de',
    action: 'send',
    message: 'Wir treffen uns morgen',
  },
  {
    name: 'German inbox',
    text: '@Omisper habe ich ungelesene Nachrichten?',
    language: 'de',
    action: 'inbox',
  },
  {
    name: 'German history',
    text: `@Omisper zeige den Chatverlauf mit ${addressA}`,
    language: 'de',
    action: 'history',
  },
  {
    name: 'French notify',
    text: `@Omisper préviens ${addressA} que rendez-vous demain`,
    language: 'fr',
    action: 'send',
    message: 'rendez-vous demain',
  },
  {
    name: 'French inbox',
    text: '@Omisper ai-je reçu de nouveaux messages ?',
    language: 'fr',
    action: 'inbox',
  },
  {
    name: 'French history',
    text: `@Omisper affiche l’historique de conversation avec ${addressA}`,
    language: 'fr',
    action: 'history',
  },
  {
    name: 'Korean relay',
    text: `@Omisper ${addressA}에게 내일 만나자고 전해줘`,
    language: 'ko',
    action: 'send',
    message: '내일 만나자',
  },
  {
    name: 'Korean inbox',
    text: '@Omisper 안 읽은 메시지 확인해줘',
    language: 'ko',
    action: 'inbox',
  },
  {
    name: 'Korean history',
    text: `@Omisper ${addressA}와의 대화 내역 보여줘`,
    language: 'ko',
    action: 'history',
  },
  {
    name: 'Japanese relay',
    text: `@Omisper ${addressA}に 明日会おうと伝えて`,
    language: 'ja',
    action: 'send',
    message: '明日会おう',
  },
  {
    name: 'Japanese inbox',
    text: '@Omisper 未読メッセージを確認して',
    language: 'ja',
    action: 'inbox',
  },
  {
    name: 'Japanese history',
    text: `@Omisper ${addressA}との会話履歴を見せて`,
    language: 'ja',
    action: 'history',
  },
  {
    name: 'Simplified Chinese private message',
    text: `@Omisper 帮我私信 ${addressA}：周五杭州见`,
    language: 'zh-Hans',
    action: 'send',
    message: '周五杭州见',
  },
  {
    name: 'Simplified Chinese inbox',
    text: '@Omisper 刷新一下我的未读消息',
    language: 'zh-Hans',
    action: 'inbox',
  },
  {
    name: 'Traditional Chinese message',
    text: `@Omisper 通知 ${addressA}：週五杭州見`,
    language: 'zh-Hant',
    action: 'send',
    message: '週五杭州見',
  },
  {
    name: 'Traditional Chinese inbox',
    text: '@Omisper 查看我的未讀訊息',
    language: 'zh-Hant',
    action: 'inbox',
  },
  {
    name: 'Chinese broadcast synonym',
    text: `@Omisper 批量发送给 ${addressA}、${addressB}，内容是杭州见`,
    language: 'zh-Hans',
    action: 'broadcast',
    message: '杭州见',
  },
  {
    name: 'Chinese group synonym',
    text: `@Omisper 把 ${addressA} 和 ${addressB} 拉群，消息是大家好`,
    language: 'zh-Hans',
    action: 'group',
    message: '大家好',
  },
  {
    name: 'Open without actionable intent',
    text: '@Omisper 打开应用',
    language: 'zh-Hans',
    action: 'open',
  },
  {
    name: 'English tell synonym',
    text: `@Omisper tell ${addressA} that the meeting moved to nine`,
    language: 'en',
    action: 'send',
    message: 'the meeting moved to nine',
  },
  {
    name: 'German say synonym',
    text: `@Omisper sage ${addressA} dass wir später kommen`,
    language: 'de',
    action: 'send',
    message: 'wir später kommen',
  },
  {
    name: 'French broadcast',
    text: `@Omisper envoie à tous ${addressA} ${addressB} le message “Bonjour à tous”`,
    language: 'fr',
    action: 'broadcast',
    message: 'Bonjour à tous',
  },
  {
    name: 'German group creation',
    text: `@Omisper erstelle eine Gruppe mit ${addressA} und ${addressB} und schreibe “Willkommen”`,
    language: 'de',
    action: 'group',
    message: 'Willkommen',
  },
  {
    name: 'Korean broadcast',
    text: `@Omisper ${addressA}와 ${addressB}에게 “내일 만나요”라고 모두에게 보내줘`,
    language: 'ko',
    action: 'broadcast',
    message: '내일 만나요',
  },
  {
    name: 'Japanese group creation',
    text: `@Omisper ${addressA}と${addressB}のグループチャットを作成して「ようこそ」と送って`,
    language: 'ja',
    action: 'group',
    message: 'ようこそ',
  },
  {
    name: 'Chinese spoken relay',
    text: `@Omisper 跟 ${addressA} 说周六见`,
    language: 'zh-Hans',
    action: 'send',
    message: '周六见',
  },
  {
    name: 'Chinese message-before-address',
    text: `@Omisper 把周日见发送给 ${addressA}`,
    language: 'zh-Hans',
    action: 'send',
    message: '周日见',
  },
  {
    name: 'Traditional Chinese group',
    text: `@Omisper 建立群組 ${addressA}、${addressB}，訊息是週日見`,
    language: 'zh-Hant',
    action: 'group',
    message: '週日見',
  },
  {
    name: 'Voice-recognition app alias',
    text: `@Omnisper message ${addressA}: alias works`,
    language: 'en',
    action: 'send',
    message: 'alias works',
  },
];

for (const commandCase of commandCases) {
  const parsed = parseMiniAppAgentCommand(commandCase.text, commandCase.language);
  assert.equal(parsed?.action, commandCase.action, `${commandCase.name}: action`);
  if (commandCase.message) {
    assert.equal(parsed?.params.message, commandCase.message, `${commandCase.name}: message`);
  }
}

const resultCopy = formatMiniAppAgentResult({
  ok: true,
  key: 'omisper_sent',
  data: { recipient: addressA, recipientCount: 1, message: '7月21日杭州见！' },
}, 'zh-Hans');
assert.match(resultCopy, /7月21日杭州见/);

const giftCreate = parseMiniAppAgentCommand(
  '@INJ Gift 创建 0.01 INJ 红包，2 份，密码 lucky，1 小时，平均分配',
  'zh-Hans',
);
assert.equal(giftCreate?.appId, 'inj-gift');
assert.equal(giftCreate?.action, 'create');
assert.deepEqual(giftCreate?.params, {
  amount: '0.01',
  count: 2,
  password: 'lucky',
  durationSec: 3600,
  mode: 'equal',
});

const packetId = `0x${'ab'.repeat(32)}`;
const giftClaim = parseMiniAppAgentCommand(`@INJ Gift 领取 ${packetId} 密码 lucky`, 'zh-Hans');
assert.equal(giftClaim?.appId, 'inj-gift');
assert.equal(giftClaim?.action, 'claim');
assert.equal(giftClaim?.params.packetId, packetId);

const giftCreatedCopy = formatMiniAppAgentResult({
  ok: true,
  key: 'inj_gift_created',
  data: { transactionHash: '0xcreate', packetId, password: 'lucky', amount: '0.01', count: 2 },
}, 'zh-Hans');
assert.match(giftCreatedCopy, /红包已创建/);
assert.match(giftCreatedCopy, new RegExp(packetId));

console.log('Mini-app command parsing tests passed.');
