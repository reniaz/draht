import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { clearMarks, getMarks, recordRead } from './localRead';

describe('local read marks', () => {
  beforeEach(() => {
    clearMarks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records how far a thread has been read', () => {
    recordRead('123', -1, 500);

    expect(getMarks()['123:-1']).toBe(500);
  });

  it('only ever moves forward', () => {
    // Scrolling back or opening from a search result marks an older message read. Taking
    // that at face value would un-read everything after it, and the chat would jump to the
    // top again — the exact bug this exists to fix.
    recordRead('123', -1, 500);
    recordRead('123', -1, 200);

    expect(getMarks()['123:-1']).toBe(500);
  });

  it('reports whether the mark actually advanced', () => {
    expect(recordRead('123', -1, 500)).toBe(true);
    expect(recordRead('123', -1, 500)).toBe(false);
    expect(recordRead('123', -1, 501)).toBe(true);
  });

  it('keeps forum topics apart', () => {
    recordRead('123', -1, 500);
    recordRead('123', 77, 20);

    expect(getMarks()['123:-1']).toBe(500);
    expect(getMarks()['123:77']).toBe(20);
  });

  it('ignores a missing id rather than recording zero', () => {
    expect(recordRead('123', -1, 0)).toBe(false);
    expect(getMarks()['123:-1']).toBeUndefined();
  });

  it('does not write to storage on every read', () => {
    // markMessageListRead fires as you scroll, and localStorage.setItem is synchronous.
    vi.useFakeTimers();

    for (let i = 0; i < 20; i++) recordRead('123', -1, i + 1);

    expect(localStorage.getItem('draht-local-read')).toBeNull();

    vi.advanceTimersByTime(3000);

    expect(localStorage.getItem('draht-local-read')).toContain('20');
    vi.useRealTimers();
  });

  it('stops growing, dropping the least recently read', () => {
    // Every chat opened and every forum topic visited adds one, for as long as the client
    // is installed, so the set has to have a ceiling.
    for (let i = 0; i < 600; i++) recordRead(`chat${i}`, -1, 10);

    const keys = Object.keys(getMarks());

    expect(keys).toHaveLength(500);
    // The oldest went, the newest stayed.
    expect(getMarks()['chat0:-1']).toBeUndefined();
    expect(getMarks()['chat599:-1']).toBe(10);
  });

  it('counts reading a chat again as recent', () => {
    recordRead('old', -1, 10);
    for (let i = 0; i < 499; i++) recordRead(`chat${i}`, -1, 10);

    // Reading it again must move it out of the way of eviction.
    recordRead('old', -1, 11);
    recordRead('newest', -1, 10);

    expect(getMarks()['old:-1']).toBe(11);
  });

  it('survives a restart', async () => {
    // Fake timers before the write, so the throttled save is scheduled on them and this
    // does not depend on a real 2 seconds elapsing.
    vi.useFakeTimers();
    recordRead('-1001234567890', -1, 42);
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();

    expect(localStorage.getItem('draht-local-read')).toContain('42');

    // A fresh module, as after a reload.
    const { restoreMarks, getMarks: get } = await import('./localRead');
    restoreMarks();

    // Chat ids contain hyphens and the key separator is a colon, so the split has to be
    // on the last one.
    expect(get()['-1001234567890:-1']).toBe(42);
  });
});
