import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';

import type { LoggedMessage } from '../../api/Storage';

import { getGlobal } from '../../../global';
import { getLoggedMessages } from '../../api/Storage';
import { setLogViewerOpener } from './actions';

import Modal from '../../../components/ui/Modal';

import './HistoryModal.scss';

function formatDate(ms?: number) {
  return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

/**
 * Reads the durable log for one chat.
 *
 * This is what makes persistence useful rather than write-only. Re-injecting old messages
 * back into the message list in their original positions would require rebuilding
 * `listedIds`/`viewportIds` in the correct order — brittle, and it fails silently by
 * rendering nothing. Showing them in a list sidesteps that entirely and always works.
 *
 * Media is deliberately not rendered: the blobs live in Telegram's own media cache, are
 * not copied here, and the server has deleted the originals, so anything referencing them
 * would show as broken after a restart.
 */
const DeletedLogModal: FC = () => {
  const [chatId, setChatId] = useState<string | undefined>();
  const [messages, setMessages] = useState<LoggedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setLogViewerOpener((id: string) => {
      setChatId(id);
      setIsLoading(true);
      void getLoggedMessages(id).then((loaded) => {
        setMessages(loaded);
        setIsLoading(false);
      });
    });
  }, []);

  const global = getGlobal();

  function senderName(message: LoggedMessage) {
    if (!message.senderId) return 'Unknown';
    const user = global.users.byId[message.senderId];
    const chat = global.chats.byId[message.senderId];
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ')
      || chat?.title
      || message.senderId;
  }

  return (
    <Modal
      isOpen={Boolean(chatId)}
      title="Deleted messages"
      hasCloseButton
      onClose={() => { setChatId(undefined); setMessages([]); }}
      className="draht-history-modal"
    >
      {isLoading && <div className="draht-revision-meta">Loading…</div>}

      {!isLoading && !messages.length && (
        <div className="draht-revision-meta">Nothing logged for this chat.</div>
      )}

      {messages.map((message) => (
        <div key={message.id} className="draht-revision">
          <div className="draht-revision-meta">
            {senderName(message)}
            {' · deleted '}
            {formatDate(message.modDeletedAt)}
          </div>
          <div className="draht-revision-text">
            {message.content?.text?.text || <i>(no text — media is not kept)</i>}
          </div>
        </div>
      ))}
    </Modal>
  );
};

export default memo(DeletedLogModal);
