import type { GlobalState } from '../../../global/types';

import { getUserFullName } from '../../../global/helpers/users';
import { modLogger } from '../../api/Logger';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import NameHistoryRow from './NameHistoryRow';
import { clearHistory, recordChange, restore } from './store';

const logger = modLogger.scoped('NameHistory');

const settings = definePluginSettings({
  showOwnProfile: {
    type: OptionType.BOOLEAN,
    displayName: 'Show it on your own profile too',
    description:
      'Off by default. You already know what you used to be called, and it is one more '
      + 'identifying line on the profile you are most likely to have on screen.',
    default: false,
  },
});

function mainUsername(peer: any): string | undefined {
  return peer?.usernames?.find((u: any) => u.isActive)?.username || peer?.username;
}

/**
 * Compares the incoming peer against the one already in state.
 *
 * The update carries the new values; the old ones are still in the global state at the
 * moment the handler runs, and nowhere else afterwards. So this is the only point at which
 * the previous name is knowable at all.
 */
function compare(global: GlobalState, id: string, incoming: any) {
  const existing = (global.users?.byId as any)?.[id] || (global.chats?.byId as any)?.[id];
  if (!existing || !incoming) return;

  const wasName = getUserFullName(existing) || existing.title;
  const nowName = getUserFullName(incoming) || incoming.title;
  if (wasName && nowName && wasName !== nowName) {
    recordChange(id, 'names', wasName);
  }

  const wasHandle = mainUsername(existing);
  const nowHandle = mainUsername(incoming);
  if (wasHandle && nowHandle && wasHandle !== nowHandle) {
    recordChange(id, 'usernames', wasHandle);
  }
}

const onUser = (global: GlobalState, update: any) => {
  try {
    if (update?.id && update?.user) compare(global, update.id, update.user);
  } catch (err) {
    logger.error('could not compare a user', err);
  }

  return undefined;
};

const onChat = (global: GlobalState, update: any) => {
  try {
    if (update?.id && update?.chat) compare(global, update.id, update.chat);
  } catch (err) {
    logger.error('could not compare a chat', err);
  }

  return undefined;
};

const profileRow = (peerId: string) => (
  <NameHistoryRow peerId={peerId} showOwn={Boolean(settings.store.showOwnProfile)} />
);

export default definePlugin({
  name: 'NameHistory',
  description:
    'Remember what people used to be called. A handle that changed last week is the '
    + 'cheapest impersonation signal there is, and Telegram shows nothing.',
  authors: ['Draht'],
  enabledByDefault: true,

  settings,

  apiUpdates: {
    updateUser: onUser,
    updateChat: onChat,
  },

  start() {
    restore();
    addSeam('profileExtra', profileRow);
  },

  stop() {
    removeSeam('profileExtra', profileRow);
  },
});

export { clearHistory };
