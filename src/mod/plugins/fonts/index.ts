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
 * the chosen font is prepended to this list rather than replacing it.
 */
const FALLBACKS = '"Roboto", -apple-system, BlinkMacSystemFont, "Apple Color Emoji", '
  + '"Segoe UI", "Segoe UI Emoji", Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", '
  + '"Helvetica Neue", sans-serif';

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
    description: 'Also use it for message text (off keeps messages in Telegram\'s font)',
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
 */
function apply() {
  try {
    const family = (settings.store.fontFamily || '').trim();

    if (!family) {
      clear();
      return;
    }

    const stack = `"${family.replace(/"/g, '')}", ${FALLBACKS}`;

    const rules = [`:root { --font-family: ${stack} !important; }`];

    if (settings.store.applyToMessages) {
      // Message text is styled from its own variable in some places, so cover both.
      rules.push(`.Message, .text-content, .message-content { font-family: ${stack} !important; }`);
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
