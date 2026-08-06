import type { MenuItemContextAction } from '../../../components/ui/ListItem';
import type { ApiMessage } from '../../../api/types';

import { addSeam, removeSeam } from '../../api/Seams';
import { definePlugin } from '../../api/types';
import { openBookmarks } from './actions';
import { BookmarkMenuItem } from './BookmarkMenuItem';
import { getBookmarks, restore } from './store';

const messageMenu = (message: ApiMessage) => <BookmarkMenuItem message={message} />;

/**
 * Offered on every chat, not gated on there being bookmarks.
 *
 * The list is global, so the entry has to be reachable from somewhere that always exists,
 * and a chat's own menu is the only such place without another upstream edit. Hiding it
 * when the list is empty would hide it in exactly the case where someone is looking for
 * where bookmarks went.
 */
const chatMenu = (): MenuItemContextAction[] => [{
  title: 'Bookmarks',
  icon: 'favorite',
  handler: () => openBookmarks(),
}];

export default definePlugin({
  name: 'Bookmarks',
  description:
    'Save a message to a private list on this machine. Unlike forwarding to Saved '
    + 'Messages, nothing is sent, tagged "forwarded from", or synced to your other devices.',
  authors: ['Draht'],
  enabledByDefault: true,

  start() {
    restore();
    addSeam('messageMenuItems', messageMenu);
    addSeam('chatMenuItems', chatMenu);
  },

  stop() {
    removeSeam('messageMenuItems', messageMenu);
    removeSeam('chatMenuItems', chatMenu);
  },
});

export { getBookmarks };
