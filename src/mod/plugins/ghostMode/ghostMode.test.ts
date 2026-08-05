import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';



const STORAGE_KEY = 'draht-settings';

async function bootWith(stored: Record<string, any>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ plugins: stored }));
  vi.resetModules();

  const plugin = (await import('./index')).default;
  const api = await import('../../api/ApiGuard');
  const { initPlugins } = await import('../../api/PluginManager');

  initPlugins({ [plugin.name]: plugin } as any);

  return { plugin, api };
}

describe('GhostMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('blocks all three by default when enabled', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: true } });

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(true);
    expect(api.isApiMethodBlocked('markMessagesRead')).toBe(true);
    expect(api.isApiMethodBlocked('updateIsOnline')).toBe(true);
  });

  it('blocks nothing when the plugin is disabled', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: false } });

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(false);
    expect(api.isApiMethodBlocked('updateIsOnline')).toBe(false);
  });

  it('honours each switch independently', async () => {
    const { api } = await bootWith({
      GhostMode: { enabled: true, hideTyping: true, hideReadReceipts: false, hideOnlineStatus: false },
    });

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(true);
    expect(api.isApiMethodBlocked('markMessagesRead')).toBe(false);
    expect(api.isApiMethodBlocked('updateIsOnline')).toBe(false);
  });

  it('never blocks anything it was not asked to', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: true } });

    // A blanket block would break the client entirely.
    expect(api.isApiMethodBlocked('sendMessage')).toBe(false);
    expect(api.isApiMethodBlocked('fetchMessages')).toBe(false);
  });

  it('releases every block when stopped', async () => {
    const { plugin, api } = await bootWith({ GhostMode: { enabled: true } });
    const { stopPlugin } = await import('../../api/PluginManager');

    stopPlugin(plugin);

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(false);
    expect(api.isApiMethodBlocked('markMessagesRead')).toBe(false);
    expect(api.isApiMethodBlocked('updateIsOnline')).toBe(false);
  });
});

describe('ApiGuard ownership', () => {
  it('keeps a block while another owner still wants it', async () => {
    vi.resetModules();
    const {
      blockApiMethod, unblockApiMethod, isApiMethodBlocked: isBlocked,
    } = await import('../../api/ApiGuard');

    blockApiMethod('PluginA', 'someMethod');
    blockApiMethod('PluginB', 'someMethod');

    unblockApiMethod('PluginA', 'someMethod');
    // PluginB still wants it blocked, so one plugin stopping must not undo another's.
    expect(isBlocked('someMethod')).toBe(true);

    unblockApiMethod('PluginB', 'someMethod');
    expect(isBlocked('someMethod')).toBe(false);
  });
});
