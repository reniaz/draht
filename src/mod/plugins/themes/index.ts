import type { ThemeSeed } from './themes';

import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import { buildThemeVars, DEFAULT_SEED, getTheme, THEMES } from './themes';
import ThemeEditor from './ThemeEditor';

const logger = modLogger.scoped('Themes');

const settings = definePluginSettings({
  theme: {
    type: OptionType.SELECT,
    description: 'Colourscheme applied on top of Telegram\'s own theme',
    options: [
      { label: 'Off', value: 'off', default: true },
      ...THEMES.map((theme) => ({ label: theme.label, value: theme.id })),
      { label: 'Custom', value: 'custom' },
    ],
    onChange: () => apply(),
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
  customSeed: {
    type: OptionType.COMPONENT,
    description: 'Custom colours',
    displayName: 'Custom colours',
    component: ThemeEditor,
    hidden() {
      return this.store.theme !== 'custom';
    },
  },
});

/** Properties currently written to <html>, so they can be removed exactly. */
let applied: string[] = [];

function clear() {
  const { style } = document.documentElement;
  applied.forEach((name) => style.removeProperty(name));
  applied = [];
}

function applySeed(seed: ThemeSeed) {
  clear();

  const { style } = document.documentElement;
  const vars = buildThemeVars(seed, (Number(settings.store.brightness) || 0) / 100);

  // Inline properties on <html> rather than an injected stylesheet: Telegram's own
  // palette is defined on `.component-theme-dark`, and an inline declaration outranks any
  // class selector without needing `!important` or specificity games.
  for (const [name, value] of Object.entries(vars)) {
    style.setProperty(name, value);
    applied.push(name);
  }
}

function apply() {
  try {
    const selected = settings.store.theme;

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

    const theme = getTheme(selected);
    if (theme) applySeed(theme.seed);
  } catch (err) {
    logger.error('failed to apply theme', err);
  }
}

export default definePlugin({
  name: 'Themes',
  description:
    'Custom colourschemes. Ships with caelus, or pick your own colours. '
    + 'Works best with Telegram\'s Dark theme (Settings > General).',
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
