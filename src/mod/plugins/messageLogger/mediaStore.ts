import { createStore, del, entries, get, keys, set } from 'idb-keyval';

import type { ApiMessage } from '../../../api/types';

import { MEDIA_CACHE_NAME } from '../../../config';
import { getAllMessageMediaHashes } from '../../../global/helpers/messageMedia';
import * as cacheApi from '../../../util/cacheApi';
import { modLogger } from '../../api/Logger';

const logger = modLogger.scoped('MessageLogger/media');

/**
 * Keeps the media of deleted messages.
 *
 * Text survives on its own, but media does not: the blobs live in telegram-tt's own Cache
 * API (`tt-media`), which expires anything untouched for five days, and the server copy
 * is gone once the sender deletes it. So a logged message would eventually render with
 * broken media.
 *
 * The approach avoids touching the rendering path entirely. On deletion the blob is
 * copied *out* of telegram-tt's cache into our own store; on startup it is written back
 * *into* that cache. Upstream then loads media exactly as it always does, with no
 * awareness that anything happened — far less fragile than intercepting the media loader.
 *
 * The obvious limitation: media that was never downloaded in the first place cannot be
 * saved. Nothing here can recover a photo you never looked at.
 */
const store = createStore('draht-media', 'store');

export type MediaLimits = {
  /** Skip anything larger. */
  maxFileBytes: number;
  /** Total across everything kept. */
  maxTotalBytes: number;
};

let limits: MediaLimits = {
  // Comfortably covers photos, stickers, voice notes, GIFs and short clips — the media
  // people actually miss when it disappears. Videos usually exceed it, and keeping those
  // by default would quietly consume gigabytes.
  maxFileBytes: 5 * 1024 * 1024,
  // ~200 MB is a few thousand photos: generous in practice, and still a number you would
  // not be alarmed to find on disk.
  maxTotalBytes: 200 * 1024 * 1024,
};

let isEnabled = true;

export function setMediaPersistence(enabled: boolean) {
  isEnabled = enabled;
}

export function setMediaLimits(next: Partial<MediaLimits>) {
  limits = { ...limits, ...next };
}

type StoredMedia = { blob: Blob; size: number; savedAt: number };

async function totalBytes() {
  const all = await entries<string, StoredMedia>(store);
  return all.reduce((sum, [, value]) => sum + (value?.size ?? 0), 0);
}

/** Drops the oldest entries until the total fits. */
async function evictTo(target: number) {
  const all = await entries<string, StoredMedia>(store);
  let total = all.reduce((sum, [, value]) => sum + (value?.size ?? 0), 0);
  if (total <= target) return;

  const oldestFirst = all.sort((a, b) => (a[1]?.savedAt ?? 0) - (b[1]?.savedAt ?? 0));

  for (const [key, value] of oldestFirst) {
    if (total <= target) break;
    await del(key, store);
    total -= value?.size ?? 0;
  }
}

/**
 * Copies whatever of a message's media is already cached.
 *
 * Called as the message is being protected, so it runs while the blobs are still in
 * telegram-tt's cache — `deleteChatMessages` would otherwise `unload()` them.
 */
export async function keepMediaFor(message: ApiMessage) {
  if (!isEnabled) return;

  try {
    // `statefulContent` only matters for polls and web pages, neither of which carries a
    // media blob, so an empty object is safe here.
    const hashes = getAllMessageMediaHashes(message, {} as any);
    if (!hashes?.length) return;

    for (const hash of hashes) {
      if (await get(hash, store)) continue;

      const blob = await cacheApi.fetch(MEDIA_CACHE_NAME, hash, cacheApi.Type.Blob);
      if (!(blob instanceof Blob)) continue;
      if (blob.size > limits.maxFileBytes) continue;

      await evictTo(Math.max(0, limits.maxTotalBytes - blob.size));
      await set(hash, { blob, size: blob.size, savedAt: Date.now() } satisfies StoredMedia, store);
    }
  } catch (err) {
    // Losing media is not worth breaking the deletion interception over.
    logger.error('could not keep media', err);
  }
}

/**
 * Writes saved blobs back into telegram-tt's media cache.
 *
 * Run once at startup, before anything renders, so upstream's own loader finds them.
 */
export async function restoreMedia() {
  if (!isEnabled) return;

  try {
    const all = await entries<string, StoredMedia>(store);
    if (!all.length) return;

    for (const [hash, value] of all) {
      if (!value?.blob) continue;
      // Skip anything already present, so we do not churn the cache on every launch.
      const existing = await cacheApi.fetch(MEDIA_CACHE_NAME, hash, cacheApi.Type.Blob);
      if (existing) continue;

      await cacheApi.save(MEDIA_CACHE_NAME, hash, value.blob);
    }

    logger.info(`restored ${all.length} media item(s)`);
  } catch (err) {
    logger.error('could not restore media', err);
  }
}

/** Drops the media for messages being purged from the log. */
export async function forgetMediaFor(messages: ApiMessage[]) {
  try {
    for (const message of messages) {
      const hashes = getAllMessageMediaHashes(message, {} as any);
      if (!hashes) continue;
      for (const hash of hashes) await del(hash, store);
    }
  } catch (err) {
    logger.error('could not forget media', err);
  }
}

export async function clearAllMedia() {
  try {
    const all = await keys(store);
    await Promise.all(all.map((key) => del(key as string, store)));
  } catch (err) {
    logger.error('could not clear media', err);
  }
}

export async function mediaUsage() {
  try {
    const all = await entries<string, StoredMedia>(store);
    return { count: all.length, bytes: await totalBytes() };
  } catch {
    return { count: 0, bytes: 0 };
  }
}
