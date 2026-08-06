export type Bookmark = {
  chatId: string;
  messageId: number;
  /** Copied at save time: the message may later be deleted, edited, or fall out of cache. */
  text: string;
  sender: string;
  chatTitle: string;
  date: number;
  savedAt: number;
  note?: string;
};

const STORAGE_KEY = 'draht-bookmarks';

let bookmarks: Bookmark[] = [];
const listeners = new Set<NoneToVoidFunction>();

export function keyOf(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}

export function getBookmarks(): Bookmark[] {
  return bookmarks;
}

export function isBookmarked(chatId: string, messageId: number): boolean {
  return bookmarks.some((b) => b.chatId === chatId && b.messageId === messageId);
}

/**
 * Saves a copy of the message, not a pointer to it.
 *
 * A bookmark that only remembered where the message was would be worth nothing the moment
 * the sender deleted or edited it — which is precisely when you would want to look. The
 * text is small; keeping it is the difference between a bookmark and a dead link.
 */
export function addBookmark(bookmark: Bookmark) {
  if (isBookmarked(bookmark.chatId, bookmark.messageId)) return;

  bookmarks = [bookmark, ...bookmarks];
  changed();
}

export function removeBookmark(chatId: string, messageId: number) {
  bookmarks = bookmarks.filter((b) => !(b.chatId === chatId && b.messageId === messageId));
  changed();
}

export function clearBookmarks() {
  bookmarks = [];
  changed();
}

export function subscribe(listener: NoneToVoidFunction) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function changed() {
  save();

  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the others being told.
    }
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Nothing here is recoverable from elsewhere, but failing the save must not fail the
    // click that caused it.
  }
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    bookmarks = parsed.filter((b) => b && typeof b.chatId === 'string' && typeof b.messageId === 'number');
  } catch {
    // A corrupt file starts empty rather than breaking startup.
  }
}
