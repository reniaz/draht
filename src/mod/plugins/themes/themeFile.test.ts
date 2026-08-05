import { describe, expect, it } from 'vitest';

import { buildThemeVars, DEFAULT_SEED } from './themes';
import { parseThemeFile, stringifyTheme } from './themeFile';

const full = JSON.stringify({
  name: 'Example',
  author: 'you',
  colors: {
    background: '#1b1d21',
    surface: '#23262b',
    raised: '#2f333a',
    border: '#2f333a',
    text: '#d7dce3',
    textMuted: '#8b93a1',
    accent: '#6ea8fe',
    link: '#6ea8fe',
    error: '#e06c75',
    success: '#77c17d',
    deleted: '#c678dd',
  },
});

describe('parseThemeFile', () => {
  it('reads a complete theme', () => {
    const theme = parseThemeFile(full, 'file:example.json');

    expect(theme.label).toBe('Example');
    expect(theme.id).toBe('file:example.json');
    expect(theme.seed.background).toBe('#1b1d21');
    expect(theme.seed.accent).toBe('#6ea8fe');
  });

  it('accepts a flat file without the colors wrapper', () => {
    const flat = JSON.stringify({ name: 'Flat', background: '#101010', text: '#ffffff' });

    expect(parseThemeFile(flat, 'x').seed.background).toBe('#101010');
  });

  it('accepts shorthand hex and a missing hash', () => {
    const loose = JSON.stringify({ colors: { background: 'abc', text: '#FFF' } });
    const { seed } = parseThemeFile(loose, 'x');

    expect(seed.background).toBe('#aabbcc');
    expect(seed.text).toBe('#ffffff');
  });

  it('matches keys case-insensitively', () => {
    const shouty = JSON.stringify({ colors: { Background: '#123456', TEXTMUTED: '#654321' } });
    const { seed } = parseThemeFile(shouty, 'x');

    expect(seed.background).toBe('#123456');
    expect(seed.textMuted).toBe('#654321');
  });

  it('fills missing colours from the default palette', () => {
    const partial = JSON.stringify({ name: 'Partial', colors: { background: '#000000' } });
    const { seed } = parseThemeFile(partial, 'x');

    // A theme half-written should still be usable while you finish it.
    expect(seed.background).toBe('#000000');
    expect(seed.accent).toBe(DEFAULT_SEED.accent);
  });

  it('falls back to the file id when no name is given', () => {
    expect(parseThemeFile(JSON.stringify({ colors: { background: '#000000' } }), 'file:a.json').label)
      .toBe('file:a.json');
  });

  it('names the offending key when a colour is wrong', () => {
    const bad = JSON.stringify({ colors: { background: 'not-a-colour' } });

    // "Invalid theme" is useless when there are ten colours to check.
    expect(() => parseThemeFile(bad, 'x')).toThrow(/background/);
  });

  it('explains malformed JSON rather than throwing a raw parse error', () => {
    expect(() => parseThemeFile('{ nope', 'x')).toThrow(/Not valid JSON/);
  });

  it('rejects a file with no recognised colours', () => {
    expect(() => parseThemeFile(JSON.stringify({ name: 'Nothing' }), 'x')).toThrow(/No colours/);
  });

  it('round-trips through stringifyTheme', () => {
    const theme = parseThemeFile(full, 'x');
    const rewritten = parseThemeFile(stringifyTheme('Example', theme.seed), 'x');

    expect(rewritten.seed).toEqual(theme.seed);
    expect(rewritten.label).toBe('Example');
  });

  it('carries a distinct colour for deleted messages', () => {
    const { seed } = parseThemeFile(full, 'x');
    const vars = buildThemeVars(seed);

    // Separate from `error`, so "deleted" and "something broke" can look different.
    expect(seed.deleted).toBe('#c678dd');
    expect(vars['--draht-deleted']).toBe('#c678dd');
    expect(vars['--draht-deleted']).not.toBe(vars['--color-error']);
  });

  it('falls back to the error colour when a theme omits deleted', () => {
    const older = JSON.stringify({ colors: { background: '#000000', error: '#ff0000' } });
    const { seed } = parseThemeFile(older, 'x');

    // Older theme files must keep working.
    expect(seed.deleted).toBeDefined();
  });

  it('produces a usable palette', () => {
    const vars = buildThemeVars(parseThemeFile(full, 'x').seed);

    expect(vars['--color-background']).toBe('#1b1d21');
    expect(vars['--color-text-rgb']).toMatch(/^\d+, \d+, \d+$/);
  });
});
