import { describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'draht-settings';

async function bootWith(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ plugins: { OpenAtNewest: { enabled } } }));
  vi.resetModules();

  const plugin = (await import('./index')).default;
  const seams = await import('../../api/Seams');
  const { initPlugins } = await import('../../api/PluginManager');

  initPlugins({ [plugin.name]: plugin } as any);

  return { plugin, seams };
}

describe('OpenAtNewest', () => {
  it('suppresses the unread marker', async () => {
    // The seam is consulted inside a selector and has no other observable effect, so
    // nothing but this says whether the plugin is connected to it at all.
    const { seams } = await bootWith(true);

    expect(seams.runSuppressFirstUnread()).toBe(true);
  });

  it("leaves upstream's behaviour alone when disabled", async () => {
    const { seams } = await bootWith(false);

    expect(seams.runSuppressFirstUnread()).toBe(false);
  });

  it('releases the seam when stopped', async () => {
    const { plugin, seams } = await bootWith(true);
    const { stopPlugin } = await import('../../api/PluginManager');

    stopPlugin(plugin);

    expect(seams.runSuppressFirstUnread()).toBe(false);
  });
});
