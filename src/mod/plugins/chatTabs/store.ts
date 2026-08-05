import type { ThreadId } from '../../../types';

export type ChatTab = {
  chatId: string;
  threadId: ThreadId;
};

const STORAGE_KEY = 'draht-chat-tabs';

let tabs: ChatTab[] = [];
let activeKey: string | undefined;
const listeners = new Set<NoneToVoidFunction>();

export function keyOf(tab: ChatTab) {
  return `${tab.chatId}-${tab.threadId}`;
}

export function getTabs(): ChatTab[] {
  return tabs;
}

export function subscribe(listener: NoneToVoidFunction) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let isNotifyScheduled = false;

/**
 * Deferred out of the current task on purpose.
 *
 * `visitTab` runs inside an action handler, and subscribers here are Teact state setters.
 * Setting state from inside a reducer re-renders the middle column in the middle of a
 * global update — which lands on the message list while it is restoring scroll position,
 * and leaves new messages sitting below the fold until something forces it to recompute.
 * The same goes for the localStorage write: never synchronously inside a reducer.
 *
 * Coalesced, because several opens can land in one turn and the bar only needs the last.
 */
function notify() {
  if (isNotifyScheduled) return;
  isNotifyScheduled = true;

  Promise.resolve().then(() => {
    isNotifyScheduled = false;

    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One bad subscriber must not stop the others being told.
      }
    }

    save();
  });
}

export function isSameTab(a: ChatTab, b: ChatTab) {
  return a.chatId === b.chatId && String(a.threadId) === String(b.threadId);
}

function indexOf(tab: ChatTab) {
  return tabs.findIndex((open) => isSameTab(open, tab));
}

/**
 * Opening a chat the ordinary way — from the chat list, a search result, a link.
 *
 * Replaces the tab you were on rather than adding one, which is what a browser does when
 * you follow a link: clicking through a dozen chats should not leave a dozen tabs behind.
 * "Open in new tab" is the gesture that adds.
 *
 * With no tabs yet, the chat you are looking at becomes the first one — the bar always
 * shows where you are, instead of appearing only once you have used a context menu.
 */
export function visitTab(tab: ChatTab) {
  const existing = indexOf(tab);

  if (existing !== -1) {
    activeKey = keyOf(tabs[existing]);
    notify();
    return;
  }

  const replacing = tabs.findIndex((open) => keyOf(open) === activeKey);

  tabs = replacing === -1
    ? [...tabs, tab]
    : tabs.map((open, index) => (index === replacing ? tab : open));

  activeKey = keyOf(tab);
  notify();
}

/**
 * "Open in new tab": always adds, and makes the new tab the one being replaced next.
 *
 * @returns true when the tab is new, false when that chat was already open.
 */
export function addTab(tab: ChatTab): boolean {
  const exists = indexOf(tab) !== -1;

  if (!exists) tabs = [...tabs, tab];
  activeKey = keyOf(tab);
  notify();

  return !exists;
}

export function removeTab(tab: ChatTab) {
  if (activeKey === keyOf(tab)) activeKey = undefined;

  tabs = tabs.filter((open) => !isSameTab(open, tab));
  notify();
}

export function clearTabs() {
  tabs = [];
  activeKey = undefined;
  notify();
}

/**
 * The tab to fall back to when `tab` is closed while it is the one being viewed.
 *
 * Its neighbour to the left, or to the right when it was first — the same thing browsers
 * do, and the thing that does not leave you staring at an empty middle column.
 */
export function neighbourOf(tab: ChatTab): ChatTab | undefined {
  const index = indexOf(tab);
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
