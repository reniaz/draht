import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRecent, forget, recall, recallChatId, recentCount, remember,
} from './recentMessages';

const message = (id: number) => ({ id, content: { text: { text: `m${id}` } } }) as any;

describe('recent message buffer', () => {
  beforeEach(() => {
    clearRecent();
  });

  it('hands back a message the client no longer holds', () => {
    // The whole point: a chat that was never opened has nothing in global state, so this
    // is the only copy when the delete arrives.
    remember('123', message(5));

    expect(recall('123', 5)).toBeDefined();
  });

  it('knows which chat an id belongs to', () => {
    // Deletions on the common-box path arrive with no chat id, and upstream resolves them
    // by searching loaded messages — which misses for exactly the same reason.
    remember('123', message(5));

    expect(recallChatId(5)).toBe('123');
  });

  it('keeps only the most recent per chat', () => {
    for (let i = 1; i <= 80; i++) remember('123', message(i));

    expect(recall('123', 80)).toBeDefined();
    expect(recall('123', 1)).toBeUndefined();
    expect(recentCount()).toBe(60);
  });

  it('forgets the chat id along with the message', () => {
    // A stale id would resolve a later deletion to the wrong chat.
    for (let i = 1; i <= 80; i++) remember('123', message(i));

    expect(recallChatId(1)).toBeUndefined();
  });

  it('has a ceiling across all chats', () => {
    for (let chat = 0; chat < 40; chat++) {
      for (let i = 1; i <= 60; i++) remember(`chat${chat}`, message(chat * 1000 + i));
    }

    // 40 chats x 60 would be 2400 without one.
    expect(recentCount()).toBeLessThanOrEqual(1500);
  });

  it('drops the quietest chats first when it fills up', () => {
    for (let i = 1; i <= 60; i++) remember('quiet', message(i));
    for (let chat = 0; chat < 40; chat++) {
      for (let i = 1; i <= 60; i++) remember(`busy${chat}`, message(100000 + chat * 1000 + i));
    }

    // The chat not written to since the start is the one to lose.
    expect(recall('quiet', 60)).toBeUndefined();
    expect(recall('busy39', 100000 + 39 * 1000 + 60)).toBeDefined();
  });

  it('drops a purged message on request', () => {
    remember('123', message(5));
    forget('123', 5);

    expect(recall('123', 5)).toBeUndefined();
    expect(recallChatId(5)).toBeUndefined();
  });

  it('ignores updates with nothing usable in them', () => {
    remember('', message(5));
    remember('123', {} as any);

    expect(recentCount()).toBe(0);
  });
});
