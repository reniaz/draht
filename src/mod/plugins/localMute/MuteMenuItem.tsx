import type { FC } from '../../../lib/teact/teact';

import type { ApiMessage } from '../../../api/types';

import { getGlobal } from '../../../global';
import {
  EVERYWHERE, mute, muteScope, unmute,
} from './store';

import MenuItem from '../../../components/ui/MenuItem';

/**
 * Mute and unmute from a message's own context menu.
 *
 * Offered on the message rather than in a settings list, because that is where you are
 * when you decide: you have just read something from someone you would rather not hear
 * from again.
 */
export const MuteMenuItems: FC<{ message: ApiMessage }> = ({ message }) => {
  const senderId = message.senderId;

  // Your own messages, and service messages with no sender, have nobody to mute.
  if (!senderId || senderId === getGlobal().currentUserId) return undefined;

  const chatId = message.chatId;
  const scope = muteScope(chatId, senderId);

  if (scope) {
    return (
      <MenuItem icon="user" onClick={() => unmute(chatId, senderId)}>
        {scope === 'everywhere' ? 'Show them again (everywhere)' : 'Show them again'}
      </MenuItem>
    );
  }

  return (
    <>
      <MenuItem icon="delete-user" onClick={() => mute(chatId, senderId)}>
        Hide their messages here
      </MenuItem>
      <MenuItem icon="delete-user" onClick={() => mute(EVERYWHERE, senderId)}>
        Hide their messages everywhere
      </MenuItem>
    </>
  );
};
