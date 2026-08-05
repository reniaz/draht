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
/**
 * How many threads to remember.
 *
 * An entry is a key and a number — around 30 bytes — so this is roughly 15 KB, against a
 * localStorage budget of several megabytes. The cap exists because the set would otherwise
 * only ever grow: every chat opened and every forum topic visited adds one, for as long as
 * the client is installed.
 *
 * Eviction is least-recently-read, which is the right thing to lose: a chat you have not
 * opened in five hundred chats' time re-reads from the server's mark, and the worst case
 * is one stale unread badge on a conversation you had forgotten about.
 */
const MAX_MARKS = 500;

/** Longest a mark can sit unsaved. Reads fire on scroll; the writes should not. */
const SAVE_THROTTLE_MS = 2000;

let marks: Record<string, number> = {};
let saveTimer: number | undefined;

function keyOf(chatId: string, threadId: ThreadId) {
  return `${chatId}:${threadId}`;
}

export function getMarks() {
  return marks;
}

export function clearMarks() {
  marks = {};

  // Written straight away rather than through the throttle: clearing is not on any hot
  // path, and leaving a pending timer holding the throttle open would swallow the next
  // few writes.
  if (saveTimer) self.clearTimeout(saveTimer);
  saveNow();
}

/** @returns true when this is further than anything recorded before. */
export function recordRead(chatId: string, threadId: ThreadId, maxId: number): boolean {
  if (!maxId) return false;

  const key = keyOf(chatId, threadId);
  // Only ever moves forward. A read of an older message — scrolling back, opening from a
  // search result — must not undo what has already been read.
  if ((marks[key] ?? 0) >= maxId) return false;

  // Re-inserted rather than assigned, so the object's key order is least-recently-read
  // first — which is what makes the eviction below correct without storing timestamps.
  delete marks[key];
  marks[key] = maxId;

  const keys = Object.keys(marks);
  if (keys.length > MAX_MARKS) {
    for (const stale of keys.slice(0, keys.length - MAX_MARKS)) delete marks[stale];
  }

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

function saveNow() {
  saveTimer = undefined;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Losing the marks costs a stale unread badge, not correctness.
  }
}

/**
 * Throttled, because `markMessageListRead` fires as you scroll and `localStorage.setItem`
 * is synchronous — writing on every one would put a serialise-and-write on the scroll
 * path. The flush on hide covers closing the window before the timer runs.
 */
function save() {
  if (saveTimer) return;

  saveTimer = self.setTimeout(saveNow, SAVE_THROTTLE_MS);
}

let isFlushBound = false;

function bindFlush() {
  if (isFlushBound) return;
  isFlushBound = true;

  // `visibilitychange` rather than `beforeunload`: the latter is unreliable, and this also
  // catches the window merely being hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) {
      self.clearTimeout(saveTimer);
      saveNow();
    }
  });
}

export function restoreMarks() {
  bindFlush();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') marks = parsed;
  } catch {
    // A corrupt file starts empty rather than breaking startup.
  }
}
