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

const STYLE_ELEMENT_ID = 'draht-theme';

function clear() {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

/**
 * Applies the palette as an injected stylesheet with `!important`.
 *
 * The obvious approach — `documentElement.style.setProperty` — loses. telegram-tt writes
 * its own theme colours as inline styles on `<html>` during startup, *after* the mod
 * initialises (the mod deliberately loads first so plugins can register action handlers
 * ahead of upstream's). Our values were simply overwritten, which is why a theme only
 * appeared after toggling the plugin off and on: that re-applied it late enough to win.
 *
 * Racing to run last would be fragile. Instead this sidesteps ordering entirely: per the
 * CSS cascade an `!important` declaration in a stylesheet beats a *normal* inline style,
 * so it does not matter when upstream writes its own values or how often.
 */
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

  element.textContent = `:root {\n${declarations}\n}`;
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
