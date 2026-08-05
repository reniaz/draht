/**
 * A theme is defined by a handful of semantic colours, not by the ~50 CSS variables
 * Telegram actually reads.
 *
 * Everything else is derived. That is what makes a colour picker usable — editing eleven
 * swatches is a reasonable thing to ask of someone, editing fifty is not — and it keeps
 * derived relationships (hover states, tints, rgb companions) internally consistent
 * instead of leaving the user to keep them in sync by hand.
 */
export type ThemeSeed = {
  /** Page background — the deepest surface. */
  background: string;
  /** Panels, incoming message bubbles, menus. */
  surface: string;
  /** Raised elements: own bubbles, hover states, selected rows. */
  raised: string;
  /** Dividers and outlines. */
  border: string;
  /** Primary text. */
  text: string;
  /** Timestamps, secondary labels, icons. */
  textMuted: string;
  /** Buttons, active states, unread badges. */
  accent: string;
  /** Links and code. */
  link: string;
  error: string;
  success: string;
  /** Deleted messages kept by MessageLogger. Distinct from `error` so a theme can make
   *  "this was deleted" read differently from "something went wrong". */
  deleted: string;
};

export type ModTheme = {
  id: string;
  label: string;
  seed: ThemeSeed;
};

/* ---------- colour helpers ---------- */

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;

  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function triplet(hex: string) {
  return parseHex(hex).join(', ');
}

/** Blends two colours. `amount` 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, amount: number) {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);

  return toHex([
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  ]);
}

export function lighten(hex: string, amount: number) {
  return mix(hex, '#ffffff', amount);
}

export function rgba(hex: string, alpha: number) {
  return `rgba(${triplet(hex)}, ${alpha})`;
}

/* ---------- seed -> CSS variables ---------- */

/**
 * Expands a seed into the variables Telegram reads.
 *
 * `brightness` lifts every colour toward white by that fraction, which is a single dial
 * for "a bit lighter overall" rather than ten separate edits.
 */
