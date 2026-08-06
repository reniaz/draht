import type { FetchedMessage } from './history';

import { ApiMediaFormat } from '../../../api/types';
import { getMessageMediaHash } from '../../../global/helpers/messageMedia';
import * as mediaLoader from '../../../util/mediaLoader';
import { modLogger } from '../../api/Logger';
import { type Budget, fits, planFor } from './media';

const logger = modLogger.scoped('ExportChat');

export type SavedFile = { name: string; bytes: Uint8Array };

/**
 * Downloads the photos and videos of an export, within a budget.
 *
 * Most of a chat's media is not in the client's cache — the cache holds what has been
 * looked at, and an export covers everything. So this asks the media loader for each one,
 * which downloads it if it has to and caches it exactly as viewing it would have.
 *
 * Failures are skipped rather than fatal. Media expires, a sender deletes a photo, a
 * download times out — none of that should cost the transcript, which is the part that
 * cannot be recovered later.
 *
 * Mutates the exported messages to point at the file written for them, so the renderer
 * needs to know nothing about how any of this happened.
 */
export async function downloadMedia(
  messages: FetchedMessage[],
  budget: Budget,
  onProgress?: (saved: number, considered: number) => void,
): Promise<SavedFile[]> {
  const files: SavedFile[] = [];
  let used = 0;
  let considered = 0;

  for (const { exported, raw } of messages) {
    const plan = planFor(raw.content, raw.id);
    if (!plan) continue;

    considered++;

    try {
      // `statefulContent` only matters for polls and web pages, neither of which is
      // media worth exporting.
      const hash = getMessageMediaHash(raw, {} as any, 'full')
        || getMessageMediaHash(raw, {} as any, 'inline');
      if (!hash) continue;

      const url = await mediaLoader.fetch(hash, ApiMediaFormat.BlobUrl);
      if (!url) continue;

      const blob = await (await fetch(url)).blob();
      if (!fits(blob.size, used, budget)) continue;

      files.push({ name: plan.name, bytes: new Uint8Array(await blob.arrayBuffer()) });
      used += blob.size;

      exported.mediaFile = `media/${plan.name}`;
      exported.mediaKind = plan.kind;

      onProgress?.(files.length, considered);
    } catch (err) {
      logger.error(`could not save media for message ${raw.id}`, err);
    }
  }

  return files;
}
