import type { GlobalState } from '../../../global/types';
import type { ThreadId } from '../../../types';

// Imported from the modules themselves: neither is re-exported from the barrels.
import { replaceThreadReadStateParam } from '../../../global/reducers/threads';
import { selectThreadReadState } from '../../../global/selectors/threads';

const STORAGE_KEY = 'draht-local-read';

/**
 * How far you have read in each thread, as far as only this client is concerned.
 *
 * Hiding read receipts means never telling the server you read anything, so the server
 * keeps reporting the chat as unread — and every chat sync overwrites the local read state
 * with that answer. The visible result is a chat that opens on its oldest unread message
 * and will not scroll to the newest, forever.
 *
 * Keeping the mark here and re-applying it makes the client behave as if the read had gone
 * through, without any of it leaving the machine. It is the same shape as the message log:
 * a local record that is re-applied when upstream state contradicts it.
 */
let marks: Record<string, number> = {};

function keyOf(chatId: string, threadId: ThreadId) {
  return `${chatId}:${threadId}`;
}

export function getMarks() {
  return marks;
}

export function clearMarks() {
  marks = {};
  save();
}

/** @returns true when this is further than anything recorded before. */
export function recordRead(chatId: string, threadId: ThreadId, maxId: number): boolean {
  if (!maxId) return false;

  const key = keyOf(chatId, threadId);
  // Only ever moves forward. A read of an older message — scrolling back, opening from a
  // search result — must not undo what has already been read.
  if ((marks[key] ?? 0) >= maxId) return false;

  marks[key] = maxId;
  save();

  return true;
}

/**
 * Re-applies every mark that the current state is behind on.
 *
 * Returns the same object when nothing needed changing, so callers can hand it straight
 * back to the action bus without forcing a state update on every open.
 */
export function applyMarks<T extends GlobalState>(global: T): T {
  for (const [key, maxId] of Object.entries(marks)) {
    const separator = key.lastIndexOf(':');
    const chatId = key.slice(0, separator);
    const threadId = key.slice(separator + 1);

    const readState = selectThreadReadState(global, chatId, threadId);
    if (!readState) continue;

    if ((readState.lastReadInboxMessageId ?? 0) >= maxId) continue;

    global = replaceThreadReadStateParam(global, chatId, threadId, 'lastReadInboxMessageId', maxId);
    global = replaceThreadReadStateParam(global, chatId, threadId, 'unreadCount', 0);
  }

  return global;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Losing the marks costs a stale unread badge, not correctness.
  }
}

export function restoreMarks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') marks = parsed;
  } catch {
    // A corrupt file starts empty rather than breaking startup.
  }
}