export function buildThemeVars(seed: ThemeSeed, brightness = 0): Record<string, string> {
  const b = Math.max(0, Math.min(0.5, brightness));
  const lift = (hex: string) => (b ? lighten(hex, b) : hex);

  const background = lift(seed.background);
  const surface = lift(seed.surface);
  const raised = lift(seed.raised);
  const border = lift(seed.border);
  const text = lift(seed.text);
  const textMuted = lift(seed.textMuted);
  const accent = lift(seed.accent);
  const link = lift(seed.link);
  const error = lift(seed.error);
  const success = lift(seed.success);
  const deleted = lift(seed.deleted ?? seed.error);

  // Derived steps, so hover/active states stay consistent with whatever the user picked.
  const surfaceHover = mix(surface, text, 0.06);
  const raisedHover = mix(raised, text, 0.08);
  const subtle = mix(background, surface, 0.6);

  return {
    // Surfaces
    '--color-background': background,
    '--color-background-secondary': surface,
    '--color-background-secondary-accent': subtle,
    '--color-background-selected': raised,
    '--color-background-compact-menu': surface,
    '--color-background-compact-menu-reactions': surface,
    '--color-background-compact-menu-hover': rgba(text, 0.08),
    '--color-background-menu-separator': rgba(text, 0.1),

    // Message bubbles
    '--color-background-own': raised,
    '--color-background-own-apple': raised,
    '--color-background-own-selected': raisedHover,
    '--color-accent-own': text,
    '--color-accent-own-rgb': triplet(text),
    '--color-message-meta-own': rgba(text, 0.55),
    '--color-own-links': link,
    '--color-reply-hover': surfaceHover,
    '--color-reply-active': raised,
    '--color-reply-own-hover': raisedHover,
    '--color-reply-own-hover-apple': raisedHover,
    '--color-reply-own-active': raisedHover,
    '--color-reply-own-active-apple': raisedHover,

    // Chat list and generic rows
    '--color-chat-hover': surfaceHover,
    '--color-chat-active': raised,
    '--color-chat-active-greyed': raisedHover,
    '--color-chat-username': text,
    '--color-item-hover': surfaceHover,
    '--color-item-active': subtle,

    // Text
    '--color-text': text,
    '--color-text-rgb': triplet(text),
    '--color-text-secondary': textMuted,
    '--color-text-secondary-rgb': triplet(textMuted),
    '--color-text-secondary-apple': textMuted,
    '--color-text-meta': textMuted,
    '--color-text-meta-rgb': triplet(textMuted),
    '--color-text-meta-colored': link,
    '--color-icon-secondary': textMuted,
    '--color-composer-button': textMuted,
    '--color-gray': textMuted,
    '--color-list-icon': textMuted,
    '--color-placeholders': mix(textMuted, background, 0.35),

    // Lines
    '--color-borders': border,
    '--color-borders-input': mix(border, text, 0.2),
    '--color-borders-alternate': subtle,
    '--color-dividers': subtle,
    '--color-dividers-android': subtle,

    // Accents
    '--color-primary': accent,
    '--color-primary-shade': mix(accent, '#000000', 0.12),
    '--color-primary-shade-darker': mix(accent, '#000000', 0.24),
    '--color-primary-shade-rgb': triplet(mix(accent, '#000000', 0.12)),
    '--color-active': accent,
    '--color-links': link,
    '--color-code': link,
    '--color-code-own': lighten(link, 0.25),
    '--color-code-bg': rgba('#000000', 0.3),
    '--color-code-own-bg': rgba('#000000', 0.22),

    // Status
    '--color-error': error,
    '--color-error-rgb': triplet(error),
    '--color-error-shade': mix(error, '#000000', 0.12),
    '--color-success': success,
    '--color-warning': link,

    // Reactions
    '--color-message-reaction': subtle,
    '--color-message-reaction-hover': raised,
    '--color-message-reaction-own': raised,
    '--color-message-reaction-hover-own': raisedHover,
    '--color-message-reaction-chosen-hover': accent,
    '--color-message-reaction-chosen-hover-own': lighten(accent, 0.15),
    '--color-message-non-contact': success,
    '--color-voice-transcribe-button': subtle,
    '--color-voice-transcribe-button-own': raisedHover,

    // MessageLogger. Namespaced rather than overriding a Telegram variable, since nothing
    // upstream has a concept of a deleted-but-still-visible message.
    '--draht-deleted': deleted,
    '--draht-deleted-rgb': triplet(deleted),

    // Shadows
    '--color-default-shadow': rgba('#000000', 0.5),
    '--color-light-shadow': rgba('#000000', 0.22),
  };
}

/* ---------- bundled themes ---------- */

/**
 * caelus — warm, muted, dark. Adapted from the palette of the same name by dacctal.
 *
 * Lifted a step from the original: those values were tuned for a mostly-static page of
 * text, and in a chat client — denser, with far more chrome — they read as murkier than
 * intended.
 */
const CAELUS: ThemeSeed = {
  background: '#262726',
  surface: '#2f3230',
  raised: '#434844',
  border: '#434844',
  text: '#c6b4a6',
  textMuted: '#808278',
  accent: '#c05f5a',
  link: '#c47a42',
  error: '#c05f5a',
  success: '#6aa76c',
  deleted: '#c05f5a',
};

/**
 * Telegram's own dark palette, as the reset target.
 *
 * Values read from `src/styles/index.scss` (the `.component-theme-dark` block) and
 * `_variables.scss`, so resetting lands on what Telegram actually looks like rather than
 * on a neutral guess.
 */
export const TELEGRAM_DARK: ThemeSeed = {
  background: '#212121',
  surface: '#0f0f0f',
  raised: '#2c2c2c',
  border: '#303030',
  text: '#ffffff',
  textMuted: '#aaaaaa',
  accent: '#8774e1',
  link: '#8774e1',
  error: '#e53935',
  success: '#00c73e',
  deleted: '#e53935',
};


/**
 * Well-known palettes, mapped onto the seed.
 *
 * Each uses its project's published values. The mapping is interpretive where a palette
 * has no direct equivalent — none of them were designed with chat bubbles or a chat list
 * in mind — so the rule followed is: `background` is the canonical base, `surface` steps
 * once away from it, `raised` once further, and the muted text tone is whatever that
 * palette uses for comments.
 */
