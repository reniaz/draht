import { beforeEach, describe, expect, it } from 'vitest';

import type { ApiMessage } from '../../api/types';

import {
  clearAll, enqueue, evict, evictChat, flush, getLogIndex, getLoggedMessages,
  setRetentionPolicy, setStorageEnabled,
} from './Storage';

function makeMessage(id: number, text = `message ${id}`): ApiMessage {
  return {
    id,
    chatId: '-100123',
    date: 1700000000,
    isOutgoing: false,
    content: { text: { text } },
    // Transient field that must not survive into the store.
    isDeleting: true,
  } as ApiMessage;
}

describe('message log storage', () => {
  beforeEach(async () => {
    await clearAll();
    setStorageEnabled(true);
    setRetentionPolicy({ maxPerChat: 200, maxTotalMessages: 5000, maxAgeDays: 30 });
  });

  it('persists and reads back a logged message', async () => {
    enqueue('-100123', makeMessage(1), Date.now());
    await flush();

    const stored = await getLoggedMessages('-100123');

    expect(stored).toHaveLength(1);
    expect(stored[0].content?.text?.text).toBe('message 1');
    expect(typeof stored[0].modDeletedAt).toBe('number');
  });

  it('strips transient fields', async () => {
    enqueue('-100123', makeMessage(1), Date.now());
    await flush();

    const [stored] = await getLoggedMessages('-100123');

    // `isDeleting` is upstream's in-flight marker; persisting it would let a rehydrated
    // message be collected by the delete sweep.
    expect(stored.isDeleting).toBeUndefined();
  });

  it('does not write when storage is disabled', async () => {
    setStorageEnabled(false);
    enqueue('-100123', makeMessage(1), Date.now());
    await flush();

    expect(await getLoggedMessages('-100123')).toHaveLength(0);
  });

  it('merges across separate flushes', async () => {
    enqueue('-100123', makeMessage(1), Date.now() - 2000);
    await flush();
    enqueue('-100123', makeMessage(2), Date.now() - 1000);
    await flush();

    expect(await getLoggedMessages('-100123')).toHaveLength(2);
  });

  it('keeps the newest when the per-chat cap is exceeded', async () => {
    setRetentionPolicy({ maxPerChat: 3 });

    const now = Date.now();
    for (let i = 1; i <= 5; i++) enqueue('-100123', makeMessage(i), now - (10 - i) * 1000);
    await flush();

    const stored = await getLoggedMessages('-100123');

    expect(stored).toHaveLength(3);
    expect(stored.map((m) => m.id).sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it('discards entries older than the age limit', async () => {
    setRetentionPolicy({ maxAgeDays: 1 });

    const old = Date.now() - 3 * 24 * 60 * 60 * 1000;
    enqueue('-100123', makeMessage(1), old);
    enqueue('-100123', makeMessage(2), Date.now());
    await flush();

    const stored = await getLoggedMessages('-100123');

    expect(stored.map((m) => m.id)).toEqual([2]);
  });

  it('evicts whole chats when the global cap is exceeded', async () => {
    setRetentionPolicy({ maxTotalMessages: 4, maxPerChat: 10 });

    const now = Date.now();
    for (let i = 1; i <= 3; i++) enqueue('chatA', makeMessage(i), now - (10 - i) * 1000);
    await flush();
    for (let i = 1; i <= 3; i++) enqueue('chatB', makeMessage(i), now - (10 - i) * 1000);
    await flush();

    // chatA was touched least recently, so it goes first.
    expect(await getLoggedMessages('chatA')).toHaveLength(0);
    expect(await getLoggedMessages('chatB')).toHaveLength(3);
  });

  it('evicts individual messages', async () => {
    enqueue('-100123', makeMessage(1), Date.now() - 2000);
    enqueue('-100123', makeMessage(2), Date.now() - 1000);
    await flush();

    await evict('-100123', [1]);

    expect((await getLoggedMessages('-100123')).map((m) => m.id)).toEqual([2]);
  });

  it('drops the chat record once its last message is evicted', async () => {
    enqueue('-100123', makeMessage(1), Date.now());
    await flush();

    await evict('-100123', [1]);

    expect(await getLogIndex()).not.toHaveProperty('-100123');
  });

  it('evicts an entire chat, including messages not in memory', async () => {
    enqueue('-100123', makeMessage(1), Date.now());
    await flush();

    await evictChat('-100123');

    expect(await getLoggedMessages('-100123')).toHaveLength(0);
    expect(await getLogIndex()).not.toHaveProperty('-100123');
  });

  it('tracks counts in the index', async () => {
    enqueue('-100123', makeMessage(1), Date.now() - 1000);
    enqueue('-100123', makeMessage(2), Date.now());
    await flush();

    expect((await getLogIndex())['-100123'].count).toBe(2);
  });
});
