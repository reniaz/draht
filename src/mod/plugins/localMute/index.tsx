import type { ApiMessage } from '../../../api/types';

import { getGlobal } from '../../../global';
import { selectCurrentMessageList } from '../../../global/selectors';
import { attachAction, detachAction } from '../../api/ActionBus';
import { addSeam, removeSeam } from '../../api/Seams';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import { MuteMenuItems } from './MuteMenuItem';
import {
  clearMuted, EVERYWHERE, getMuted, restore, subscribe,
} from './store';

const STYLE_ID = 'draht-mute';

const settings = definePluginSettings({
  showPlaceholder: {
    type: OptionType.BOOLEAN,
    displayName: 'Leave a "hidden message" marker',
    description:
      'Shows that something was hidden instead of removing it silently. Useful when a '
      + 'reply refers to a message that is not there.',
    default: false,
    onChange: () => applyStyles(),
  },
});

/**
 * Tags every message with who sent it.
 *
 * The hiding itself is done by a stylesheet rather than by this class, because muting has
 * to take effect the moment it is chosen — and nothing in the global state changes when it
 * is, so there is no re-render to piggyback on. A rule added to a stylesheet applies
 * immediately to messages already on screen.
 *
 * One template string per message is the whole cost, and only while the plugin is running:
 * stopped, the seam list is empty and this is never called.
 */
const classNames = (message: ApiMessage) => (
  message.senderId ? `draht-from-${message.senderId}` : undefined
);

const menuItems = (message: ApiMessage) => <MuteMenuItems message={message} />;

function ruleFor(selectors: string, showPlaceholder: boolean) {
  // Hidden rather than dimmed: the point is not to read it, and a greyed-out message you
  // can still make out is a message you still read.
  if (!showPlaceholder) return `${selectors} {\n  display: none;\n}\n`;

  return [
    `${selectors} > .message-content-wrapper,`,
    `${selectors} > .Avatar {`,
    '  display: none;',
    '}',
    `${selectors}::after {`,
    '  content: "Hidden message";',
    '  display: block;',
    '  padding: 0.25rem 0;',
    '  text-align: center;',
    '  font-size: 0.75rem;',
    '  color: var(--color-text-secondary);',
    '  opacity: 0.6;',
    '}',
    '',
  ].join('\n');
}

/**
 * Rewrites the stylesheet for whichever chat is open.
 *
 * A mute is per chat, and CSS cannot ask which chat a message belongs to — but the message
 * list only ever shows one, so the question is answered here and the stylesheet holds only
 * the rules that apply right now.
 */
function applyStyles() {
  const { chatId } = selectCurrentMessageList(getGlobal()) || {};

  const hidden = getMuted()
    .filter((key) => {
      const scope = key.slice(0, key.indexOf(':'));

      return scope === EVERYWHERE || (chatId !== undefined && scope === chatId);
    })
    .map((key) => key.slice(key.indexOf(':') + 1));

  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!hidden.length) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement('style');
    element.id = STYLE_ID;
    document.head.appendChild(element);
  }

  const selectors = [...new Set(hidden)]
    .map((id) => `.Message.draht-from-${id}`)
    .join(',\n');

  element.textContent = ruleFor(selectors, Boolean(settings.store.showPlaceholder));
}

let unsubscribe: NoneToVoidFunction | undefined;

const onChatOpen = (() => { applyStyles(); return undefined; }) as never;

export default definePlugin({
  name: 'LocalMute',
  description:
    'Hide a person\'s messages without leaving the group or telling anyone. Right-click '
    + 'one of their messages to hide or show them again.',
  authors: ['Draht'],
  enabledByDefault: false,

  settings,

  start() {
    restore();

    addSeam('messageClassNames', classNames);
    addSeam('messageMenuItems', menuItems);

    // The stylesheet depends on both the mute list and which chat is open.
    unsubscribe = subscribe(applyStyles);
    attachAction('processOpenChatOrThread', onChatOpen);

    applyStyles();
  },

  stop() {
    unsubscribe?.();
    unsubscribe = undefined;

    detachAction('processOpenChatOrThread', onChatOpen);
    removeSeam('messageClassNames', classNames);
    removeSeam('messageMenuItems', menuItems);

    document.getElementById(STYLE_ID)?.remove();
  },
});

export { clearMuted, getMuted };
