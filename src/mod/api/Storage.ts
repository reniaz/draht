import { createStore, del, get, keys, set } from 'idb-keyval';

import type { ApiMessage } from '../../api/types';

import { modLogger } from './Logger';

const logger = modLogger.scoped('Storage');

/**
 * Durable store for the message log.
 *
 * A dedicated IndexedDB database, deliberately **not** upstream's `tt-data`. Upstream's
 * `reduceGlobal` -> `reduceMessages` (src/global/cache.ts) only persists messages for
 * currently-open chats, saved messages, the forum panel and the first ten archived chats
 * — it is lossy by design. Riding on it would silently drop most of the log.
 *
 * `IdbStore` in `src/util/browser/idb.ts` is not exported as a class, only as instances,
 * so this talks to idb-keyval directly (already a dependency).
 *
 * Layout — one record per chat rather than per message, so chat blobs stay small enough
 * to read whole, and the separate index lets eviction run without deserialising
 * everything:
 *
 *   v              schema version
 *   index          Record<chatId, ChatIndexEntry>
 *   chat:<chatId>  { updatedAt, messages: Record<messageId, LoggedMessage> }
 */
const store = createStore('draht-log', 'store');

const SCHEMA_VERSION = 1;
const FLUSH_DELAY = 1000;

export type LoggedMessage = ApiMessage & { modDeletedAt?: number };

type ChatBlob = {
  updatedAt: number;
  messages: Record<number, LoggedMessage>;
};

type ChatIndexEntry = {
  count: number;
  oldest: number;
  newest: number;
  touched: number;
};

type LogIndex = Record<string, ChatIndexEntry>;

export type RetentionPolicy = {
  maxPerChat: number;
  maxTotalMessages: number;
  maxAgeDays: number;
};

/** Fields that are meaningless once persisted, or not structured-cloneable. */
const TRANSIENT_KEYS = [
  'isDeleting', 'previousLocalId', 'sendingState', 'isInAlbum', 'isForwardingAllowed',
] as const;

function sanitize(message: ApiMessage): LoggedMessage {
  const copy: any = { ...message };
  for (const key of TRANSIENT_KEYS) delete copy[key];
  return copy;
}

const dirtyChats = new Set<string>();
const pending = new Map<string, Record<number, LoggedMessage>>();
let flushHandle: number | undefined;
let isEnabled = true;

export function setStorageEnabled(enabled: boolean) {
  isEnabled = enabled;
}

async function readIndex(): Promise<LogIndex> {
  return (await get<LogIndex>('index', store)) ?? {};
}

async function readChat(chatId: string): Promise<ChatBlob | undefined> {
  return get<ChatBlob>(`chat:${chatId}`, store);
}

export async function getLoggedMessages(chatId: string): Promise<LoggedMessage[]> {
  try {
    const blob = await readChat(chatId);
    if (!blob) return [];

    return Object.values(blob.messages)
      .sort((a, b) => (a.modDeletedAt ?? 0) - (b.modDeletedAt ?? 0));
  } catch (err) {
    logger.error('failed to read chat log', err);
    return [];
  }
}

export async function getLogIndex() {
  try {
    return await readIndex();
  } catch {
    return {};
  }
}

/** Queues a message for persistence. Never writes synchronously from a reducer. */
export function enqueue(chatId: string, message: ApiMessage, deletedAt: number) {
  if (!isEnabled) return;

  const forChat = pending.get(chatId) ?? {};
  forChat[message.id] = { ...sanitize(message), modDeletedAt: deletedAt };
  pending.set(chatId, forChat);
  dirtyChats.add(chatId);

  scheduleFlush();
}

function scheduleFlush() {
  if (flushHandle !== undefined) return;

  flushHandle = window.setTimeout(() => {
    flushHandle = undefined;
    void flush();
  }, FLUSH_DELAY);
}

let policy: RetentionPolicy = {
  maxPerChat: 200,
  maxTotalMessages: 5000,
  maxAgeDays: 30,
};

