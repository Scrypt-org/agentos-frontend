import { describe, expect, it } from 'vitest';
import {
  consumeGuestChatReply,
  getGuestChatQuota,
  GUEST_CHAT_LIMIT,
} from './guest-chat-quota';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('guest chat quota', () => {
  it('starts with three available replies', () => {
    const quota = getGuestChatQuota(new MemoryStorage());

    expect(quota).toEqual({ used: 0, remaining: GUEST_CHAT_LIMIT, exhausted: false });
  });

  it('counts successful replies and reports the remaining allowance', () => {
    const storage = new MemoryStorage();

    expect(consumeGuestChatReply(storage)).toEqual({ used: 1, remaining: 2, exhausted: false });
    expect(consumeGuestChatReply(storage)).toEqual({ used: 2, remaining: 1, exhausted: false });
  });

  it('caps usage at three and marks the allowance exhausted', () => {
    const storage = new MemoryStorage();

    consumeGuestChatReply(storage);
    consumeGuestChatReply(storage);
    expect(consumeGuestChatReply(storage)).toEqual({ used: 3, remaining: 0, exhausted: true });
    expect(consumeGuestChatReply(storage)).toEqual({ used: 3, remaining: 0, exhausted: true });
  });

  it('treats malformed stored state as unused', () => {
    const storage = new MemoryStorage();
    storage.setItem('injpass_guest_chat_replies', 'not-a-number');

    expect(getGuestChatQuota(storage)).toEqual({ used: 0, remaining: 3, exhausted: false });
  });
});
