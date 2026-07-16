type DAppIdentity = { id: string };

const HIDDEN_SHELL_DAPP_IDS = new Set(['bankrupt-elon-musk']);

const isVisibleInShell = (app: DAppIdentity) => !HIDDEN_SHELL_DAPP_IDS.has(app.id);

export const visibleSidebarDApps = <T extends DAppIdentity>(apps: T[]): T[] =>
  apps.filter(isVisibleInShell);

export const visibleComposerDApps = <T extends DAppIdentity>(apps: T[]): T[] =>
  apps.filter(isVisibleInShell);

export const isCampaignVisible = (appId: string): boolean =>
  !HIDDEN_SHELL_DAPP_IDS.has(appId);
