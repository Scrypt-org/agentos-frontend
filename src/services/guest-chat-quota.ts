export const GUEST_CHAT_LIMIT = 3;

const GUEST_CHAT_STORAGE_KEY = 'injpass_guest_chat_replies';

export interface GuestChatQuota {
  used: number;
  remaining: number;
  exhausted: boolean;
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function toQuota(used: number): GuestChatQuota {
  const safeUsed = Math.min(GUEST_CHAT_LIMIT, Math.max(0, Math.floor(used)));
  const remaining = GUEST_CHAT_LIMIT - safeUsed;
  return { used: safeUsed, remaining, exhausted: remaining === 0 };
}

export function getGuestChatQuota(storage?: Storage): GuestChatQuota {
  try {
    const value = resolveStorage(storage)?.getItem(GUEST_CHAT_STORAGE_KEY);
    const parsed = Number(value);
    return toQuota(value !== null && Number.isFinite(parsed) ? parsed : 0);
  } catch {
    return toQuota(0);
  }
}

export function consumeGuestChatReply(storage?: Storage): GuestChatQuota {
  const target = resolveStorage(storage);
  const next = toQuota(getGuestChatQuota(target ?? undefined).used + 1);
  try {
    target?.setItem(GUEST_CHAT_STORAGE_KEY, String(next.used));
  } catch {
    // Storage can be unavailable in privacy modes; the current reply still succeeds.
  }
  return next;
}
