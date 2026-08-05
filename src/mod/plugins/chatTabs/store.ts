import type { ThreadId } from '../../../types';

export type ChatTab = {
  chatId: string;
  threadId: ThreadId;
};

const STORAGE_KEY = 'draht-chat-tabs';

let tabs: ChatTab[] = [];
const listeners = new Set<NoneToVoidFunction>();

export function getTabs(): ChatTab[] {
  return tabs;
}

export function subscribe(listener: NoneToVoidFunction) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  // A tab bar that only redraws when the global state happens to change would sit stale
  // after an open or close, so the store drives its own updates.
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the others being told.
    }
  }

  save();
}

export function isSameTab(a: ChatTab, b: ChatTab) {
  return a.chatId === b.chatId && String(a.threadId) === String(b.threadId);
}

/**
 * @returns true when the tab is new, false when it was already open.
 */
export function addTab(tab: ChatTab): boolean {
  const exists = tabs.some((open) => isSameTab(open, tab));
  if (exists) return false;

  tabs = [...tabs, tab];
  notify();
  return true;
}

export function removeTab(tab: ChatTab) {
  tabs = tabs.filter((open) => !isSameTab(open, tab));
  notify();
}

export function clearTabs() {
  tabs = [];
  notify();
}

/**
 * The tab to fall back to when `tab` is closed while it is the one being viewed.
 *
 * Its neighbour to the left, or to the right when it was first — the same thing browsers
 * do, and the thing that does not leave you staring at an empty middle column.
 */
export function neighbourOf(tab: ChatTab): ChatTab | undefined {
  const index = tabs.findIndex((open) => isSameTab(open, tab));
  if (index === -1) return undefined;

  return tabs[index - 1] ?? tabs[index + 1];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Storage being unavailable costs the user their tab list on restart, which is not
    // worth failing anything over.
  }
}

/**
 * Tabs survive a restart, because a desktop client that forgets what you had open is
 * annoying in a way a browser is not — you cannot reopen a closed tab here.
 */
export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    tabs = parsed
      .filter((tab) => tab && typeof tab.chatId === 'string')
      .map((tab) => ({ chatId: tab.chatId, threadId: tab.threadId }));

    notify();
  } catch {
    // A corrupt list is not worth a broken start; begin with none.
  }
}
