import { beforeEach, describe, expect, it } from 'vitest';

import { clearHistory, getAll, getHistory, recordChange, restore } from './store';

describe('name history', () => {
  beforeEach(() => {
    clearHistory();
    localStorage.clear();
  });

  it('records what someone used to be called', () => {
    // The previous value, not the current one: the current one is on the peer already,
    // and what nobody can look up afterwards is what it was before.
    recordChange('5', 'usernames', 'oldhandle');

    expect(getHistory('5')!.usernames[0].value).toBe('oldhandle');
  });

  it('keeps names and handles apart', () => {
    recordChange('5', 'names', 'Old Name');
    recordChange('5', 'usernames', 'oldhandle');

    expect(getHistory('5')!.names).toHaveLength(1);
    expect(getHistory('5')!.usernames).toHaveLength(1);
  });

  it('ignores the same value arriving again', () => {
    // Telegram resends the same user object constantly; only a change is news.
    expect(recordChange('5', 'usernames', 'oldhandle')).toBe(true);
    expect(recordChange('5', 'usernames', 'oldhandle')).toBe(false);
    expect(getHistory('5')!.usernames).toHaveLength(1);
  });

  it('records a change back to something used before', () => {
    // Cycling between two handles is itself worth seeing.
    recordChange('5', 'usernames', 'a');
    recordChange('5', 'usernames', 'b');
    recordChange('5', 'usernames', 'a');

    expect(getHistory('5')!.usernames.map((u) => u.value)).toEqual(['a', 'b', 'a']);
  });

  it('keeps the most recent first', () => {
    recordChange('5', 'names', 'First');
    recordChange('5', 'names', 'Second');

    expect(getHistory('5')!.names[0].value).toBe('Second');
  });

  it('caps how much it keeps for one person', () => {
    for (let i = 0; i < 20; i++) recordChange('5', 'names', `Name ${i}`);

    expect(getHistory('5')!.names).toHaveLength(10);
    expect(getHistory('5')!.names[0].value).toBe('Name 19');
  });

  it('stops growing across people', () => {
    // Every group member is a candidate, so the record needs a ceiling.
    for (let i = 0; i < 2100; i++) recordChange(`peer${i}`, 'names', 'Old');

    expect(Object.keys(getAll()).length).toBeLessThanOrEqual(2000);
    expect(getHistory('peer0')).toBeUndefined();
    expect(getHistory('peer2099')).toBeDefined();
  });

  it('ignores an empty value rather than recording a blank', () => {
    expect(recordChange('5', 'names', '')).toBe(false);
    expect(getHistory('5')).toBeUndefined();
  });

  it('survives a restart', async () => {
    recordChange('5', 'usernames', 'oldhandle');

    // The write is throttled, so it has to be flushed before the reload.
    await new Promise((resolve) => { setTimeout(resolve, 2500); });
    restore();

    expect(getHistory('5')!.usernames[0].value).toBe('oldhandle');
  });
});
