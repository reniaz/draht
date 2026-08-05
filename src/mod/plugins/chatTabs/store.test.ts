import { beforeEach, describe, expect, it } from 'vitest';

import {
  addTab, clearTabs, getTabs, isSameTab, neighbourOf, removeTab, visitTab,
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

  describe('visiting a chat the ordinary way', () => {
    it('opens the first tab when there are none', () => {
      // The bar has to show where you are, not appear only once a context menu is used.
      visitTab(A);

      expect(getTabs()).toEqual([A]);
    });

    it('replaces the tab you were on rather than adding one', () => {
      // Clicking through a dozen chats must not leave a dozen tabs behind.
      visitTab(A);
      visitTab(B);
      visitTab(C);

      expect(getTabs()).toEqual([C]);
    });

    it('leaves other tabs alone while replacing the active one', () => {
      addTab(A);
      addTab(B);
      visitTab(C);

      expect(getTabs()).toEqual([A, C]);
    });

    it('switches to an existing tab instead of duplicating it', () => {
      addTab(A);
      addTab(B);
      visitTab(A);

      expect(getTabs()).toEqual([A, B]);
    });

    it('appends after the active tab was closed', () => {
      // Nothing is active, so there is nothing to replace, and replacing an arbitrary
      // tab would silently drop one the user had opened.
      addTab(A);
      addTab(B);
      removeTab(B);
      visitTab(C);

      expect(getTabs()).toEqual([A, C]);
    });

    it('replaces a freshly opened tab when you navigate away from it', () => {
      // "Open in new tab" makes that tab the active one, so the next ordinary open
      // replaces it like any other. Otherwise every new tab would be permanent.
      addTab(A);
      visitTab(B);

      expect(getTabs()).toEqual([B]);
    });
  });
});