export function setRetentionPolicy(next: Partial<RetentionPolicy>) {
  policy = { ...policy, ...next };
}

export async function flush() {
  if (!dirtyChats.size) return;

  const chatIds = [...dirtyChats];
  dirtyChats.clear();

  try {
    await set('v', SCHEMA_VERSION, store);
    const index = await readIndex();

    for (const chatId of chatIds) {
      const additions = pending.get(chatId);
      pending.delete(chatId);
      if (!additions) continue;

      const existing = await readChat(chatId);
      const merged = { ...(existing?.messages ?? {}), ...additions };

      const trimmed = applyPerChatLimits(merged);
      const dates = Object.values(trimmed).map((m) => m.modDeletedAt ?? 0);

      await set(`chat:${chatId}`, {
        updatedAt: Date.now(),
        messages: trimmed,
      } satisfies ChatBlob, store);

      index[chatId] = {
        count: Object.keys(trimmed).length,
        oldest: dates.length ? Math.min(...dates) : 0,
        newest: dates.length ? Math.max(...dates) : 0,
        touched: Date.now(),
      };
    }

    await set('index', index, store);
    await enforceGlobalLimit(index);
  } catch (err) {
    // A structured-clone failure or quota error must not take the client down.
    logger.error('flush failed', err);
  }
}

function applyPerChatLimits(messages: Record<number, LoggedMessage>) {
  const cutoff = Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;

  const kept = Object.values(messages)
    .filter((m) => (m.modDeletedAt ?? 0) >= cutoff)
    .sort((a, b) => (b.modDeletedAt ?? 0) - (a.modDeletedAt ?? 0))
    .slice(0, policy.maxPerChat);

  return Object.fromEntries(kept.map((m) => [m.id, m]));
}

/**
 * Global cap, evicting whole chats least-recently-touched first.
 *
 * Unlike Vencord's MessageLogger — which free-rides on Discord's in-memory cache
 * truncation and therefore needs no policy at all — a persistent store has no ceiling and
 * would grow without bound.
 */
async function enforceGlobalLimit(index: LogIndex) {
  let total = Object.values(index).reduce((sum, entry) => sum + entry.count, 0);
  if (total <= policy.maxTotalMessages) return;

  const byAge = Object.entries(index).sort((a, b) => a[1].touched - b[1].touched);

  for (const [chatId, entry] of byAge) {
    if (total <= policy.maxTotalMessages) break;
    await del(`chat:${chatId}`, store);
    delete index[chatId];
    total -= entry.count;
    logger.info(`evicted log for chat ${chatId}`);
  }

  await set('index', index, store);
}

export async function evict(chatId: string, ids: number[]) {
  try {
    const blob = await readChat(chatId);
    if (!blob) return;

    for (const id of ids) delete blob.messages[id];

    const index = await readIndex();

    if (!Object.keys(blob.messages).length) {
      await del(`chat:${chatId}`, store);
      delete index[chatId];
    } else {
      await set(`chat:${chatId}`, { ...blob, updatedAt: Date.now() }, store);
      if (index[chatId]) index[chatId].count = Object.keys(blob.messages).length;
    }

    await set('index', index, store);
  } catch (err) {
    logger.error('evict failed', err);
  }
}

export async function evictChat(chatId: string) {
  try {
    await del(`chat:${chatId}`, store);
    const index = await readIndex();
    delete index[chatId];
    await set('index', index, store);
  } catch (err) {
    logger.error('evictChat failed', err);
  }
}

export async function clearAll() {
  try {
    const allKeys = await keys(store);
    await Promise.all(allKeys.map((key) => del(key as string, store)));
    pending.clear();
    dirtyChats.clear();
  } catch (err) {
    logger.error('clearAll failed', err);
  }
}

/** Writes are throttled, so a close would otherwise lose up to a second of log. */
export function installFlushHandlers() {
  const flushNow = () => { void flush(); };

  window.addEventListener('beforeunload', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}
