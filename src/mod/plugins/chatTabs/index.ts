import type { ThreadId } from '../../../types';

import { getActions } from '../../../global';

import { attachAction, detachAction } from '../../api/ActionBus';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePlugin } from '../../api/types';
import {
  addTab, clearTabs, getTabs, restore, visitTab,
} from './store';

// Imported here as well as from the component. The component lives inside MiddleColumn,
// which is only loaded once you are past the login screen — so on a cold start the rules
// that reserve the bar's space would not exist yet, and the layout would jump when the
// chunk arrived. Plugins load at startup, so this puts them in from the beginning.
import './TabBar.scss';

const BODY_CLASS = 'draht-has-tabs';

/**
 * Every way of reaching a chat — the chat list, a search result, a link, a forum topic —
 * ends up in `processOpenChatOrThread`, so one handler covers all of them. Attaching to
 * `openChat` and `openThread` separately would miss whatever calls the shared one
 * directly, and would fire twice for the paths that go through both.
 */
const handleOpenChat = ((global: unknown, actions: unknown, payload: any) => {
  const { chatId, threadId, isOwnProfile } = payload || {};

  // "My Profile" opens your own chat — which is Saved Messages — with a profile panel
  // beside it. A tab can only record the chat, so returning to it later would drop you in
  // Saved Messages with no profile. Better no tab than a tab that lies.
  if (!chatId || isOwnProfile) return undefined;

  visitTab({ chatId, threadId: threadId ?? -1 });

  return undefined;
}) as never;

/**
 * Handles upstream's "open in new tab".
 *
 * @returns true so upstream skips its `window.open`.
 */
function handleOpenInNewTab(chatId: string, threadId: ThreadId): boolean {
  addTab({ chatId, threadId });

  // Opening a tab should also go to it — "open in new tab" that leaves you where you were
  // would need a second click every time. `openThread` rather than `openChat`, because a
  // tab can be a forum topic and `openChat` has nowhere to put the thread.
  getActions().openThread({ chatId, threadId });

  return true;
}

export default definePlugin({
  name: 'ChatTabs',
  description: 'Open chats as tabs inside the client instead of new browser windows.',
  authors: ['Draht'],
  enabledByDefault: true,
  // Toggled from Draht Settings -> General rather than the plugin list: it is a property
  // of how the client behaves, not something most people go looking for under Plugins.
  hidden: true,

  start() {
    addSeam('openChatInNewTab', handleOpenInNewTab);
    attachAction('processOpenChatOrThread', handleOpenChat);
    restore();

    // The bar is rendered unconditionally by MiddleColumn; the class is what gives it its
    // height and reserves the space, so turning the plugin off restores the stock layout
    // without the component knowing anything about it.
    document.body.classList.add(BODY_CLASS);
  },

  stop() {
    removeSeam('openChatInNewTab', handleOpenInNewTab);
    detachAction('processOpenChatOrThread', handleOpenChat);
    document.body.classList.remove(BODY_CLASS);
    clearTabs();
  },
});

export { getTabs };
