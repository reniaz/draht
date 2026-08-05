import type { ModTheme, ThemeSeed } from './themes';

import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import { buildThemeVars, DEFAULT_SEED, THEMES } from './themes';
import { parseThemeFile } from './themeFile';
import ThemeEditor from './ThemeEditor';

const logger = modLogger.scoped('Themes');

const STYLE_ELEMENT_ID = 'draht-theme';

/** Themes loaded from the user's themes folder, refreshed at startup. */
let fileThemes: ModTheme[] = [];

export function getAvailableThemes(): ModTheme[] {
  return [...THEMES, ...fileThemes];
}

export function findTheme(id: string) {
  return getAvailableThemes().find((theme) => theme.id === id);
}

/**
 * Reads every JSON file in the themes folder.
 *
 * One bad file must not hide the others, so failures are logged per file and skipped
 * rather than aborting the whole load.
 */
export async function loadFileThemes() {
  const native = window.draht;
  if (!native?.listThemes) return;

  try {
    const files = await native.listThemes();

    fileThemes = files.flatMap(({ file, content }) => {
      const id = `file:${file}`;
      try {
        return [parseThemeFile(content, id)];
      } catch (err) {
        logger.error(`could not read theme '${file}': ${err instanceof Error ? err.message : err}`);
        return [];
      }
    });

    if (fileThemes.length) logger.info(`loaded ${fileThemes.length} theme file(s)`);
  } catch (err) {
    logger.error('could not list themes', err);
  }
}

const settings = definePluginSettings({
  // Held as a plain value and driven by the editor, because the list is dynamic — it
  // grows with whatever is in the themes folder, which a fixed SELECT cannot express.
  theme: {
    type: OptionType.CUSTOM,
    description: 'Selected theme',
    default: 'off',
  },
  brightness: {
    type: OptionType.SLIDER,
    description: 'Lifts every colour toward white. 0 uses the theme as designed.',
    displayName: 'Brightness',
    default: 0,
    min: 0,
    max: 40,
    step: 5,
    unit: '%',
    onChange: () => apply(),
  },
  picker: {
    type: OptionType.COMPONENT,
    description: 'Theme',
    displayName: 'Theme',
    component: ThemeEditor,
  },
  customSeed: {
    type: OptionType.CUSTOM,
    description: 'Colours for the custom theme',
  },
});

function clear() {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

function applySeed(seed: ThemeSeed) {
  const vars = buildThemeVars(seed, (Number(settings.store.brightness) || 0) / 100);

  const declarations = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value} !important;`)
    .join('\n');

  let element = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement('style');
    element.id = STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }

  // `!important` in a stylesheet beats a normal inline style, which is what telegram-tt
  // writes on <html> during startup — after the mod initialises. Without this the theme
  // is applied and then silently overwritten on every cold start.
  element.textContent = `:root {\n${declarations}\n}`;
}

export function apply() {
  try {
    const selected = settings.store.theme || 'off';

    if (selected === 'off') {
      clear();
      return;
    }

    if (selected === 'custom') {
      let seed = DEFAULT_SEED;
      try {
        seed = { ...DEFAULT_SEED, ...JSON.parse(settings.store.customSeed || '{}') };
      } catch {
        // A half-typed seed should not blank the UI; fall back to the default palette.
      }
      applySeed(seed);
      return;
    }

    const theme = findTheme(selected);
    if (theme) applySeed(theme.seed);
    else clear();
  } catch (err) {
    logger.error('failed to apply theme', err);
  }
}

export default definePlugin({
  name: 'Themes',
  description:
    'Custom colourschemes. Ships with caelus, accepts theme files from your themes '
    + 'folder, or pick your own colours. Works best with Telegram\'s Dark theme.',
  authors: ['Draht'],
  // Always on. "Default" in the theme list is what turns custom colouring off, so a
  // separate switch would be a second way to express the same thing — and an easy way to
  // end up with a chosen theme that silently does nothing.
  required: true,

  settings,

  start() {
    // Applied immediately from the saved id so there is no flash of the default palette,
    // then again once the folder has been read, in case the saved theme lives there.
    apply();
    void loadFileThemes().then(apply);
  },

  stop() {
    clear();
  },
});
