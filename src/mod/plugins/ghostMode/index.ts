import { callApi } from '../../../api/gramjs';

import {
  blockApiMethod, interceptApiMethod, unblockAllForOwner, unblockApiMethod,
} from '../../api/ApiGuard';
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
 * Re-assert at several points after activity, not once.
 *
 * A single assertion races the request it is answering. The guard sees a request as it is
 * *issued*; the server marks you online when it *processes* it, which for anything
 * carrying an upload can be seconds later. An assertion that lands first is simply
 * overwritten, and you are visible again with nothing further scheduled. Repeating past
 * the point where the send has certainly completed removes the race rather than betting
 * on a delay that is long enough.
 */
const REASSERT_DELAYS_MS = [1500, 6000, 15_000];

/**
 * Bounds how long any activity the list above does not cover can leave you visible.
 *
 * Half the cadence Telegram clients use for their own online pings, so it is not more
 * traffic than a client normally produces — carrying the opposite meaning.
 */
const HEARTBEAT_MS = 30_000;

let heartbeat: number | undefined;
let reassertTimers: number[] = [];

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
  // Restarted on each request, so a burst of activity is answered once — from the end of
  // the burst, which is the point that matters.
  clearReasserts();

  reassertTimers = REASSERT_DELAYS_MS.map(
    (delay) => self.setTimeout(assertOffline, delay),
  );
}

function stopAsserting() {
  if (heartbeat) self.clearInterval(heartbeat);
  heartbeat = undefined;
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
  hideOnlineStatus: {
    type: OptionType.BOOLEAN,
    displayName: 'Stay offline',
    description:
      'Report yourself as offline even while using Draht. Note this also stops Telegram '
      + 'suppressing notifications on your phone, since it no longer knows you are here.',
    default: true,
    onChange: () => apply(),
  },
});

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
    apply();
    logger.info('started');
  },

  stop() {
    stopAsserting();
    unblockAllForOwner(OWNER);
  },
});
