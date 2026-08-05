import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import FontPicker from './FontPicker';

const logger = modLogger.scoped('Fonts');

const STYLE_ELEMENT_ID = 'draht-font';

/**
 * Upstream's own stack, kept as the fallback chain behind whatever the user picks.
 *
 * The emoji families matter: dropping them makes emoji render as monochrome glyphs, so
 * the chosen font is prepended to this list rather than replacing it. It doubles as the
 * value used to restore areas the user has switched off.
 */
const FALLBACKS = '"Roboto", -apple-system, BlinkMacSystemFont, "Apple Color Emoji", '
  + '"Segoe UI", "Segoe UI Emoji", Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", '
  + '"Helvetica Neue", sans-serif';

/**
 * Areas that can be opted out of individually.
 *
 * The font is applied globally through `--font-family`, which covers everything including
 * corners not listed here. Each toggle therefore works by *reverting* its area when
 * switched off, rather than by applying the font when switched on — that way "all on"
 * genuinely means the whole interface, instead of only the parts someone remembered to
 * enumerate.
 */
const SCOPES = [
  { key: 'applyToMessages', label: 'Messages', selector: '.Message' },
  { key: 'applyToComposer', label: 'Message input', selector: '.Composer, #editable-message-text' },
  { key: 'applyToChatList', label: 'Chat list and sidebar', selector: '#LeftColumn' },
  { key: 'applyToMenus', label: 'Menus and dialogs', selector: '.Menu, .modal-dialog' },
  { key: 'applyToSettings', label: 'Settings screens', selector: '.settings-content' },
] as const;

const settings = definePluginSettings({
  fontFamily: {
    type: OptionType.COMPONENT,
    description: 'Pick any font installed on this computer',
    displayName: 'Font',
    component: FontPicker,
    onChange: () => apply(),
  },
  applyToMessages: {
    type: OptionType.BOOLEAN,
    displayName: 'Messages',
    description: 'Use the font for message text',
    default: true,
    onChange: () => apply(),
  },
  applyToComposer: {
    type: OptionType.BOOLEAN,
    displayName: 'Message input',
    description: 'Use the font for the box you type in',
    default: true,
    onChange: () => apply(),
  },
  applyToChatList: {
    type: OptionType.BOOLEAN,
    displayName: 'Chat list and sidebar',
    description: 'Use the font for the chat list, search and folders',
    default: true,
    onChange: () => apply(),
  },
  applyToMenus: {
    type: OptionType.BOOLEAN,
    displayName: 'Menus and dialogs',
    description: 'Use the font for context menus and popups',
    default: true,
    onChange: () => apply(),
  },
  applyToSettings: {
    type: OptionType.BOOLEAN,
    displayName: 'Settings screens',
    description: 'Use the font in Settings, including this page',
    default: true,
    onChange: () => apply(),
  },
});

function clear() {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

/**
 * Applied as a stylesheet with `!important`, for the same reason as the Themes plugin:
 * telegram-tt writes its own values after the mod initialises, and a normal declaration
 * would simply be overwritten. This also means startup needs nothing but the saved name —
 * the font list API is only used by the picker.
 *
 * The variable is redefined on `html, body`, not just `:root`, and the `font-family`
 * property is set outright as well. Upstream declares `--font-family` on `html, body`
 * itself, and a declaration on the element beats an inherited one from `:root` no matter
 * how important the ancestor's is — inheritance is not a cascade contest. Overriding only
 * `:root` left the variable correct on `<html>` and the whole interface still on Roboto.
 */
function apply() {
  try {
    const family = (settings.store.fontFamily || '').trim();

    if (!family) {
      clear();
      return;
    }

    const stack = `"${family.replace(/"/g, '')}", ${FALLBACKS}`;

    const rules = [
      `:root, html, body { --font-family: ${stack} !important; }`,
      `html, body { font-family: ${stack} !important; }`,
    ];

    for (const scope of SCOPES) {
      if (settings.store[scope.key] === false) {
        // `*` as well as the root, since descendants inherit the computed family rather
        // than re-reading the variable.
        const selectors = scope.selector
          .split(',')
          .flatMap((one) => [one.trim(), `${one.trim()} *`])
          .join(', ');

        rules.push(`${selectors} { font-family: ${FALLBACKS} !important; }`);
      }
    }

    let element = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!element) {
      element = document.createElement('style');
      element.id = STYLE_ELEMENT_ID;
      document.head.appendChild(element);
    }

    element.textContent = rules.join('\n');
    logger.info(`applied font '${family}'`);
  } catch (err) {
    logger.error('failed to apply font', err);
  }
}

export default definePlugin({
  name: 'Fonts',
  description: 'Use any font installed on your computer instead of Telegram\'s.',
  authors: ['Draht'],
  enabledByDefault: false,

  settings,

  start() {
    apply();
  },

  stop() {
    clear();
  },
});
