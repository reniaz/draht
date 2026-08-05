import type { ApiMessage } from '../../../api/types';

import { getActions, getGlobal, setGlobal } from '../../../global';
import { updateChatMessage } from '../../../global/reducers/messages';
import { selectChatMessages } from '../../../global/selectors/messages';
import { modLogger } from '../../api/Logger';
import { evict, evictChat } from '../../api/Storage';
import { markForPurge } from './index';

const logger = modLogger.scoped('MessageLogger');

/**
 * Modals register their own open functions here.
 *
 * The alternative — the menu importing the modal directly — is a cycle, since the modal
 * needs these actions too.
 */
let historyOpener: ((message: ApiMessage) => void) | undefined;
let logViewerOpener: ((chatId: string) => void) | undefined;

export function setHistoryOpener(fn: (message: ApiMessage) => void) {
  historyOpener = fn;
}

export function openHistory(message: ApiMessage) {
  historyOpener?.(message);
}

export function setLogViewerOpener(fn: (chatId: string) => void) {
  logViewerOpener = fn;
}

export function openLogViewer(chatId: string) {
  logViewerOpener?.(chatId);
}

/**
 * Runs a real deletion for messages the mod is protecting.
 *
 * Upstream's `deleteMessages` is imported lazily on purpose: `src/mod/init` is imported
 * from `src/index.tsx` *before* `./global/init`, so a static import here would drag the
 * whole actions graph into the boot path ahead of upstream's own initialisation. At click
 * time there is no such constraint.
 */
async function runUpstreamDelete(chatId: string, ids: number[]) {
  const { deleteMessages } = await import('../../../global/actions/apiUpdaters/messages');

  // The bypass is consumed by the protection seam, so this re-enters the exact same
  // delete path a server-side deletion takes — no parallel "really delete" logic.
  markForPurge(chatId, ids);
  deleteMessages(getGlobal(), chatId, ids, getActions() as any);

  // A purge has to clear the durable copy too, or the message reappears on restart.
  await evict(chatId, ids);
}

/** Per-message: purge a logged deletion, or just drop the edit history. */
export function purgeMessage(message: ApiMessage) {
  const chatId = message.chatId;

  try {
    if (message.isModDeleted) {
      void runUpstreamDelete(chatId, [message.id]);
      return;
    }

    setGlobal(updateChatMessage(getGlobal(), chatId, message.id, {
      modEditHistory: undefined,
      modFirstEditDate: undefined,
    }));
  } catch (err) {
    logger.error('purge failed', err);
  }
}

/** Per-chat: purge every logged deletion and clear every edit history. */
export function clearChatLog(chatId: string) {
  try {
    let global = getGlobal();
    const byId = selectChatMessages(global, chatId);
    if (!byId) return;

    const messages = Object.values(byId);
    const deletedIds = messages.filter((m) => m.isModDeleted).map((m) => m.id);

    for (const message of messages) {
      if (!message.isModDeleted && message.modEditHistory?.length) {
        global = updateChatMessage(global, chatId, message.id, {
          modEditHistory: undefined,
          modFirstEditDate: undefined,
        });
      }
    }

    setGlobal(global);

    if (deletedIds.length) void runUpstreamDelete(chatId, deletedIds);

    // Drops the whole chat record, including anything logged in an earlier session that
    // is no longer in memory and so absent from `deletedIds`.
    void evictChat(chatId);
  } catch (err) {
    logger.error('clearChatLog failed', err);
  }
}

export function hasChatLog(chatId: string) {
  const byId = selectChatMessages(getGlobal(), chatId);
  if (!byId) return false;

  return Object.values(byId).some((m) => m.isModDeleted || m.modEditHistory?.length);
}
