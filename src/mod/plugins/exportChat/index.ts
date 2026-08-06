import type { MenuItemContextAction } from '../../../components/ui/ListItem';

import { getActions, getGlobal } from '../../../global';

import { selectChat } from '../../../global/selectors';
import { modLogger } from '../../api/Logger';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import { activeThemeVars, chatTitle, collectMessages } from './collect';
import { downloadMedia } from './download';
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
  includeMedia: {
    type: OptionType.BOOLEAN,
    displayName: 'Include photos and videos',
    description:
      'Saves them beside the transcript. Documents are never included — an archive or an '
      + 'installer is usually larger than the whole rest of the export put together.',
    default: true,
  },
  maxFileMb: {
    type: OptionType.NUMBER,
    displayName: 'Largest file to include (MB)',
    description: 'One long video is what makes an export take an age.',
    default: 25,
  },
  maxTotalMb: {
    type: OptionType.NUMBER,
    displayName: 'Total media to include (MB)',
    description: 'A thousand small files is what fills a disk.',
    default: 500,
  },
});

const logger = modLogger.scoped('ExportChat');

function folderNameFor(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);

  return `${slug || 'chat'}-${date}`;
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
    let fetched = chat ? await fetchHistory(chat, limit) : [];

    // No chat object, or a history that cannot be read — fall back to what is loaded
    // rather than writing an empty file.
    if (!fetched.length) {
      fetched = collectMessages(global, chatId).map((exported) => ({ exported, raw: {} as any }));
    }

    const files: { name: string; text?: string; bytes?: Uint8Array }[] = [];

    if (settings.store.includeMedia) {
      getActions().showNotification({ message: 'Saving photos and videos…' });

      const media = await downloadMedia(fetched, {
        maxFileBytes: Math.max(1, Number(settings.store.maxFileMb) || 25) * 1024 * 1024,
        maxTotalBytes: Math.max(1, Number(settings.store.maxTotalMb) || 500) * 1024 * 1024,
      });

      for (const file of media) files.push({ name: `media/${file.name}`, bytes: file.bytes });
    }

    const messages = fetched.map(({ exported }) => exported);

    const html = buildChatHtml({
      title,
      messages,
      vars: activeThemeVars(),
      exportedAt: Date.now(),
    });

    // The transcript first, so the folder opens on the thing worth reading.
    files.unshift({ name: 'index.html', text: html });

    if (window.draht?.saveExport) {
      const saved = await window.draht.saveExport(folderNameFor(title), files);
      if (saved) {
        const mediaCount = files.length - 1;
        getActions().showNotification({
          message: `Exported ${messages.length} messages`
            + (mediaCount ? ` and ${mediaCount} files` : ''),
        });
      }

      return;
    }

    // Outside Electron there is no folder to write into; the transcript alone is still
    // worth having.
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${folderNameFor(title)}.html`;
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
    'Save a chat as an HTML file styled with your current theme, with its photos and '
    + 'videos beside it. Right-click a chat to export it.',
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
