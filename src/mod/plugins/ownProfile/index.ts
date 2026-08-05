import { getActions } from '../../../global';
import { SettingsScreens } from '../../../types';

import { addSeam, removeSeam } from '../../api/Seams';
import { definePlugin } from '../../api/types';

/**
 * Opens "My Profile" without moving you out of the chat you are reading.
 *
 * Upstream's My Profile opens your own chat with the profile panel beside it — and your
 * own chat is Saved Messages, so what you see is being thrown into Saved Messages. The
 * panel cannot simply be shown in place either: the right column renders the profile of
 * whichever chat is open, so showing yours there means switching to yours.
 *
 * Settings already shows your profile, in the left column, and opening it leaves the
 * middle column exactly as it was. That is what "stay in the chat you are on" can mean
 * here without rebuilding the right column.
 */
function handleOpenOwnProfile(): boolean {
  getActions().openSettingsScreen({ screen: SettingsScreens.Main });

  return true;
}

export default definePlugin({
  name: 'OwnProfile',
  description: 'Open My Profile in Settings instead of switching you to Saved Messages.',
  authors: ['Draht'],
  enabledByDefault: true,
  // Client behaviour, so it lives under Draht Settings -> General.
  hidden: true,

  start() {
    addSeam('openOwnProfile', handleOpenOwnProfile);
  },

  stop() {
    removeSeam('openOwnProfile', handleOpenOwnProfile);
  },
});
