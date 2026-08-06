import type { ApiChat, ApiPeer } from '../../../api/types';
import type { ExportedMessage } from './render';

import { callApi } from '../../../api/gramjs';
import { getPeerTitle } from '../../../global/helpers/peers';
import { describeMedia, textOf } from './collect';

const MAIN_THREAD_ID = -1;

/** Telegram's own page size for history; asking for more is not honoured. */
const PAGE = 100;

/**
 * Between pages.
 *
 * Exporting a long chat is a burst of identical requests, which is what rate limiting
 * exists to catch. A short pause costs a few seconds over a whole export and keeps a
 * FLOOD_WAIT from turning a finished export into a failed one.
 */
const PAUSE_MS = 120;

export type Progress = (fetched: number, total?: number) => void;

function pause(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Reads a chat's history from the server, newest first, and returns it oldest first.
 *
 * The client holds only what it has scrolled through, so exporting from state alone gives
 * whatever happened to be in memory — which is why the first version silently produced a
 * fraction of a chat. This pages the real history instead.
 *
 * `limit` is a stop, not a target: a chat with a hundred thousand messages should not
 * quietly turn into a half-hour export and a file nobody can open.
 */
export async function fetchHistory(
  chat: ApiChat,
  limit: number,
  onProgress?: Progress,
): Promise<ExportedMessage[]> {
  const collected: ExportedMessage[] = [];
  const senders = new Map<string, string>();
  const lang = ((key: string) => key) as any;

  let offsetId: number | undefined;
  let total: number | undefined;

  while (collected.length < limit) {
    const result = await callApi('fetchMessages', {
      chat,
      threadId: MAIN_THREAD_ID,
      offsetId,
      limit: Math.min(PAGE, limit - collected.length),
    });

    const messages = result?.messages;
    if (!messages?.length) break;

    if (total === undefined) total = result?.count;

    for (const peer of [...(result?.users || []), ...(result?.chats || [])] as ApiPeer[]) {
      if (peer?.id) senders.set(peer.id, getPeerTitle(lang, peer) || 'Unknown');
    }

    for (const message of messages) {
      // Enforced here, not only asked for: the limit is a guarantee about how long this
      // runs and how large the file gets, and a page that comes back longer than
      // requested must not be able to overrun it.
      if (collected.length >= limit) break;

      const text = textOf(message);
      const attachment = describeMedia(message.content);
      // An action-only message — someone joined, the title changed — has neither.
      if (!text && !attachment) continue;

      collected.push({
        id: message.id,
        sender: message.isOutgoing
          ? 'You'
          : (senders.get(String(message.senderId)) ?? 'Unknown'),
        date: (message.date || 0) * 1000,
        text,
        isOutgoing: Boolean(message.isOutgoing),
        attachment,
      });
    }

    onProgress?.(collected.length, total);

    // The oldest id of this page is where the next one starts.
    const oldest = messages[messages.length - 1]?.id;
    if (!oldest || oldest === offsetId) break;
    offsetId = oldest;

    // A short page means the history ran out.
    if (messages.length < PAGE) break;

    await pause(PAUSE_MS);
  }

  // Fetched newest first; a transcript reads the other way.
  return collected.reverse();
}
