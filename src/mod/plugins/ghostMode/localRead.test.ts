import { beforeEach, describe, expect, it } from 'vitest';

import { clearMarks, getMarks, recordRead } from './localRead';

describe('local read marks', () => {
  beforeEach(() => {
    clearMarks();
    localStorage.clear();
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

  it('survives a restart', async () => {
    recordRead('-1001234567890', -1, 42);

    // A fresh module, as after a reload.
    const { restoreMarks, getMarks: get } = await import('./localRead');
    restoreMarks();

    // Chat ids contain hyphens and the key separator is a colon, so the split has to be
    // on the last one.
    expect(get()['-1001234567890:-1']).toBe(42);
  });
});
