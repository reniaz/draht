import type { MenuItemContextAction } from '../../../components/ui/ListItem';

import type { ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../../global/types';

import { getGlobal } from '../../../global';
import { updateChatMessage } from '../../../global/reducers/messages';
import { selectChatMessage, selectCommonBoxChatId } from '../../../global/selectors/messages';
import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import {
  enqueue, installFlushHandlers, setRetentionPolicy, setStorageEnabled,
} from '../../api/Storage';
import { clearChatLog, hasChatLog, openLogViewer } from './actions';
import { MessageLogMenuItems } from './MessageLogMenu';

const logger = modLogger.scoped('MessageLogger');

const settings = definePluginSettings({
  deleteStyle: {
    type: OptionType.SELECT,
    description: 'How deleted messages are highlighted',
    options: [
      { label: 'Red text', value: 'text', default: true },
      { label: 'Red overlay', value: 'overlay' },
    ],
    onChange: () => applyDeleteStyle(),
  },
  logDeletes: {
    type: OptionType.BOOLEAN,
    description: 'Keep deleted messages visible instead of removing them',
    default: true,
  },
  logEdits: {
    type: OptionType.BOOLEAN,
    description: 'Record previous versions of edited messages',
    default: true,
  },
  maxEditHistory: {
    type: OptionType.NUMBER,
    description: 'Most revisions to keep per message (the original is always kept)',
    default: 32,
  },
  ignoreSelf: {
    type: OptionType.BOOLEAN,
    description: 'Let your own deleted messages actually delete',
    default: false,
  },
  ignoreBots: {
    type: OptionType.BOOLEAN,
    description: 'Let messages from bots actually delete',
    default: false,
  },
  ignoreSecretChats: {
    type: OptionType.BOOLEAN,
    description: 'Never log secret chats (end-to-end encrypted)',
    default: true,
  },
  ignoreUsers: {
    type: OptionType.STRING,
    description: 'User IDs to never log, separated by commas or spaces',
    default: '',
    multiline: true,
  },
  ignoreChats: {
    type: OptionType.STRING,
    description: 'Chat IDs to never log, separated by commas or spaces',
    default: '',
    multiline: true,
  },
  persistLog: {
    type: OptionType.BOOLEAN,
    description: 'Keep the log across restarts (stored locally, in this app only)',
    default: true,
    onChange: () => applyStoragePolicy(),
  },
  persistWhenPasscodeSet: {
    type: OptionType.SELECT,
    description:
      'What to do when a Telegram passcode is set. Telegram encrypts its own cached data '
      + 'behind the passcode; this log is stored separately and is not encrypted.',
    options: [
      { label: 'Keep the log in memory only', value: 'never', default: true },
      { label: 'Persist anyway (readable on disk)', value: 'always' },
    ],
    onChange: () => applyStoragePolicy(),
  },
  maxPerChat: {
    type: OptionType.NUMBER,
    description: 'Most deleted messages to keep per chat',
    default: 200,
    onChange: () => applyStoragePolicy(),
  },
  maxTotalMessages: {
    type: OptionType.NUMBER,
    description: 'Most deleted messages to keep in total, across all chats',
    default: 5000,
    onChange: () => applyStoragePolicy(),
  },
  maxAgeDays: {
    type: OptionType.NUMBER,
    description: 'Discard logged messages older than this many days',
    default: 30,
    onChange: () => applyStoragePolicy(),
  },
});

/**
 * Persistence is off by default whenever a passcode is set.
 *
 * Telegram encrypts its own cached state behind the passcode. Our log sits outside that,
 * so writing it in the clear would leave deleted messages readable on disk in an app
 * where the user explicitly asked for at-rest protection — a real regression, and not one
 * they would expect from a logging plugin. Opting in is possible; defaulting to it is not.
 */
function applyStoragePolicy() {
  const hasPasscode = Boolean(getGlobal().passcode?.hasPasscode);
  const blockedByPasscode = hasPasscode && settings.store.persistWhenPasscodeSet === 'never';

  setStorageEnabled(Boolean(settings.store.persistLog) && !blockedByPasscode);

  setRetentionPolicy({
    maxPerChat: Math.max(1, Number(settings.store.maxPerChat) || 200),
    maxTotalMessages: Math.max(1, Number(settings.store.maxTotalMessages) || 5000),
    maxAgeDays: Math.max(1, Number(settings.store.maxAgeDays) || 30),
  });
}

function applyDeleteStyle() {
  // A body class rather than swapping <style> nodes: Vite has no equivalent of Vencord's
  // `?managed` CSS import, and both rule sets are cheap enough to ship together.
  const { classList } = document.body;
  const isOverlay = settings.store.deleteStyle === 'overlay';
  classList.toggle('draht-delete-style-overlay', isOverlay);
  classList.toggle('draht-delete-style-text', !isOverlay);
}

/**
 * Parses an id list.
 *
 * Vencord's equivalent is a genuine bug (messageLogger/index.tsx:325): it keeps the raw
 * string and tests it with `String.prototype.includes`, which is substring matching, not
 * list membership — so `ignoreUsers: "123"` silently also ignores user `1234567`.
 */
const listCache = new Map<string, Set<string>>();

function parseIdList(raw: string) {
  let parsed = listCache.get(raw);
  if (!parsed) {
    parsed = new Set(raw.split(/[,\s]+/).filter(Boolean));
    // The cache is keyed by the setting's text, so it only grows as the user edits.
    if (listCache.size > 16) listCache.clear();
    listCache.set(raw, parsed);
  }
  return parsed;
}

function shouldIgnore(
  global: GlobalState, chatId: string, message: ApiMessage, isEdit = false,
) {
  try {
    const {
      logDeletes, logEdits, ignoreSelf, ignoreBots, ignoreSecretChats, ignoreUsers, ignoreChats,
    } = settings.store;

    if (isEdit ? !logEdits : !logDeletes) return true;
    if (ignoreSelf && message.senderId === global.currentUserId) return true;

    // Secret chats carry an explicit end-to-end promise that ordinary chats do not.
    // Defeating it by default would be the wrong default to ship.
    if (ignoreSecretChats && chatId.startsWith('-777')) return true;

    if (ignoreBots && message.senderId) {
      const sender = global.users.byId[message.senderId];
      if (sender?.type === 'userTypeBot') return true;
    }

    if (message.senderId && parseIdList(ignoreUsers).has(String(message.senderId))) return true;
    if (parseIdList(ignoreChats).has(String(chatId))) return true;

    return false;
  } catch (err) {
    // Fail open: logging a message we should have skipped is recoverable, losing one
    // because a selector threw is not.
    logger.error('shouldIgnore failed', err);
    return false;
  }
}

/**
 * Messages the user has explicitly asked to purge.
 *
 * Ported from Vencord's `mlDeleted` protocol (messageLogger/index.tsx:294): instead of a
 * second "really delete this time" path that has to stay in sync with the first, a purge
 * re-enters upstream's own delete flow carrying a single-use bypass flag. `Set.delete()`
 * both tests and consumes the entry, so a stale flag cannot leak into a later genuine
 * deletion.
 */
const bypass = new Set<string>();

function bypassKey(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}

export function markForPurge(chatId: string, ids: number[]) {
  ids.forEach((id) => bypass.add(bypassKey(chatId, id)));
}

function protectMessages<T extends GlobalState>(
  global: T,
  chatId: string | undefined,
  ids: number[],
): { global: T; deletableIds: number[] } {
  const deletableIds: number[] = [];

  for (const id of ids) {
    // `chatId` is undefined on the common-box path (private chats and basic groups),
    // where ids are global message ids that must be resolved to a chat first. That path
    // deletes unconditionally upstream, so getting it wrong loses the message outright.
    const resolvedChatId = chatId ?? selectCommonBoxChatId(global, id);
    if (!resolvedChatId) {
      deletableIds.push(id);
      continue;
    }

    if (bypass.delete(bypassKey(resolvedChatId, id))) {
      deletableIds.push(id);
      continue;
    }

    const message = selectChatMessage(global, resolvedChatId, id);
    if (!message || shouldIgnore(global, resolvedChatId, message)) {
      deletableIds.push(id);
      continue;
    }

    const deletedAt = Date.now();
    enqueue(resolvedChatId, message, deletedAt);

    global = updateChatMessage(global, resolvedChatId, id, {
      isModDeleted: true,
      modDeletedAt: deletedAt,
      // Cleared defensively: we never set it, but a lingering `isDeleting` would let the
      // channel path's phase-2 sweep collect the message anyway.
      isDeleting: undefined,
    });
  }

  return { global, deletableIds };
}

function deletedClassName(message: ApiMessage) {
  return message.isModDeleted ? 'draht-deleted' : undefined;
}

function getMessageText(message: ApiMessage | undefined) {
  return message?.content?.text?.text;
}

/**
 * Records the *superseded* text of an edited message.
 *
 * Semantics are copied exactly from Vencord: each entry pairs the content that was
 * replaced with the timestamp it was replaced at, and the current text is never in the
 * history — it lives on the message. So the full revision list is
 * `[...modEditHistory.map((e) => e.text), currentText]`.
 *
 * Runs before upstream's own `updateMessage` handler (the mod's action bus is registered
 * first, from `src/index.tsx`), which is the only reason the previous text is still
 * readable here.
 */
function captureEdit(global: GlobalState, update: any): GlobalState | undefined {
  const { chatId, id, message } = update;
  if (!chatId || !id || !message) return undefined;

  const cached = selectChatMessage(global, chatId, id);
  // No cached copy means this is a new message arriving, not an edit of a known one.
  if (!cached) return undefined;

  if (shouldIgnore(global, chatId, cached, true)) return undefined;

  // Telegram also emits `updateMessage` for link-preview resolution, view counts and
  // reactions. Without both of these guards every one of those would log a bogus
  // revision.
  if (!message.editDate || message.editDate === cached.editDate) return undefined;

  const oldText = getMessageText(cached);
  const newText = getMessageText(message);
  // Compare text only: entity arrays are rebuilt on every update and would always differ.
  if (oldText === newText || oldText === undefined) return undefined;

  const history = [...(cached.modEditHistory ?? []), {
    date: message.editDate * 1000,
    text: oldText,
  }];

  const max = Math.max(2, Number(settings.store.maxEditHistory) || 32);
  if (history.length > max) {
    // Drop from index 1, never index 0. Index 0 is the message as originally sent, which
    // is the entry most worth keeping — a plain FIFO would discard exactly that.
    history.splice(1, history.length - max);
  }

  return updateChatMessage(global, chatId, id, {
    modEditHistory: history,
    modFirstEditDate: cached.modFirstEditDate ?? (cached.editDate ?? cached.date) * 1000,
  });
}

export default definePlugin({
  name: 'MessageLogger',
  description: 'Keeps deleted messages visible instead of letting them disappear.',
  authors: ['Draht'],
  enabledByDefault: true,

  settings,

  seams: {
    beforeDeleteMessages: protectMessages,
    messageClassNames: deletedClassName,
    messageMenuItems: (message) => <MessageLogMenuItems message={message} />,
    chatMenuItems: (chatId) => {
      const items: MenuItemContextAction[] = [{
        // Always offered, not gated on `hasChatLog`: after a restart the log lives only
        // on disk, and reading it is async — which a synchronous menu builder cannot do.
        // Gating here would hide the entry in exactly the case it exists for.
        title: 'Deleted messages',
        icon: 'info',
        handler: () => openLogViewer(chatId),
      }];

      if (hasChatLog(chatId)) {
        items.push({
          title: 'Clear message log',
          icon: 'delete',
          destructive: true,
          handler: () => clearChatLog(chatId),
        });
      }

      return items;
    },
  },

  apiUpdates: {
    updateMessage: captureEdit,
  },

  start() {
    applyDeleteStyle();
    applyStoragePolicy();
    installFlushHandlers();
  },

  stop() {
    bypass.clear();
    document.body.classList.remove('draht-delete-style-overlay', 'draht-delete-style-text');
  },
});
