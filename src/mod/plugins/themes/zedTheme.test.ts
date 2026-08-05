import { describe, expect, it } from 'vitest';

import { buildThemeVars, DEFAULT_SEED } from './themes';
import { convertZedTheme } from './zedTheme';

const minimal = JSON.stringify({
  themes: [{
    name: 'test-theme',
    appearance: 'dark',
    style: {
      accents: ['#b85550', '#b86e38'],
      background: '#1e1f1e',
      'elevated_surface.background': '#272a28',
      border: '#3b403c',
      text: '#baa89a',
      'text.muted': '#72746a',
      'text.accent': '#b86e38',
      'element.background': '#3b403c',
      error: '#b85550',
      success: '#5e9960',
    },
  }],
});

describe('convertZedTheme', () => {
  it('maps surfaces and text into the seed', () => {
    const seed = convertZedTheme(minimal);

    expect(seed.background).toBe('#1e1f1e');
    expect(seed.surface).toBe('#272a28');
    expect(seed.raised).toBe('#3b403c');
    expect(seed.text).toBe('#baa89a');
    expect(seed.textMuted).toBe('#72746a');
  });

  it('splits accents into accent and link', () => {
    const seed = convertZedTheme(minimal);

    expect(seed.accent).toBe('#b85550');
    expect(seed.link).toBe('#b86e38');
  });

  it('composites 8-digit hex against its backdrop', () => {
    const withAlpha = JSON.parse(minimal);
    withAlpha.themes[0].style['element.background'] = '#ffffff80';

    const seed = convertZedTheme(JSON.stringify(withAlpha));

    // The seed is flat hex, so 50% white over the #272a28 surface must be resolved here
    // rather than handed on as rgba.
    expect(seed.raised).toMatch(/^#[0-9a-f]{6}$/);
    expect(seed.raised).toBe('#939594');
  });

  it('accepts a bare theme object as well as a full theme file', () => {
    const bare = JSON.parse(minimal).themes[0];

    expect(convertZedTheme(JSON.stringify(bare)).background).toBe('#1e1f1e');
  });

  it('rejects junk rather than producing a half-built palette', () => {
    expect(() => convertZedTheme('not json')).toThrow(/valid JSON/);
    expect(() => convertZedTheme('{"themes":[{"name":"x"}]}')).toThrow(/style/);
  });

  it('falls back to the default seed for missing keys', () => {
    const sparse = JSON.stringify({ style: { background: '#000000', text: '#ffffff' } });

    const seed = convertZedTheme(sparse);

    expect(seed.background).toBe('#000000');
    expect(seed.error).toBe(DEFAULT_SEED.error);
    expect(Object.values(seed).every((v) => /^#[0-9a-f]{6}$/i.test(v))).toBe(true);
  });
});

describe('buildThemeVars', () => {
  it('expands a seed into Telegram variables', () => {
    const vars = buildThemeVars(DEFAULT_SEED);

    expect(vars['--color-background']).toBe(DEFAULT_SEED.background);
    expect(vars['--color-text']).toBe(DEFAULT_SEED.text);
    expect(vars['--color-primary']).toBe(DEFAULT_SEED.accent);
  });

  it('emits bare triplets for the *-rgb variables', () => {
    const vars = buildThemeVars({ ...DEFAULT_SEED, text: '#baa89a', error: '#b85550' });

    // Consumed inside rgba(), so a hex here would break every rule using them.
    expect(vars['--color-text-rgb']).toBe('186, 168, 154');
    expect(vars['--color-error-rgb']).toBe('184, 85, 80');
  });

  it('lifts every colour when brightness is applied', () => {
    const base = buildThemeVars(DEFAULT_SEED, 0);
    const bright = buildThemeVars(DEFAULT_SEED, 0.2);

    expect(bright['--color-background']).not.toBe(base['--color-background']);
    expect(bright['--color-text']).not.toBe(base['--color-text']);

    // Lifting means moving toward white, so each channel must increase.
    const channel = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(channel(bright['--color-background'])).toBeGreaterThan(channel(base['--color-background']));
  });

  it('produces valid CSS colours for every variable', () => {
    const vars = buildThemeVars(DEFAULT_SEED, 0.15);

    for (const [name, value] of Object.entries(vars)) {
      const isColour = /^#[0-9a-f]{6}$/i.test(value) || value.startsWith('rgba(');
      const isTriplet = /^\d+, \d+, \d+$/.test(value);
      expect(isColour || isTriplet, `${name} = ${value}`).toBe(true);
    }
  });
});
