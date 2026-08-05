import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../../global/types';

/**
 * Upstream's reducers/selectors are mocked rather than imported.
 *
 * `global/reducers/messages` transitively imports the gramjs connector, which probes a
 * long tail of browser capabilities at module scope (matchMedia, CSS.supports, canvas,
 * ...). Polyfilling all of that into jsdom would be chasing upstream's environment
 * forever, and it is not what these tests are about: the thing worth pinning down is the
 * mod's own partition and bypass semantics, not that upstream's reducer works.
 *
 * The mocks mirror the real contracts: `selectChatMessage` reads from
 * `messages.byChatId[chatId].byId[id]`, and `updateChatMessage` returns a new state with
 * the update merged onto that message.
 */
vi.mock('../../../global/selectors/messages', () => ({
  selectChatMessage: (global: any, chatId: string, id: number) => (
    global.messages.byChatId[chatId]?.byId[id]
  ),
  selectCommonBoxChatId: (global: any, id: number) => (
    Object.keys(global.messages.byChatId).find(
      (chatId) => global.messages.byChatId[chatId].byId[id],
    )
  ),
}));

vi.mock('../../../global/reducers/messages', () => ({
  updateChatMessage: (global: any, chatId: string, id: number, update: Partial<ApiMessage>) => {
    const chat = global.messages.byChatId[chatId];
    if (!chat?.byId[id]) return global;

    return {
      ...global,
      messages: {
        ...global.messages,
        byChatId: {
          ...global.messages.byChatId,
          [chatId]: {
            ...chat,
            byId: { ...chat.byId, [id]: { ...chat.byId[id], ...update } },
          },
        },
      },
    };
  },
}));

const { runBeforeDeleteMessages } = await import('../../api/Seams');
const { initPlugins, startPlugin, stopPlugin } = await import('../../api/PluginManager');
const messageLoggerModule = await import('./index');

const { markForPurge } = messageLoggerModule;
const plugin = messageLoggerModule.default;

// Registers the plugin (which binds `settings.pluginName`) and starts it.
initPlugins({ MessageLogger: plugin });

/**
 * The behaviour here matters more than it looks. Upstream's `deleteMessages` has two
 * paths, and only the channel one re-filters on `isDeleting` before physically deleting.
 * The common-box path (private chats, basic groups) calls `deleteChatMessages`
 * unconditionally — so an implementation that relied on clearing `isDeleting` would pass
 * in a supergroup and silently fail in a DM. Partitioning ids up front is what covers
 * both, and that is what these assert.
 */

function makeMessage(chatId: string, id: number): ApiMessage {
  return {
    id,
    chatId,
    date: 1700000000,
    isOutgoing: false,
    content: { text: { text: `message ${id}` } },
  } as ApiMessage;
}

function makeGlobal(chats: Record<string, number[]>): GlobalState {
  return {
    messages: {
      byChatId: Object.fromEntries(Object.entries(chats).map(([chatId, ids]) => [
        chatId,
        {
          byId: Object.fromEntries(ids.map((id) => [id, makeMessage(chatId, id)])),
          threadsById: {},
        },
      ])),
    },
  } as unknown as GlobalState;
}

function messageAt(global: GlobalState, chatId: string, id: number) {
  return global.messages.byChatId[chatId]?.byId[id];
}

