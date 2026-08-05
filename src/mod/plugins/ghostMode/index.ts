import { callApi } from '../../../api/gramjs';
import { setGlobal } from '../../../global';
import { selectCurrentMessageList } from '../../../global/selectors';

import {
  attachAction, attachGlobalChange, detachAction, detachGlobalChange,
} from '../../api/ActionBus';
import {
  blockApiMethod, interceptApiMethod, unblockAllForOwner, unblockApiMethod,
} from '../../api/ApiGuard';
import { applyMarks, recordRead, restoreMarks } from './localRead';
import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';

const logger = modLogger.scoped('GhostMode');
const OWNER = 'GhostMode';

/** Typing and recording indicators. */
const TYPING_METHODS = ['sendMessageAction'];

/**
 * Every method that tells Telegram you have read something.
 *
 * `markMessageListRead` is the one that matters most and is easy to miss: it is what runs
 * when you simply open a chat, from three separate call sites. Blocking only
 * `markMessagesRead` leaves read receipts working exactly as before.
 */
const READ_METHODS = [
  'markMessageListRead',
  'markMessagesRead',
  'readAllMentions',
  'readAllReactions',
];

/**
 * Requests Telegram treats as being active, which put you back online server-side.
 *
 * Rewriting the client's own "I am online" is not enough on its own: the server also marks
 * you online for ordinary account activity, and sending a message is not accompanied by
 * any status call the client could rewrite. You send a message, and you are online again
 * until something else happens to say otherwise.
 */
const ACTIVITY_METHODS = [
  'sendMessage',
  'editMessage',
  'forwardMessages',
  'sendReaction',
  'saveDraft',
  'sendPollVote',
];

/**
 * Follow-up assertions after activity, in milliseconds.
 *
 * A single assertion races the request it is answering. The guard sees a request as it is
 * *issued*; the server marks you online when it *processes* it, which for anything
 * carrying an upload is later. An assertion that lands first is simply overwritten, and
 * you are visible again with nothing further scheduled — so these continue past the point
 * where the send has certainly completed rather than betting on one delay being enough.
 *
 * The window cannot be closed entirely from here. Sending marks you online server-side,
 * and the only thing that undoes it is another request arriving afterwards; there is no
 * way to ask for a send that does not count as activity. What is controllable is how long
 * the flip lasts, which is why the first assertion goes out immediately (below) instead of
 * waiting: MTProto processes a connection's requests in order, so one issued right behind
 * the send is processed right behind it too.
 */
const REASSERT_DELAYS_MS = [400, 1500, 6000, 15_000];

/**
 * Floor between immediate assertions.
 *
 * Every sent message triggers one, and a fast exchange would otherwise turn into a stream
 * of status updates. A second is short enough to be invisible and long enough not to
 * become traffic of its own.
 */
const MIN_IMMEDIATE_GAP_MS = 1000;

/**
 * Bounds how long any activity the list above does not cover can leave you visible.
 *
 * Half the cadence Telegram clients use for their own online pings, so it is not more
 * traffic than a client normally produces — carrying the opposite meaning.
 */
const HEARTBEAT_MS = 30_000;

let heartbeat: number | undefined;
let reassertTimers: number[] = [];
let lastImmediateAt = 0;

function assertOffline() {
  // Goes through the interceptor below, which pins the argument to false regardless.
  void Promise.resolve(callApi('updateIsOnline', false)).catch(() => {
    // Offline is asserted again on the next heartbeat; a failed one is not worth surfacing.
  });
}

function clearReasserts() {
  for (const timer of reassertTimers) self.clearTimeout(timer);
  reassertTimers = [];
}

function scheduleReassert() {
  // Immediately, not only on a timer. Coalescing alone means a steady exchange keeps
  // restarting the follow-ups and none of them ever fires, so you stay visible for as
  // long as you keep typing — the opposite of what this is for.
  const now = Date.now();
  if (now - lastImmediateAt >= MIN_IMMEDIATE_GAP_MS) {
    lastImmediateAt = now;
    assertOffline();
  }

  // Restarted on each request, so a burst is followed up from its end.
  clearReasserts();

  reassertTimers = REASSERT_DELAYS_MS.map(
    (delay) => self.setTimeout(assertOffline, delay),
  );
}

function stopAsserting() {
  if (heartbeat) self.clearInterval(heartbeat);
  heartbeat = undefined;
  lastImmediateAt = 0;
  clearReasserts();
}

