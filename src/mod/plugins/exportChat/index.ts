import type { MenuItemContextAction } from '../../../components/ui/ListItem';

import { getActions, getGlobal } from '../../../global';

import { selectChat } from '../../../global/selectors';
import { modLogger } from '../../api/Logger';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import { activeThemeVars, chatTitle, collectMessages } from './collect';
import { fetchHistory } from './history';
import { buildChatHtml } from './render';

const settings = definePluginSettings({
  maxMessages: {
    type: OptionType.NUMBER,
    displayName: 'Most messages to export',
    description:
      'A stop, not a target. Exporting a chat reads its history from Telegram a page at '
      + 'a time, and a chat with a hundred thousand messages would otherwise mean a very '
      + 'long wait and a file too large to open.',
    default: 20000,
  },
});

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
    const chat = selectChat(global, chatId);
    const limit = Math.max(1, Number(settings.store.maxMessages) || 20000);

    getActions().showNotification({ message: `Exporting ${title}…` });

    // The whole history, read from the server. The client holds only what has been
    // scrolled through, so exporting from state gives whatever happened to be in memory.
    let messages = chat ? await fetchHistory(chat, limit) : [];

    // No chat object, or a history that cannot be read — fall back to what is loaded
    // rather than writing an empty file.
    if (!messages.length) messages = collectMessages(global, chatId);

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

  settings,

  start() {
    addSeam('chatMenuItems', menuItems);
  },

  stop() {
    removeSeam('chatMenuItems', menuItems);
  },
});
