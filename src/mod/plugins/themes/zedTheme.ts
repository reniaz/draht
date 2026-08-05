import type { ThemeSeed } from './themes';

import { DEFAULT_SEED } from './themes';

/**
 * Reads a Zed editor theme into a {@link ThemeSeed}.
 *
 * Zed themes are plentiful and easy to hand-edit, which makes them a convenient way to
 * *populate* the colour picker — but they are not the theme format here. The output is
 * the same ten-colour seed the picker edits, so an imported theme is immediately
 * adjustable rather than opaque.
 *
 * The mapping is interpretive: Zed has no message bubbles or chat rows, so `element`
 * becomes the raised surface and the first accent becomes the primary colour.
 *
 * Accepts a full theme file (a `themes` array) or a single theme object.
 */

/** Zed allows `#RRGGBBAA`; the seed is flat hex, so alpha is composited out. */
function normalize(color: unknown, over: string): string | undefined {
  if (typeof color !== 'string') return undefined;

  const hex = color.trim();
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return undefined;
  if (hex.length === 7) return hex.toLowerCase();

  const alpha = parseInt(hex.slice(7, 9), 16) / 255;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [br, bg, bb] = [1, 3, 5].map((i) => parseInt(over.slice(i, i + 2), 16));

  const blend = (fg: number, back: number) => Math.round(fg * alpha + back * (1 - alpha));

  return `#${[blend(r, br), blend(g, bg), blend(b, bb)]
    .map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function convertZedTheme(raw: string): ThemeSeed {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Not valid JSON');
  }

  const theme = Array.isArray(parsed?.themes) ? parsed.themes[0] : parsed;
  const style = theme?.style;

  if (!style || typeof style !== 'object') {
    throw new Error('No theme style found — expected a Zed theme with a "style" object');
  }

  const accents: unknown[] = Array.isArray(style.accents) ? style.accents : [];

  const background = normalize(style.background, '#000000') ?? DEFAULT_SEED.background;
  const surface = normalize(style['elevated_surface.background'], background)
    ?? normalize(style['surface.background'], background)
    ?? background;
  const raised = normalize(style['element.background'], surface) ?? surface;
  const border = normalize(style.border, surface) ?? raised;
  const text = normalize(style.text, background) ?? DEFAULT_SEED.text;
  const textMuted = normalize(style['text.muted'], background) ?? text;

  const accent = normalize(accents[0], background)
    ?? normalize(style['border.focused'], background)
    ?? DEFAULT_SEED.accent;
  const link = normalize(style['text.accent'], background)
    ?? normalize(accents[1], background)
    ?? accent;

  return {
    background,
    surface,
    raised,
    border,
    text,
    textMuted,
    accent,
    link,
    error: normalize(style.error, background) ?? DEFAULT_SEED.error,
    success: normalize(style.success, background) ?? DEFAULT_SEED.success,
  };
}
