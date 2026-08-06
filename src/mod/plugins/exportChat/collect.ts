import type { GlobalState } from '../../../global/types';
import type { ExportedMessage } from './render';

import { getMessageText } from '../../../global/helpers';
// Not re-exported from the barrel.
import { getPeerTitle } from '../../../global/helpers/peers';
import {
  selectChat, selectChatMessages, selectListedIds, selectSender,
} from '../../../global/selectors';
import { getSettingValue } from '../../api/Settings';
import { buildThemeVars, DEFAULT_SEED, TELEGRAM_DARK } from '../themes/themes';
import { findTheme } from '../themes';

const MAIN_THREAD_ID = -1;

/** A short description of what was sent, for anything that is not text. */
export function describeMedia(content: any): string | undefined {
  if (!content) return undefined;

  if (content.photo) return 'Photo';
  if (content.video) return content.video.isRound ? 'Video message' : 'Video';
  if (content.voice) return 'Voice message';
  if (content.audio) return 'Audio';
  if (content.sticker) return `Sticker ${content.sticker.emoji || ''}`.trim();
  if (content.document) return `File: ${content.document.fileName || 'document'}`;
  if (content.contact) return 'Contact';
  if (content.location) return 'Location';
  if (content.poll) return 'Poll';
  if (content.action) return undefined;

  return undefined;
}

/**
 * The messages of a chat, as the client currently holds them.
 *
 * Only what is loaded — the client does not keep a whole history, and fetching one would
 * mean paging the entire chat off the server. The header says how many were exported so
 * the file never implies it is complete.
 */
/** Message text, however the message happens to carry it. */
export function textOf(message: any): string {
  return getMessageText(message)?.text || '';
}

export function collectMessages(global: GlobalState, chatId: string): ExportedMessage[] {
  const byId = selectChatMessages(global, chatId);
  const listed = selectListedIds(global, chatId, MAIN_THREAD_ID);
  if (!byId) return [];

  // `listedIds` is the ordered view; without it, fall back to id order, which is the same
  // ordering Telegram assigns.
  const ids = listed?.length ? listed : Object.keys(byId).map(Number).sort((a, b) => a - b);

  const lang = ((key: string) => key) as any;

  return ids.flatMap((id) => {
    const message = byId[id];
    if (!message) return [];

    const sender = selectSender(global, message);
    const text = getMessageText(message)?.text || '';
    const attachment = describeMedia(message.content);

    // An action-only message (someone joined, the title changed) has neither.
    if (!text && !attachment) return [];

    return [{
      id,
      sender: sender ? getPeerTitle(lang, sender) || 'Unknown' : 'Unknown',
      date: (message.date || 0) * 1000,
      text,
      isOutgoing: Boolean(message.isOutgoing),
      attachment,
      isDeleted: Boolean((message as any).isModDeleted),
    }];
  });
}

export function chatTitle(global: GlobalState, chatId: string): string {
  const chat = selectChat(global, chatId);
  const lang = ((key: string) => key) as any;

  return chat ? getPeerTitle(lang, chat) || 'Chat' : 'Chat';
}

/**
 * The CSS variables of whatever theme is active.
 *
 * The export is meant to look like the client it came from, so this reads the same setting
 * the client renders from rather than hardcoding a palette.
 */
export function activeThemeVars(): Record<string, string> {
  const selected = String(getSettingValue('Themes', 'theme') ?? 'off');
  const brightness = (Number(getSettingValue('Themes', 'brightness')) || 0) / 100;

  if (selected === 'off') return buildThemeVars(TELEGRAM_DARK, brightness);

  if (selected === 'custom') {
    try {
      const raw = getSettingValue('Themes', 'customSeed');
      const seed = { ...DEFAULT_SEED, ...JSON.parse(typeof raw === 'string' ? raw : '{}') };

      return buildThemeVars(seed, brightness);
    } catch {
      return buildThemeVars(DEFAULT_SEED, brightness);
    }
  }

  return buildThemeVars(findTheme(selected)?.seed ?? TELEGRAM_DARK, brightness);
}
