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

  it('applies nothing when the plugin was left disabled', async () => {
    await bootWith({ Themes: { enabled: false, theme: 'caelus' } });

    expect(document.getElementById('draht-theme')).toBeNull();
  });

  it('applies nothing when the theme is off', async () => {
    await bootWith({ Themes: { enabled: true, theme: 'off' } });

    expect(document.getElementById('draht-theme')).toBeNull();
  });

  it('persists an enabled toggle to localStorage', async () => {
    const plugin = await bootWith({});
    const { setPluginEnabled } = await import('../../api/PluginManager');

    setPluginEnabled(plugin.name, true);

    // The write is debounced, so it has to be flushed before it can be observed.
    await new Promise((r) => { setTimeout(r, 250); });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(saved.plugins?.Themes?.enabled).toBe(true);
  });
});
