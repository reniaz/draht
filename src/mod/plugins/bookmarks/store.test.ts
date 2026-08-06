import { beforeEach, describe, expect, it } from 'vitest';

import {
  addBookmark, clearBookmarks, getBookmarks, isBookmarked, removeBookmark, restore,
} from './store';

const bookmark = (over = {}) => ({
  chatId: '-100123',
  messageId: 7,
  text: 'the original wording',
  sender: 'Alice',
  chatTitle: 'Group',
  date: 1700000000000,
  savedAt: 1700000001000,
  ...over,
});

describe('bookmarks', () => {
  beforeEach(() => {
    clearBookmarks();
    localStorage.clear();
  });

  it('saves a message and reports it as saved', () => {
    addBookmark(bookmark());

    expect(isBookmarked('-100123', 7)).toBe(true);
  });

  it('keeps the text as it was when saved', () => {
    // A bookmark that only pointed at the message would be worth nothing the moment the
    // sender edited or deleted it — which is exactly when you would look.
    addBookmark(bookmark());

    expect(getBookmarks()[0].text).toBe('the original wording');
  });

  it('will not save the same message twice', () => {
    addBookmark(bookmark());
    addBookmark(bookmark({ text: 'changed since' }));

    expect(getBookmarks()).toHaveLength(1);
    expect(getBookmarks()[0].text).toBe('the original wording');
  });

  it('puts the newest first', () => {
    addBookmark(bookmark({ messageId: 1 }));
    addBookmark(bookmark({ messageId: 2 }));

    expect(getBookmarks().map((b) => b.messageId)).toEqual([2, 1]);
  });

  it('removes only the one asked for', () => {
    addBookmark(bookmark({ messageId: 1 }));
    addBookmark(bookmark({ messageId: 2 }));

    removeBookmark('-100123', 1);

    expect(getBookmarks().map((b) => b.messageId)).toEqual([2]);
  });

  it('tells two chats apart', () => {
    addBookmark(bookmark({ chatId: '-100123', messageId: 7 }));

    expect(isBookmarked('-100999', 7)).toBe(false);
  });

  it('survives a restart', () => {
    addBookmark(bookmark());

    restore();

    expect(isBookmarked('-100123', 7)).toBe(true);
  });

  it('starts empty rather than throwing on a corrupt file', () => {
    localStorage.setItem('draht-bookmarks', '{not json');

    restore();

    expect(getBookmarks()).toEqual([]);
  });
});
