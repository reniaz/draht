import { beforeEach, describe, expect, it } from 'vitest';

import {
  addTab, clearTabs, getTabs, isSameTab, neighbourOf, removeTab,
} from './store';

const A = { chatId: '1', threadId: -1 };
const B = { chatId: '2', threadId: -1 };
const C = { chatId: '3', threadId: -1 };

describe('chat tab store', () => {
  beforeEach(() => {
    clearTabs();
  });

  it('opens a tab once', () => {
    expect(addTab(A)).toBe(true);
    expect(addTab(A)).toBe(false);
    expect(getTabs()).toHaveLength(1);
  });

  it('treats the same chat on different threads as different tabs', () => {
    // A forum topic is its own tab, so the thread has to be part of the identity.
    addTab({ chatId: '1', threadId: -1 });
    addTab({ chatId: '1', threadId: 42 });

    expect(getTabs()).toHaveLength(2);
  });

  it('compares thread ids across string and number forms', () => {
    // They arrive as numbers from the action and as strings out of localStorage.
    expect(isSameTab({ chatId: '1', threadId: 42 }, { chatId: '1', threadId: '42' })).toBe(true);
  });

  it('falls back to the tab on the left when one is closed', () => {
    [A, B, C].forEach(addTab);

    expect(neighbourOf(B)).toEqual(A);
  });

  it('falls back to the right when the first tab is closed', () => {
    [A, B].forEach(addTab);

    expect(neighbourOf(A)).toEqual(B);
  });

  it('has no fallback when the last tab is closed', () => {
    addTab(A);

    expect(neighbourOf(A)).toBeUndefined();
  });

  it('removes only the tab asked for', () => {
    [A, B, C].forEach(addTab);
    removeTab(B);

    expect(getTabs()).toEqual([A, C]);
  });
});
