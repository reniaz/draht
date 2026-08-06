const STORAGE_KEY = 'draht-local-mute';

/**
 * People whose messages are hidden, and where.
 *
 * A mute is per chat rather than global by default: the person who makes one group
 * unbearable is often someone you speak to perfectly happily elsewhere. A global mute is
 * expressed as the chat id `*`, so both live in one set and one lookup answers both.
 */
let muted = new Set<string>();
const listeners = new Set<NoneToVoidFunction>();

export const EVERYWHERE = '*';

export function keyOf(chatId: string, senderId: string) {
  return `${chatId}:${senderId}`;
}

export function isMuted(chatId: string, senderId: string): boolean {
  return muted.has(keyOf(EVERYWHERE, senderId)) || muted.has(keyOf(chatId, senderId));
}

/** Distinguishes the two, so the menu can offer the one that is not already in force. */
export function muteScope(chatId: string, senderId: string): 'everywhere' | 'chat' | undefined {
  if (muted.has(keyOf(EVERYWHERE, senderId))) return 'everywhere';
  if (muted.has(keyOf(chatId, senderId))) return 'chat';

  return undefined;
}

export function getMuted(): string[] {
  return [...muted];
}

export function mute(chatId: string, senderId: string) {
  muted.add(keyOf(chatId, senderId));
  changed();
}

export function unmute(chatId: string, senderId: string) {
  muted.delete(keyOf(chatId, senderId));

  // Unmuting inside a chat should also lift a mute that was applied everywhere, or the
  // menu says the person is unmuted while their messages stay hidden.
  if (chatId !== EVERYWHERE) muted.delete(keyOf(EVERYWHERE, senderId));

  changed();
}

export function clearMuted() {
  muted = new Set();
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...muted]));
  } catch {
    // Losing the list means messages reappear, which is visible and recoverable.
  }
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) muted = new Set(parsed.filter((k) => typeof k === 'string'));
  } catch {
    // A corrupt list starts empty rather than breaking startup.
  }
}
