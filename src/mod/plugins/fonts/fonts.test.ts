import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

/**
 * The font must apply on a cold start without any interaction, so these boot the plugin
 * from saved settings exactly as `src/mod/init.ts` does.
 *
 * Note the plugin never calls `queryLocalFonts` here: listing fonts is only needed by the
 * picker. Applying one is just a CSS variable, so startup does not depend on that API
 * being available — which is what keeps this working before the settings screen is ever
 * opened.
 */

const STORAGE_KEY = 'draht-settings';

async function bootWith(stored: Record<string, any>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ plugins: stored }));
  document.getElementById('draht-font')?.remove();

  vi.resetModules();

  const fonts = (await import('./index')).default;
  const { initPlugins } = await import('../../api/PluginManager');

  initPlugins({ [fonts.name]: fonts } as any);

  return fonts;
}

function styleText() {
  return document.getElementById('draht-font')?.textContent ?? '';
}

describe('Fonts plugin', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('applies the saved font on boot', async () => {
    await bootWith({ Fonts: { enabled: true, fontFamily: 'Cascadia Code' } });

    expect(styleText()).toContain('"Cascadia Code"');
    // Must outrank upstream's own inline styles, same as the Themes plugin.
    expect(styleText()).toContain('!important');
  });

  it('keeps the emoji fallbacks behind the chosen font', async () => {
    await bootWith({ Fonts: { enabled: true, fontFamily: 'Cascadia Code' } });

    // Dropping these renders emoji as monochrome glyphs.
    expect(styleText()).toContain('Apple Color Emoji');
    expect(styleText()).toContain('Segoe UI Emoji');
  });

  it('applies nothing when no font is chosen', async () => {
    await bootWith({ Fonts: { enabled: true, fontFamily: '' } });

    expect(document.getElementById('draht-font')).toBeNull();
  });

  it('applies nothing when the plugin is disabled', async () => {
    await bootWith({ Fonts: { enabled: false, fontFamily: 'Cascadia Code' } });

    expect(document.getElementById('draht-font')).toBeNull();
  });

  it('covers message text when applyToMessages is on', async () => {
    await bootWith({ Fonts: { enabled: true, fontFamily: 'Arial', applyToMessages: true } });

    expect(styleText()).toContain('.Message');
  });

  it('leaves message text alone when applyToMessages is off', async () => {
    await bootWith({ Fonts: { enabled: true, fontFamily: 'Arial', applyToMessages: false } });

    expect(styleText()).toContain('--font-family');
    expect(styleText()).not.toContain('.Message');
  });

  it('does not let a font name break out of the CSS string', async () => {
    await bootWith({ Fonts: { enabled: true, fontFamily: 'Ev"il' } });

    expect(styleText()).not.toContain('Ev"il');
    expect(styleText()).toContain('"Evil"');
  });

  it('removes its stylesheet when stopped', async () => {
    const plugin = await bootWith({ Fonts: { enabled: true, fontFamily: 'Arial' } });
    const { stopPlugin } = await import('../../api/PluginManager');

    stopPlugin(plugin);

    expect(document.getElementById('draht-font')).toBeNull();
  });
});