const CATPPUCCIN_MOCHA: ThemeSeed = {
  background: '#1e1e2e',
  surface: '#181825',
  raised: '#313244',
  border: '#313244',
  text: '#cdd6f4',
  textMuted: '#a6adc8',
  accent: '#cba6f7',
  link: '#89b4fa',
  error: '#f38ba8',
  success: '#a6e3a1',
  deleted: '#f38ba8',
};

const NORD: ThemeSeed = {
  background: '#2e3440',
  surface: '#3b4252',
  raised: '#434c5e',
  border: '#4c566a',
  text: '#eceff4',
  textMuted: '#81a1c1',
  accent: '#88c0d0',
  link: '#8fbcbb',
  error: '#bf616a',
  success: '#a3be8c',
  deleted: '#bf616a',
};

const GRUVBOX_DARK: ThemeSeed = {
  background: '#282828',
  surface: '#32302f',
  raised: '#3c3836',
  border: '#504945',
  text: '#ebdbb2',
  textMuted: '#928374',
  accent: '#fe8019',
  link: '#83a598',
  error: '#fb4934',
  success: '#b8bb26',
  deleted: '#fb4934',
};

const DRACULA: ThemeSeed = {
  background: '#282a36',
  surface: '#21222c',
  raised: '#44475a',
  border: '#44475a',
  text: '#f8f8f2',
  textMuted: '#6272a4',
  accent: '#bd93f9',
  link: '#8be9fd',
  error: '#ff5555',
  success: '#50fa7b',
  deleted: '#ff79c6',
};

const TOKYO_NIGHT: ThemeSeed = {
  background: '#1a1b26',
  surface: '#16161e',
  raised: '#292e42',
  border: '#292e42',
  text: '#c0caf5',
  textMuted: '#565f89',
  accent: '#7aa2f7',
  link: '#7dcfff',
  error: '#f7768e',
  success: '#9ece6a',
  deleted: '#f7768e',
};

const ROSE_PINE: ThemeSeed = {
  background: '#191724',
  surface: '#1f1d2e',
  raised: '#26233a',
  border: '#26233a',
  text: '#e0def4',
  textMuted: '#908caa',
  accent: '#c4a7e7',
  link: '#9ccfd8',
  error: '#eb6f92',
  success: '#31748f',
  deleted: '#eb6f92',
};

const EVERFOREST_DARK: ThemeSeed = {
  background: '#2d353b',
  surface: '#343f44',
  raised: '#3d484d',
  border: '#4f585e',
  text: '#d3c6aa',
  textMuted: '#859289',
  accent: '#a7c080',
  link: '#7fbbb3',
  error: '#e67e80',
  success: '#a7c080',
  deleted: '#e67e80',
};

export const DEFAULT_SEED = CAELUS;

export const THEMES: ModTheme[] = [
  { id: 'caelus', label: 'caelus', seed: CAELUS },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', seed: CATPPUCCIN_MOCHA },
  { id: 'nord', label: 'Nord', seed: NORD },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', seed: GRUVBOX_DARK },
  { id: 'dracula', label: 'Dracula', seed: DRACULA },
  { id: 'tokyo-night', label: 'Tokyo Night', seed: TOKYO_NIGHT },
  { id: 'rose-pine', label: 'Rosé Pine', seed: ROSE_PINE },
  { id: 'everforest-dark', label: 'Everforest Dark', seed: EVERFOREST_DARK },
];

export function getTheme(id: string) {
  return THEMES.find((theme) => theme.id === id);
}

export const SEED_LABELS: Record<keyof ThemeSeed, string> = {
  background: 'Background',
  surface: 'Panels & bubbles',
  raised: 'Own messages & hover',
  border: 'Borders',
  text: 'Text',
  textMuted: 'Secondary text',
  accent: 'Accent',
  link: 'Links',
  error: 'Errors',
  success: 'Success',
  deleted: 'Deleted messages',
};