const settings = definePluginSettings({
  hideTyping: {
    type: OptionType.BOOLEAN,
    displayName: 'Hide typing',
    description: 'Never show others that you are typing or recording. You still see theirs.',
    default: true,
    onChange: () => apply(),
  },
  hideReadReceipts: {
    type: OptionType.BOOLEAN,
    displayName: 'Hide read receipts',
    description:
      'Do not tell anyone you read their message. Because the server is never told '
      + 'either, those chats can come back as unread on your other devices.',
    default: true,
    onChange: () => apply(),
  },
  markReadLocally: {
    type: OptionType.BOOLEAN,
    displayName: 'Still count them as read here',
    description:
      'Remember what you have read on this machine, so chats stop opening on their '
      + 'oldest unread message. Nothing is sent anywhere; only this client is told.',
    default: true,
    hidden() {
      // Meaningless on its own — there is nothing to remember locally if the read is
      // being reported normally.
      return !(this as any).store.hideReadReceipts;
    },
    onChange: () => apply(),
  },
  hideOnlineStatus: {
    type: OptionType.BOOLEAN,
    displayName: 'Stay offline (briefly breaks when you send)',
    description:
      'Report yourself as offline even while using Draht. Sending a message shows you '
      + 'online for a moment: Telegram marks you online at its end when it handles the '
      + 'message, and the only thing that can undo it is another request straight after. '
      + 'Also note this stops Telegram suppressing notifications on your phone, since it '
      + 'no longer knows you are here.',
    default: true,
    onChange: () => apply(),
  },
});

/** Records how far the user has read, without any of it reaching the server. */
const handleMarkListRead = ((global: any, actions: any, payload: any) => {
  const { maxId, tabId } = payload || {};
  const current = selectCurrentMessageList(global, tabId);
  if (!current || !maxId) return undefined;

  recordRead(current.chatId, current.threadId, maxId);

  return undefined;
}) as never;

const handleMarkMessagesRead = ((global: any, actions: any, payload: any) => {
  const { chatId, messageIds } = payload || {};
  if (!chatId || !messageIds?.length) return undefined;

  recordRead(chatId, -1, Math.max(...messageIds));

  return undefined;
}) as never;

let isReconciling = false;

/**
 * Re-applies the marks whenever the state moves.
 *
 * Applying them as the chat opens is not enough, and was the reason the first attempt did
 * nothing at all: `updateThreadReadState` returns the state untouched when the thread does
 * not exist yet, and on the first open of a chat it does not. The data arrives afterwards,
 * carrying the server's answer — that this is all unread — so the mark has to be re-applied
 * after each of those arrivals rather than once at the start.
 *
 * This converges rather than looping: applying a mark makes the state no longer behind it,
 * so the next pass finds nothing to do and no further update is dispatched.
 */
function reconcile(global: any) {
  if (isReconciling) return;

  const next = applyMarks(global);
  if (next === global) return;

  isReconciling = true;
  try {
    setGlobal(next);
  } finally {
    isReconciling = false;
  }
}

function attachLocalRead() {
  attachAction('markMessageListRead', handleMarkListRead);
  attachAction('markMessagesRead', handleMarkMessagesRead);
  attachGlobalChange(reconcile);
}

function detachLocalRead() {
  detachAction('markMessageListRead', handleMarkListRead);
  detachAction('markMessagesRead', handleMarkMessagesRead);
  detachGlobalChange(reconcile);
}

function apply() {
  try {
    for (const method of TYPING_METHODS) {
      if (settings.store.hideTyping) blockApiMethod(OWNER, method);
      else unblockApiMethod(OWNER, method);
    }

    for (const method of READ_METHODS) {
      if (settings.store.hideReadReceipts) blockApiMethod(OWNER, method);
      else unblockApiMethod(OWNER, method);
    }

    detachLocalRead();
    if (settings.store.hideReadReceipts && settings.store.markReadLocally) attachLocalRead();

    if (settings.store.hideOnlineStatus) {
      // Rewritten rather than blocked. Dropping the call only makes the client silent,
      // and Telegram then infers presence from account activity — which a client in
      // active use produces constantly. Appearing offline requires actively saying so, so
      // every "I am online" is turned into "I am offline".
      interceptApiMethod(OWNER, 'updateIsOnline', () => [false]);

      // Watch, do not change: the request goes out untouched and offline is re-asserted
      // once it has settled.
      for (const method of ACTIVITY_METHODS) {
        interceptApiMethod(OWNER, method, (args) => {
          scheduleReassert();
          return args;
        });
      }

      stopAsserting();
      assertOffline();
      heartbeat = self.setInterval(assertOffline, HEARTBEAT_MS);
    } else {
      stopAsserting();
      unblockApiMethod(OWNER, 'updateIsOnline');
      for (const method of ACTIVITY_METHODS) unblockApiMethod(OWNER, method);
    }
  } catch (err) {
    logger.error('failed to apply', err);
  }
}

export default definePlugin({
  name: 'GhostMode',
  description:
    'Stop your client telling others when you are typing, reading or online. '
    + 'Requests are changed before they are sent, not hidden afterwards.',
  authors: ['Draht'],
  enabledByDefault: false,

  settings,

  start() {
    restoreMarks();
    apply();
    logger.info('started');
  },

  stop() {
    stopAsserting();
    detachLocalRead();
    unblockAllForOwner(OWNER);
  },
});
