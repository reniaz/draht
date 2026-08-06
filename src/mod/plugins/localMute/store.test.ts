import { beforeEach, describe, expect, it } from 'vitest';

import {
  EVERYWHERE, getMuted, isMuted, mute, muteScope, restore, unmute,
} from './store';

describe('local mute', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const key of getMuted()) {
      const [chatId, senderId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      unmute(chatId, senderId);
    }
  });

  it('hides someone in one chat without touching the others', () => {
    // The person who makes one group unbearable is often someone you speak to happily
    // elsewhere.
    mute('-100group', '5');

    expect(isMuted('-100group', '5')).toBe(true);
    expect(isMuted('-100other', '5')).toBe(false);
  });

  it('hides someone everywhere when asked', () => {
    mute(EVERYWHERE, '5');

    expect(isMuted('-100group', '5')).toBe(true);
    expect(isMuted('-100other', '5')).toBe(true);
  });

  it('says which kind of mute is in force', () => {
    // The menu offers the one not already applied, so it has to tell them apart.
    mute('-100group', '5');
    expect(muteScope('-100group', '5')).toBe('chat');

    mute(EVERYWHERE, '6');
    expect(muteScope('-100group', '6')).toBe('everywhere');
    expect(muteScope('-100group', '7')).toBeUndefined();
  });

  it('unmuting in a chat also lifts a mute applied everywhere', () => {
    // Otherwise the menu says they are unmuted while their messages stay hidden.
    mute(EVERYWHERE, '5');
    unmute('-100group', '5');

    expect(isMuted('-100group', '5')).toBe(false);
  });

  it('leaves other people alone', () => {
    mute('-100group', '5');

    expect(isMuted('-100group', '6')).toBe(false);
  });

  it('survives a restart', () => {
    mute('-100group', '5');

    restore();

    expect(isMuted('-100group', '5')).toBe(true);
  });
});
