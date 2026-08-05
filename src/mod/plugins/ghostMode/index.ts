import { blockApiMethod, unblockAllForOwner, unblockApiMethod } from '../../api/ApiGuard';
import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';

const logger = modLogger.scoped('GhostMode');
const OWNER = 'GhostMode';

/**
 * Each switch maps to one outgoing API method.
 *
 * Blocking happens at `callApi`, so the request never leaves the client — this is not a
 * UI-level fake. What it cannot do is retract information Telegram already has, or stop
 * other clients signed into the same account from reporting on your behalf.
 */
const SWITCHES = {
  hideTyping: 'sendMessageAction',
  hideReadReceipts: 'markMessagesRead',
  hideOnlineStatus: 'updateIsOnline',
} as const;

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
      'Do not tell anyone you read their message. Note that because the server is never '
      + 'told either, those chats can come back as unread on your other devices.',
    default: true,
    onChange: () => apply(),
  },
  hideOnlineStatus: {
    type: OptionType.BOOLEAN,
    displayName: 'Stay offline',
    description: 'Never report yourself as online. You will appear last-seen a while ago.',
    default: true,
    onChange: () => apply(),
  },
});

function apply() {
  try {
    for (const [key, method] of Object.entries(SWITCHES)) {
      if (settings.store[key as keyof typeof SWITCHES]) {
        blockApiMethod(OWNER, method);
      } else {
        unblockApiMethod(OWNER, method);
      }
    }
  } catch (err) {
    logger.error('failed to apply', err);
  }
}

export default definePlugin({
  name: 'GhostMode',
  description:
    'Stop your client telling others when you are typing, reading or online. '
    + 'Requests are dropped before they are sent, not hidden afterwards.',
  authors: ['Draht'],
  enabledByDefault: false,

  settings,

  start() {
    apply();
    logger.info('started');
  },

  stop() {
    // Clears every block this plugin owns, so nothing is left suppressed after disabling.
    unblockAllForOwner(OWNER);
  },
});
