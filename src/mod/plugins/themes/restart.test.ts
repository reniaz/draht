import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

/**
 * Reproduces a restart: settings already saved in localStorage, then a cold module load
 * with `initPlugins` running exactly as it does from `src/mod/init.ts`.
 *
 * Reported symptom: with the Themes plugin enabled and a theme selected, colours are not
 * applied after restarting — toggling the plugin off and on fixes it. So the question is
 * whether the boot path applies the theme at all.
 */

const STORAGE_KEY = 'draht-settings';

async function bootWith(stored: Record<string, any>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ plugins: stored }));
  document.getElementById('draht-theme')?.remove();

  // A cold load, so module-level state (the settings snapshot) is rebuilt from storage.
  vi.resetModules();

  const themes = (await import('./index')).default;
  const { initPlugins } = await import('../../api/PluginManager');

  initPlugins({ [themes.name]: themes } as any);

  return themes;
}

describe('themes survive a restart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts the plugin when it was left enabled', async () => {
    const plugin = await bootWith({ Themes: { enabled: true, theme: 'caelus' } });

    expect(plugin.started).toBe(true);
  });

  it('applies the saved theme on boot, without any toggling', async () => {
    await bootWith({ Themes: { enabled: true, theme: 'caelus' } });

    const style = document.getElementById('draht-theme');

    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('--color-background');
    // `!important` is what lets this survive upstream writing its own inline styles on
    // <html> after the mod has initialised.
    expect(style!.textContent).toContain('!important');
  });

  it('starts even if an old setting says it was disabled', async () => {
    const plugin = await bootWith({ Themes: { enabled: false, theme: 'caelus' } });

    // Themes is `required`: "Default" in the theme list is what turns colouring off, so a
    // stale disabled flag must not leave a chosen theme silently doing nothing.
    expect(plugin.started).toBe(true);
    expect(document.getElementById('draht-theme')).not.toBeNull();
  });

  it('applies nothing when the theme is off', async () => {
    await bootWith({ Themes: { enabled: true, theme: 'off' } });

    expect(document.getElementById('draht-theme')).toBeNull();
  });

  it('cannot be turned off', async () => {
    const plugin = await bootWith({ Themes: { theme: 'caelus' } });
    const { isPluginEnabled, setPluginEnabled } = await import('../../api/PluginManager');

    setPluginEnabled(plugin.name, false);

    expect(isPluginEnabled('Themes')).toBe(true);
    expect(document.getElementById('draht-theme')).not.toBeNull();
  });
});
