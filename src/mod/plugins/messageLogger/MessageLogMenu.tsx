import type { FC } from '../../../lib/teact/teact';

import type { ApiChat, ApiMessage } from '../../../api/types';

import { clearChatLog, openHistory, purgeMessage } from './actions';

import MenuItem from '../../../components/ui/MenuItem';

/**
 * Context-menu entries for a single message.
 *
 * Both are conditional: a message with neither a logged deletion nor an edit history has
 * nothing for this plugin to act on, and adding dead entries to every message's menu
 * would be noise.
 */
export const MessageLogMenuItems: FC<{ message: ApiMessage }> = ({ message }) => {
  const isDeleted = Boolean(message.isModDeleted);
  const hasHistory = Boolean(message.modEditHistory?.length);

  if (!isDeleted && !hasHistory) return undefined;

  return (
    <>
      {hasHistory && (
        <MenuItem icon="info" onClick={() => openHistory(message)}>
          {`Edit history (${message.modEditHistory!.length + 1})`}
        </MenuItem>
      )}
      <MenuItem destructive icon="delete" onClick={() => purgeMessage(message)}>
        {isDeleted ? 'Remove from log' : 'Clear edit history'}
      </MenuItem>
    </>
  );
};

export const ChatLogMenuItems: FC<{ chat: ApiChat }> = ({ chat }) => (
  <MenuItem destructive icon="delete" onClick={() => clearChatLog(chat.id)}>
    Clear message log
  </MenuItem>
);
