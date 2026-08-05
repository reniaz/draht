import { getActions } from '../../../global';

import { attachAction, detachAction } from '../../api/ActionBus';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePlugin } from '../../api/types';

/**
 * How long to wait before jumping.
 *
 * The chat's messages are not there when it opens — the list is still being built — so the
 * jump has to happen once there is something to jump to. This is the same wait the client
 * already takes to render a chat, so it reads as the chat simply opening at the bottom
 * rather than as a scroll.
 */
const JUMP_DELAY_MS = 120;

let timer: number | undefined;

/**
 * Opens every chat at its newest message.
 *
 * Upstream anchors on the first unread message, which is right for a phone you check twice
 * a day and wrong for a client that is always open: a chat you have read stays anchored to
 * an old message because hiding read receipts means the server still believes it is
 * unread. This side-steps that entirely rather than trying to convince the client it has
 * read things — and jumping to the newest message marks them read locally anyway, for as
 * long as the session lasts.
 */
const handleOpen = ((global: unknown, actions: unknown, payload: any) => {
  const { chatId } = payload || {};
  if (!chatId) return undefined;

  if (timer) self.clearTimeout(timer);

  timer = self.setTimeout(() => {
    timer = undefined;
    getActions().scrollMessageListToBottom();
  }, JUMP_DELAY_MS);

  return undefined;
}) as never;

/**
 * Keeps the list following incoming messages.
 *
 * Opening at the newest message is only half of it. Upstream scrolls an arriving message
 * to the *first unread* rather than the bottom whenever the window is in the background —
 * right when the unread marker is accurate, wrong once read receipts are hidden and it
 * never clears. The visible result is a chat you had read parking itself on an old message
 * whenever something arrives while you are looking elsewhere, and staying there until you
 * press "jump to latest".
 */
const alwaysScrollToBottom = () => true;

export default definePlugin({
  name: 'OpenAtNewest',
  description:
    'Open every chat at its newest message, and keep following new ones, instead of '
    + 'anchoring to the oldest unread message.',
  authors: ['Draht'],
  enabledByDefault: true,
  // Client behaviour, so it lives under Draht Settings -> General.
  hidden: true,

  start() {
    attachAction('processOpenChatOrThread', handleOpen);
    addSeam('forceScrollToBottom', alwaysScrollToBottom);
  },

  stop() {
    if (timer) self.clearTimeout(timer);
    timer = undefined;
    detachAction('processOpenChatOrThread', handleOpen);
    removeSeam('forceScrollToBottom', alwaysScrollToBottom);
  },
});
