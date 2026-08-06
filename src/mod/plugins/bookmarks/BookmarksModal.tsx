import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { Bookmark } from './store';

import { setBookmarksOpener } from './actions';
import {
  getBookmarks, removeBookmark, subscribe,
} from './store';

import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';

import './Bookmarks.scss';

function formatDate(ms: number) {
  return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

/**
 * The saved messages that never left this machine.
 *
 * Shows the copy that was taken when the bookmark was made, not the message as it stands
 * now — the message may have been edited or deleted since, and the whole point of keeping
 * a copy is that the bookmark still says what you saved.
 *
 * Jumping to the original is offered anyway, since a bookmark is usually a way back to a
 * conversation rather than to one line of it.
 */
const BookmarksModal: FC = () => {
  const { openChat } = getActions();
  const [isOpen, setIsOpen] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    setBookmarksOpener(() => setIsOpen(true));

    return subscribe(() => forceUpdate((v) => v + 1));
  }, []);

  const bookmarks = getBookmarks();

  function jumpTo(bookmark: Bookmark) {
    setIsOpen(false);
    openChat({ id: bookmark.chatId });
  }

  return (
    <Modal isOpen={isOpen} title="Bookmarks" hasCloseButton onClose={() => setIsOpen(false)}>
      {!bookmarks.length && (
        <p className="draht-bookmarks-empty">
          Nothing saved yet. Right-click a message and choose Bookmark.
        </p>
      )}

      <div className="draht-bookmarks custom-scroll">
        {bookmarks.map((bookmark) => (
          <div className="draht-bookmark" key={`${bookmark.chatId}-${bookmark.messageId}`}>
            <div className="draht-bookmark-meta">
              <span className="draht-bookmark-sender">{bookmark.sender}</span>
              <span className="draht-bookmark-chat">{bookmark.chatTitle}</span>
              <span className="draht-bookmark-date">{formatDate(bookmark.date)}</span>
            </div>

            <div className="draht-bookmark-text">{bookmark.text || 'No text'}</div>

            <div className="draht-bookmark-actions">
              <Button size="tiny" isText onClick={() => jumpTo(bookmark)}>Open chat</Button>
              <Button
                size="tiny"
                isText
                color="danger"
                onClick={() => removeBookmark(bookmark.chatId, bookmark.messageId)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default memo(BookmarksModal);
