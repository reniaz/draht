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

/** Re-assert after a burst of activity has settled rather than once per request. */
const REASSERT_DELAY_MS = 1500;

/**
 * Bounds how long activity can leave you visible, for anything not in the list above.
 *
 * Matches the cadence Telegram clients use for their own online pings, so this is the same
 * amount of traffic the client would produce anyway — with the opposite meaning.
 */
const HEARTBEAT_MS = 60_000;

let heartbeat: number | undefined;
let reassertTimer: number | undefined;

function assertOffline() {
  // Goes through the interceptor below, which pins the argument to false regardless.
  void Promise.resolve(callApi('updateIsOnline', false)).catch(() => {
    // Offline is asserted again on the next heartbeat; a failed one is not worth surfacing.
  });
}

function scheduleReassert() {
  if (reassertTimer) self.clearTimeout(reassertTimer);

  reassertTimer = self.setTimeout(() => {
    reassertTimer = undefined;
    assertOffline();
  }, REASSERT_DELAY_MS);
}

function stopAsserting() {
  if (heartbeat) self.clearInterval(heartbeat);
  if (reassertTimer) self.clearTimeout(reassertTimer);
  heartbeat = undefined;
  reassertTimer = undefined;
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