describe('messageLogger deletion interception', () => {
  beforeEach(() => {
    startPlugin(plugin);
  });

  // Without this the seams accumulate across tests, and a second copy of the protection
  // seam re-protects ids the first one released through the single-use bypass.
  afterEach(() => {
    stopPlugin(plugin);
  });

  it('keeps a message the client is not holding, from the recent buffer', async () => {
    // The reported gap: a chat that was never opened has nothing in global state, so the
    // seam's lookup misses and the deletion goes through with nothing kept.
    const { remember, clearRecent } = await import('./recentMessages');
    clearRecent();
    remember('-100999', { id: 42, content: { text: { text: 'gone' } } } as any);

    // A state that knows nothing about this chat at all.
    const global = makeGlobal({});

    const result = runBeforeDeleteMessages(global, '-100999', [42]);

    expect(result.deletableIds).toEqual([]);
  });

  it('resolves an unknown chat from the recent buffer on the common-box path', async () => {
    // No chat id on this path, and upstream resolves it by searching loaded messages —
    // which misses for exactly the same reason.
    const { remember, clearRecent } = await import('./recentMessages');
    clearRecent();
    remember('777', { id: 88, content: { text: { text: 'gone' } } } as any);

    const result = runBeforeDeleteMessages(makeGlobal({}), undefined, [88]);

    expect(result.deletableIds).toEqual([]);
  });

  it('still lets a genuinely unknown message through', async () => {
    // Nothing anywhere: the deletion has to proceed rather than be swallowed.
    const { clearRecent } = await import('./recentMessages');
    clearRecent();

    const result = runBeforeDeleteMessages(makeGlobal({}), '-100123', [999]);

    expect(result.deletableIds).toEqual([999]);
  });

  it('protects messages instead of letting them be deleted', () => {
    const global = makeGlobal({ '-100123': [1, 2, 3] });

    const result = runBeforeDeleteMessages(global, '-100123', [1, 2, 3]);

    // Nothing is handed back to upstream, so neither delete path ever runs.
    expect(result.deletableIds).toEqual([]);

    for (const id of [1, 2, 3]) {
      const message = messageAt(result.global, '-100123', id);
      expect(message?.isModDeleted).toBe(true);
      expect(typeof message?.modDeletedAt).toBe('number');
    }
  });

  it('clears isDeleting so the channel path cannot collect the message', () => {
    const global = makeGlobal({ '-100123': [1] });

    const result = runBeforeDeleteMessages(global, '-100123', [1]);

    expect(messageAt(result.global, '-100123', 1)?.isDeleting).toBeUndefined();
  });

  it('protects on the common-box path, where chatId is undefined', () => {
    const global = makeGlobal({ user42: [7] });

    // Private chats and basic groups arrive with no chatId; the id has to be resolved
    // to a chat first. This path deletes unconditionally upstream, so getting it wrong
    // loses the message with no second chance.
    const result = runBeforeDeleteMessages(global, undefined, [7]);

    expect(result.deletableIds).toEqual([]);
    expect(messageAt(result.global, 'user42', 7)?.isModDeleted).toBe(true);
  });

  it('lets a purged message through exactly once', () => {
    const global = makeGlobal({ '-100123': [1, 2] });

    markForPurge('-100123', [1]);
    const first = runBeforeDeleteMessages(global, '-100123', [1, 2]);

    // Only the purged id is released; the other is still protected.
    expect(first.deletableIds).toEqual([1]);
    expect(messageAt(first.global, '-100123', 2)?.isModDeleted).toBe(true);

    // The bypass is single-use, so a later genuine deletion of the same id is protected
    // again rather than inheriting a stale flag.
    const second = runBeforeDeleteMessages(first.global, '-100123', [1]);
    expect(second.deletableIds).toEqual([]);
  });

  it('passes through ids it cannot resolve to a chat', () => {
    const global = makeGlobal({ '-100123': [1] });

    const result = runBeforeDeleteMessages(global, undefined, [999]);

    expect(result.deletableIds).toEqual([999]);
  });

  it('passes through ids with no message in state', () => {
    const global = makeGlobal({ '-100123': [1] });

    const result = runBeforeDeleteMessages(global, '-100123', [42]);

    expect(result.deletableIds).toEqual([42]);
  });
});

describe('messageLogger edit history', () => {
  const captureEdit = (global: GlobalState, update: any) => (
    plugin.apiUpdates!.updateMessage(global, update) as GlobalState | undefined
  );

  function edit(text: string, editDate: number) {
    return {
      chatId: '-100123',
      id: 1,
      message: { editDate, content: { text: { text } } },
    };
  }

  it('records the superseded text, not the new one', () => {
    const global = makeGlobal({ '-100123': [1] });

    const next = captureEdit(global, edit('second', 1700000100))!;
    const history = messageAt(next, '-100123', 1)?.modEditHistory;

    // The current text lives on the message; history holds only what was replaced.
    expect(history).toHaveLength(1);
    expect(history![0].text).toBe('message 1');
    expect(history![0].date).toBe(1700000100 * 1000);
  });

  it('ignores updates that do not change the text', () => {
    const global = makeGlobal({ '-100123': [1] });

    // Link-preview resolution, reactions and view counts all arrive this way.
    expect(captureEdit(global, edit('message 1', 1700000100))).toBeUndefined();
  });

  it('ignores updates with no editDate', () => {
    const global = makeGlobal({ '-100123': [1] });

    expect(captureEdit(global, {
      chatId: '-100123', id: 1, message: { content: { text: { text: 'other' } } },
    })).toBeUndefined();
  });

  it('ignores updates whose editDate has not advanced', () => {
    const global = makeGlobal({ '-100123': [1] });
    global.messages.byChatId['-100123'].byId[1].editDate = 1700000100;

    expect(captureEdit(global, edit('other', 1700000100))).toBeUndefined();
  });

  it('ignores messages not already in state', () => {
    const global = makeGlobal({ '-100123': [1] });

    expect(captureEdit(global, { ...edit('x', 1700000100), id: 99 })).toBeUndefined();
  });

  it('accumulates across successive edits', () => {
    let global: GlobalState = makeGlobal({ '-100123': [1] });

    global = captureEdit(global, edit('second', 1700000100))!;
    global.messages.byChatId['-100123'].byId[1].content = { text: { text: 'second' } } as any;
    global = captureEdit(global, edit('third', 1700000200))!;

    expect(messageAt(global, '-100123', 1)?.modEditHistory?.map((e) => e.text))
      .toEqual(['message 1', 'second']);
  });

  it('caps history but always keeps the original', () => {
    const global = makeGlobal({ '-100123': [1] });
    const target = global.messages.byChatId['-100123'].byId[1];

    target.modEditHistory = [
      { date: 1, text: 'ORIGINAL' },
      { date: 2, text: 'b' },
      { date: 3, text: 'c' },
      { date: 4, text: 'd' },
    ];
    (plugin.settings!.store as any).maxEditHistory = 3;

    const next = captureEdit(global, edit('newest', 1700000100))!;
    const history = messageAt(next, '-100123', 1)!.modEditHistory!;

    expect(history).toHaveLength(3);
    // A naive FIFO would drop index 0 — the message as originally sent, which is the
    // entry most worth keeping.
    expect(history[0].text).toBe('ORIGINAL');
    expect(history[history.length - 1].text).toBe('message 1');
  });
});
