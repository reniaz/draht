import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

// The plugin asserts offline through the real API entry point. Recording the calls is the
// only way to test the part that broke: the assertion has to happen at all, and at the
// right moments.
const { calls } = vi.hoisted(() => ({ calls: [] as any[][] }));

vi.mock('../../../api/gramjs', () => ({
  callApi: (...args: any[]) => {
    calls.push(args);
    return Promise.resolve(undefined);
  },
}));

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

  it('blocks typing and every read path by default', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: true } });

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(true);
    // markMessageListRead is what runs when you open a chat — the one that matters.
    expect(api.isApiMethodBlocked('markMessageListRead')).toBe(true);
    expect(api.isApiMethodBlocked('markMessagesRead')).toBe(true);
    expect(api.isApiMethodBlocked('readAllMentions')).toBe(true);
    expect(api.isApiMethodBlocked('readAllReactions')).toBe(true);
  });

  it('rewrites the online status to offline rather than dropping it', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: true } });

    // Dropping the call would only make the client silent; Telegram infers presence from
    // activity, so appearing offline means actively saying so.
    expect(api.interceptApiCall('updateIsOnline', [true])).toEqual([false]);
    expect(api.isApiMethodBlocked('updateIsOnline')).toBe(false);
  });

  it('blocks nothing when the plugin is disabled', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: false } });

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(false);
    expect(api.isApiMethodBlocked('markMessageListRead')).toBe(false);
    expect(api.interceptApiCall('updateIsOnline', [true])).toEqual([true]);
  });

  it('honours each switch independently', async () => {
    const { api } = await bootWith({
      GhostMode: { enabled: true, hideTyping: true, hideReadReceipts: false, hideOnlineStatus: false },
    });

    expect(api.isApiMethodBlocked('sendMessageAction')).toBe(true);
    expect(api.isApiMethodBlocked('markMessageListRead')).toBe(false);
    expect(api.interceptApiCall('updateIsOnline', [true])).toEqual([true]);
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
    expect(api.isApiMethodBlocked('markMessageListRead')).toBe(false);
    expect(api.interceptApiCall('updateIsOnline', [true])).toEqual([true]);
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

describe('staying offline through activity', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asserts offline as soon as it starts', async () => {
    await bootWith({ GhostMode: { enabled: true } });

    expect(calls).toContainEqual(['updateIsOnline', false]);
  });

  it('re-asserts offline after a message is sent', async () => {
    // The reported symptom: texting someone put you back online. Sending carries no
    // status call to rewrite, so the only answer is to say it again afterwards.
    const { api } = await bootWith({ GhostMode: { enabled: true } });
    calls.length = 0;

    const args = api.interceptApiCall('sendMessage', [{ text: 'hi' }]);

    // The request itself must go out exactly as it was.
    expect(args).toEqual([{ text: 'hi' }]);

    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toContainEqual(['updateIsOnline', false]);
  });

  it('keeps asserting past the point the send can have completed', async () => {
    // One assertion races the request it answers: the guard sees the request as it is
    // issued, the server marks you online when it processes it. An assertion that lands
    // first is simply overwritten.
    const { api } = await bootWith({ GhostMode: { enabled: true } });
    calls.length = 0;

    api.interceptApiCall('sendMessage', [{ text: 'hi' }]);

    await vi.advanceTimersByTimeAsync(2000);
    const early = calls.length;

    await vi.advanceTimersByTimeAsync(20_000);

    expect(early).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThan(early);
  });

  it('asserts immediately, without waiting for a timer', async () => {
    // The flip is only as long as the assertion takes to arrive, so it goes out behind
    // the send rather than a second and a half later.
    const { api } = await bootWith({ GhostMode: { enabled: true } });
    calls.length = 0;

    api.interceptApiCall('sendMessage', [{ text: 'hi' }]);

    expect(calls).toContainEqual(['updateIsOnline', false]);
  });

  it('still answers a steady exchange rather than deferring forever', async () => {
    // Coalescing alone means each message restarts the follow-ups and none ever fires, so
    // someone typing continuously would stay visible the whole time.
    const { api } = await bootWith({ GhostMode: { enabled: true } });
    calls.length = 0;

    for (let i = 0; i < 5; i++) {
      api.interceptApiCall('sendMessage', [{ text: String(i) }]);
      // Always shorter than the first follow-up, so only the immediate path can fire.
      await vi.advanceTimersByTimeAsync(300);
    }

    expect(calls.length).toBeGreaterThan(0);
  });

  it('does not turn a fast exchange into a stream of status updates', async () => {
    const { api } = await bootWith({ GhostMode: { enabled: true } });
    calls.length = 0;

    // Ten sends inside one second: the floor allows one immediate assertion.
    for (let i = 0; i < 10; i++) {
      api.interceptApiCall('sendMessage', [{ text: String(i) }]);
      await vi.advanceTimersByTimeAsync(50);
    }

    expect(calls).toHaveLength(1);
  });

  it('keeps asserting on a heartbeat, for activity it cannot see', async () => {
    await bootWith({ GhostMode: { enabled: true } });
    calls.length = 0;

    await vi.advanceTimersByTimeAsync(95_000);

    // Every 30 seconds.
    expect(calls).toHaveLength(3);
  });

  it('asserts nothing while the switch is off', async () => {
    const { api } = await bootWith({
      GhostMode: { enabled: true, hideOnlineStatus: false },
    });
    calls.length = 0;

    api.interceptApiCall('sendMessage', [{ text: 'hi' }]);
    await vi.advanceTimersByTimeAsync(185_000);

    expect(calls).toHaveLength(0);
  });

  it('stops the heartbeat when the plugin stops', async () => {
    const { plugin } = await bootWith({ GhostMode: { enabled: true } });
    const { stopPlugin } = await import('../../api/PluginManager');

    stopPlugin(plugin);
    calls.length = 0;

    await vi.advanceTimersByTimeAsync(185_000);

    expect(calls).toHaveLength(0);
  });
});

describe('sending a read receipt on purpose', () => {
  it('lets exactly one read through and blocks again immediately', async () => {
    // Hiding reads is a default, not a vow — but lifting the block for longer than the
    // one call would let unrelated reads slip out behind it.
    const { api } = await bootWith({ GhostMode: { enabled: true } });
    const { sendReadReceipt } = await import('./readReceipt');

    expect(api.isApiMethodBlocked('markMessageListRead')).toBe(true);

    // No chat in this state, so nothing is sent — but the block must be intact either way.
    sendReadReceipt('GhostMode', '-100123', ['markMessageListRead']);

    expect(api.isApiMethodBlocked('markMessageListRead')).toBe(true);
  });
});
