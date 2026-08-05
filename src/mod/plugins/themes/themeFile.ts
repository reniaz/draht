import type { ModTheme, ThemeSeed } from './themes';

import { DEFAULT_SEED, SEED_LABELS } from './themes';

/**
 * Draht's theme file format.
 *
 * ```json
 * {
 *   "name": "Example",
 *   "author": "you",
 *   "colors": {
 *     "background": "#1b1d21",
 *     "surface":    "#23262b",
 *     ...
 *   }
 * }
 * ```
 *
 * Ten colours, plain hex, one object. Everything else Telegram needs is derived from
 * them, so a theme stays something a person can read and edit by hand.
 *
 * Parsing is forgiving where being strict would only annoy — flat files without a
 * `colors` wrapper are accepted, keys are matched case-insensitively, a missing `#` is
 * added, and `3`-digit hex is expanded. Anything genuinely wrong is reported with the key
 * that caused it, because "invalid theme" tells you nothing when you have ten to check.
 */

const KEYS = Object.keys(SEED_LABELS) as (keyof ThemeSeed)[];

export type ThemeFile = {
  name?: string;
  author?: string;
  colors?: Record<string, string>;
} & Record<string, unknown>;

function normalizeHex(raw: unknown, key: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`"${key}" must be a colour like "#1b1d21"`);
  }

  let value = raw.trim();
  if (!value.startsWith('#')) value = `#${value}`;

  if (/^#[0-9a-f]{3}$/i.test(value)) {
    // #abc -> #aabbcc
    value = `#${value.slice(1).split('').map((c) => c + c).join('')}`;
  }

  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`"${key}" is not a 6-digit hex colour (got "${raw}")`);
  }

  return value.toLowerCase();
}

/** Case-insensitive lookup, so `Background` and `background` both work. */
function pick(source: Record<string, unknown>, key: string) {
  if (key in source) return source[key];

  const match = Object.keys(source).find((k) => k.toLowerCase() === key.toLowerCase());
  return match ? source[match] : undefined;
}

export function parseThemeFile(raw: string, fallbackId: string): ModTheme {
  let parsed: ThemeFile;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Not valid JSON — ${err instanceof Error ? err.message : 'check for a stray comma'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expected an object with a "colors" block');
  }

  // Flat files are accepted too; the wrapper is a convention, not a requirement.
  const colors = (parsed.colors && typeof parsed.colors === 'object')
    ? parsed.colors as Record<string, unknown>
    : parsed as Record<string, unknown>;

  const seed = { ...DEFAULT_SEED };
  const missing: string[] = [];

  for (const key of KEYS) {
    const value = pick(colors, key);
    if (value === undefined) {
      missing.push(key);
      continue;
    }
    seed[key] = normalizeHex(value, key);
  }

  // Missing colours fall back to the default palette rather than failing outright, so a
  // partial theme still works while you build it up.
  if (missing.length === KEYS.length) {
    throw new Error(`No colours found. Expected keys: ${KEYS.join(', ')}`);
  }

  const name = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim()
    : fallbackId;

  return { id: fallbackId, label: name, seed };
}

/** Writes a theme back out in the same format, for the export button. */
export function stringifyTheme(name: string, seed: ThemeSeed) {
  return `${JSON.stringify({
    name,
    colors: Object.fromEntries(KEYS.map((key) => [key, seed[key]])),
  }, undefined, 2)}\n`;
}
