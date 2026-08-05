import type { ApiMessage } from '../../../api/types';

/**
 * A short rolling record of messages as they arrive.
 *
 * The delete seam reads the message out of global state, which only works for messages the
 * client happens to be holding: a chat that has not been opened has none loaded, an old one
 * has scrolled out of the loaded window, and after a restart there are none at all. When
 * the lookup misses, the deletion goes through with nothing kept and the message is gone
 * for good — which is the case people notice, because "sent then deleted in a chat I had
 * not opened" is exactly what someone deleting a message tends to do.
 *
 * Holding the last few per chat closes that without keeping a copy of the whole history.
 * It also answers the other half: on the common-box path a deletion arrives with no chat
 * id, and upstream resolves it by searching loaded messages — which misses for the same
 * reason. An id recorded here knows its own chat.
 */
const PER_CHAT = 60;

/** Across all chats, so a hundred quiet chats cannot add up to a large footprint. */
const TOTAL = 1500;

/** In insertion order, so the oldest is the first key. */
const byChat = new Map<string, Map<number, ApiMessage>>();
const chatOfMessage = new Map<number, string>();

function evictGlobally() {
  let total = 0;
  for (const messages of byChat.values()) total += messages.size;
  if (total <= TOTAL) return;

  // Oldest chat first, which is the one least recently written to.
  for (const [chatId, messages] of byChat) {
    for (const id of messages.keys()) {
      messages.delete(id);
      chatOfMessage.delete(id);
      total--;
      if (total <= TOTAL) break;
    }

    if (!messages.size) byChat.delete(chatId);
    if (total <= TOTAL) break;
  }
}

export function remember(chatId: string, message: ApiMessage) {
  if (!chatId || !message?.id) return;

  let messages = byChat.get(chatId);
  if (!messages) {
    messages = new Map();
    byChat.set(chatId, messages);
  }

  // Re-inserted so the map stays in arrival order even when a message is updated.
  messages.delete(message.id);
  messages.set(message.id, message);
  chatOfMessage.set(message.id, chatId);

  while (messages.size > PER_CHAT) {
    const oldest = messages.keys().next().value as number;
    messages.delete(oldest);
    chatOfMessage.delete(oldest);
  }

  // Touch the chat's position too, so eviction drops quiet chats before busy ones.
  byChat.delete(chatId);
  byChat.set(chatId, messages);

  evictGlobally();
}

export function recall(chatId: string, id: number): ApiMessage | undefined {
  return byChat.get(chatId)?.get(id);
}

/** The chat an id belongs to, for deletions that arrive without one. */
export function recallChatId(id: number): string | undefined {
  return chatOfMessage.get(id);
}

export function forget(chatId: string, id: number) {
  byChat.get(chatId)?.delete(id);
  chatOfMessage.delete(id);
}

export function clearRecent() {
  byChat.clear();
  chatOfMessage.clear();
}

/** For tests and diagnostics. */
export function recentCount() {
  let total = 0;
  for (const messages of byChat.values()) total += messages.size;

  return total;
}
