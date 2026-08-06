import { callApi } from '../../../api/gramjs';
import { getGlobal } from '../../../global';
import { selectChat, selectChatLastMessageId } from '../../../global/selectors';
import { modLogger } from '../../api/Logger';
import { blockApiMethod, unblockApiMethod } from '../../api/ApiGuard';

const logger = modLogger.scoped('GhostMode');
const MAIN_THREAD_ID = -1;

/**
 * Sends a read receipt for one chat, on purpose.
 *
 * Hiding read receipts is a default, not a vow. Being unreadable to everyone is rarely
 * what someone actually wants — what they want is to be unreadable by default and honest
 * when they choose, and without this the only way to tell one person you read them is to
 * turn the setting off for everybody.
 *
 * The block is lifted for exactly one call. `interceptApiCall` is consulted synchronously
 * inside `callApi`, so the method is blocked again before control returns anywhere else —
 * there is no window in which an unrelated read could slip out.
 */
export function sendReadReceipt(owner: string, chatId: string, methods: string[]) {
  try {
    const global = getGlobal();
    const chat = selectChat(global, chatId);
    const maxId = selectChatLastMessageId(global, chatId);

    if (!chat || !maxId) return false;

    for (const method of methods) unblockApiMethod(owner, method);

    try {
      void callApi('markMessageListRead', { chat, threadId: MAIN_THREAD_ID, maxId });
    } finally {
      for (const method of methods) blockApiMethod(owner, method);
    }

    return true;
  } catch (err) {
    logger.error('could not send a read receipt', err);
    return false;
  }
}
