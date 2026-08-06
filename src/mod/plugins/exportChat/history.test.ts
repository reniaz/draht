import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const { calls, pages } = vi.hoisted(() => ({ calls: [] as any[], pages: [] as any[] }));

vi.mock('../../../api/gramjs', () => ({
  callApi: (name: string, args: any) => {
    calls.push({ name, args });
    return Promise.resolve(pages.shift());
  },
}));

const { fetchHistory } = await import('./history');

const chat = { id: '-100123' } as any;

function page(ids: number[], count?: number) {
  return {
    count,
    // `type` matters: getUserFirstOrLastName switches on it, and a user without one has
    // no name as far as upstream is concerned.
    users: [{ id: '5', type: 'userTypeRegular', firstName: 'Alice' }],
    chats: [],
    messages: ids.map((id) => ({
      id,
      date: 1700000000 + id,
      senderId: '5',
      content: { text: { text: `m${id}` } },
    })),
  };
}

describe('fetching a chat history', () => {
  beforeEach(() => {
    calls.length = 0;
    pages.length = 0;
  });

  it('pages until the history runs out', async () => {
    // A short page means there is no more to ask for.
    pages.push(page(Array.from({ length: 100 }, (_, i) => 200 - i)));
    pages.push(page([50, 49, 48]));

    const messages = await fetchHistory(chat, 10_000);

    expect(calls).toHaveLength(2);
    expect(messages).toHaveLength(103);
  });

  it('walks backwards from the oldest id of each page', async () => {
    pages.push(page(Array.from({ length: 100 }, (_, i) => 200 - i)));
    pages.push(page([50]));

    await fetchHistory(chat, 10_000);

    expect(calls[0].args.offsetId).toBeUndefined();
    // 200 - 99 = 101, the oldest of the first page.
    expect(calls[1].args.offsetId).toBe(101);
  });

  it('hands back the raw message alongside the rendered one', async () => {
    // Media is fetched after the history, and needs the message it came from.
    pages.push(page([1]));

    const [message] = await fetchHistory(chat, 10);

    expect(message.raw.id).toBe(1);
  });

  it('returns the transcript oldest first', async () => {
    // Telegram hands history back newest first; a transcript reads the other way.
    pages.push(page([3, 2, 1]));

    const messages = await fetchHistory(chat, 10_000);

    expect(messages.map((m) => m.exported.id)).toEqual([1, 2, 3]);
  });

  it('stops at the limit rather than reading a whole archive', async () => {
    pages.push(page(Array.from({ length: 100 }, (_, i) => 200 - i)));
    pages.push(page(Array.from({ length: 100 }, (_, i) => 100 - i)));

    const messages = await fetchHistory(chat, 120);

    expect(messages).toHaveLength(120);
    // The second request asks only for what is still wanted.
    expect(calls[1].args.limit).toBe(20);
  });

  it('names the sender from the peers the page came with', async () => {
    pages.push(page([1]));

    const [message] = await fetchHistory(chat, 10);

    expect(message.exported.sender).toBe('Alice');
  });

  it('gives up rather than looping when the offset stops moving', async () => {
    // A server that keeps answering with the same page would otherwise spin forever.
    const stuck = page(Array.from({ length: 100 }, () => 7));
    pages.push(stuck, page([7]), page([7]));

    await fetchHistory(chat, 10_000);

    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('reports progress as it goes', async () => {
    pages.push(page([3, 2, 1], 3));
    const seen: number[] = [];

    await fetchHistory(chat, 10_000, (fetched) => seen.push(fetched));

    expect(seen).toEqual([3]);
  });
});
