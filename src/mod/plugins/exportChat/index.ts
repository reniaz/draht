import type { MenuItemContextAction } from '../../../components/ui/ListItem';

import { getActions, getGlobal } from '../../../global';

import { modLogger } from '../../api/Logger';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePlugin } from '../../api/types';
import { activeThemeVars, chatTitle, collectMessages } from './collect';
import { buildChatHtml } from './render';

const logger = modLogger.scoped('ExportChat');

function fileNameFor(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);

  return `${slug || 'chat'}-${date}.html`;
}

async function exportChat(chatId: string) {
  try {
    const global = getGlobal();
    const title = chatTitle(global, chatId);
    const messages = collectMessages(global, chatId);

    const html = buildChatHtml({
      title,
      messages,
      vars: activeThemeVars(),
      exportedAt: Date.now(),
    });

    const file = fileNameFor(title);

    if (window.draht?.saveFile) {
      const saved = await window.draht.saveFile(file, html, 'Export chat');
      if (saved) {
        getActions().showNotification({ message: `Exported ${messages.length} messages` });
      }
      return;
    }

    // Outside Electron there is no save dialog; a download is the only route.
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    logger.error('export failed', err);
    getActions().showNotification({ message: 'Could not export this chat' });
  }
}

const menuItems = (chatId: string): MenuItemContextAction[] => [{
  title: 'Export chat',
  icon: 'download',
  handler: () => { void exportChat(chatId); },
}];

export default definePlugin({
  name: 'ExportChat',
  description:
    'Save a chat as a single HTML file, styled with your current theme. Right-click a '
    + 'chat to export it.',
  authors: ['Draht'],
  enabledByDefault: true,

  start() {
    addSeam('chatMenuItems', menuItems);
  },

  stop() {
    removeSeam('chatMenuItems', menuItems);
  },
});
