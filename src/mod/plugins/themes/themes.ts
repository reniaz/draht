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

export const DEFAULT_SEED = CAELUS;

export const THEMES: ModTheme[] = [
  { id: 'caelus', label: 'caelus', seed: CAELUS },
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
