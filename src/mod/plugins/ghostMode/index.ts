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
    } else {
      unblockApiMethod(OWNER, 'updateIsOnline');
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
    unblockAllForOwner(OWNER);
  },
});
