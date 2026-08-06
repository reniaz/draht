import type { FC } from '../../../lib/teact/teact';
import { useEffect, useState } from '../../../lib/teact/teact';

import type { ApiMessage } from '../../../api/types';

import { getGlobal } from '../../../global';
import { getMessageText } from '../../../global/helpers';
import { getPeerTitle } from '../../../global/helpers/peers';
import { selectChat, selectSender } from '../../../global/selectors';
import {
  addBookmark, isBookmarked, removeBookmark, subscribe,
} from './store';

import MenuItem from '../../../components/ui/MenuItem';

/**
 * Saves a message, or removes it again.
 *
 * The alternative Telegram offers is forwarding to Saved Messages, which tells the sender
 * nothing but does put a "forwarded from" tag on it, syncs it to every device, and leaves
 * it in a chat anyone glancing at your client can read. This keeps it here.
 */
export const BookmarkMenuItem: FC<{ message: ApiMessage }> = ({ message }) => {
  const { chatId, id } = message;

  // The list lives outside the global state, so saving one changes nothing Teact watches
  // and the menu would go on offering "Bookmark" for a message it had just saved.
  const [, forceUpdate] = useState(0);
  useEffect(() => subscribe(() => forceUpdate((v) => v + 1)), []);

  const saved = isBookmarked(chatId, id);

  if (saved) {
    return (
      <MenuItem icon="favorite" onClick={() => removeBookmark(chatId, id)}>
        Remove bookmark
      </MenuItem>
    );
  }

  return (
    <MenuItem
      icon="favorite"
      onClick={() => {
        const global = getGlobal();
        const sender = selectSender(global, message);
        const chat = selectChat(global, chatId);
        const lang = ((key: string) => key) as any;

        addBookmark({
          chatId,
          messageId: id,
          // Copied now, deliberately: see the note in the store.
          text: getMessageText(message)?.text || '',
          sender: sender ? getPeerTitle(lang, sender) || 'Unknown' : 'Unknown',
          chatTitle: chat ? getPeerTitle(lang, chat) || 'Chat' : 'Chat',
          date: (message.date || 0) * 1000,
          savedAt: Date.now(),
        });
      }}
    >
      Bookmark
    </MenuItem>
  );
};
