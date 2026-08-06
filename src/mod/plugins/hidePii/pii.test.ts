import { beforeEach, describe, expect, it } from 'vitest';

import {
  COPIED_CLASS, PII_CLASS, resolveClick, SHOWN_CLASS, tagPii, untagPii,
} from './pii';

function profile() {
  document.body.innerHTML = `
    <div id="profile">
      <div class="ListItem">
        <i class="icon icon-phone"></i>
        <span class="title">+49 151 23456789</span>
        <span class="subtitle">Phone</span>
      </div>
      <div class="ListItem">
        <i class="icon icon-mention"></i>
        <span class="title">@nejan</span>
        <span class="subtitle"><span class="other-usernames">@nejan2</span>Username</span>
      </div>
      <div class="ListItem">
        <i class="icon icon-info"></i>
        <span class="title">Some bio text</span>
        <span class="subtitle">Bio</span>
      </div>
    </div>`;

  return document.body;
}

describe('hiding profile PII', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('hides the phone number and the username', () => {
    tagPii(profile());

    const hidden = [...document.querySelectorAll(`.${PII_CLASS}`)].map((el) => el.textContent);

    expect(hidden).toContain('+49 151 23456789');
    expect(hidden).toContain('@nejan');
  });

  it('hides secondary usernames too', () => {
    // Just as identifying as the first one.
    tagPii(profile());

    expect(document.querySelector('.other-usernames')!.classList.contains(PII_CLASS)).toBe(true);
  });

  it('leaves the labels readable', () => {
    // A column of grey smudges with no clue what any of them are is worse than useless.
    tagPii(profile());

    for (const label of document.querySelectorAll('.subtitle')) {
      expect(label.classList.contains(PII_CLASS)).toBe(false);
    }
  });

  it('leaves rows that are not identifying alone', () => {
    tagPii(profile());

    const bio = document.querySelectorAll('.ListItem')[2].querySelector('.title')!;

    expect(bio.classList.contains(PII_CLASS)).toBe(false);
  });

  it('does not tag the same element twice', () => {
    const root = profile();

    expect(tagPii(root)).toBe(3);
    expect(tagPii(root)).toBe(0);
  });

  it('finds the hidden element from a click on something inside it', () => {
    tagPii(profile());
    const inner = document.querySelector('.other-usernames')!;

    expect(resolveClick(inner)).toEqual({ element: inner, action: 'reveal' });
  });

  it('copies on the click after the one that revealed it', () => {
    tagPii(profile());
    const phone = document.querySelector(`.title.${PII_CLASS}`)!;

    expect(resolveClick(phone)!.action).toBe('reveal');
    phone.classList.add(SHOWN_CLASS);
    expect(resolveClick(phone)!.action).toBe('copy');
  });

  it('ignores clicks outside a tagged value', () => {
    tagPii(profile());

    // The label, and the row itself, must keep their own behaviour.
    expect(resolveClick(document.querySelector('.subtitle'))).toBeUndefined();
    expect(resolveClick(null)).toBeUndefined();
  });

  it('leaves no trace when switched off', () => {
    const root = profile();
    tagPii(root);
    document.querySelector(`.${PII_CLASS}`)!.classList.add(SHOWN_CLASS);
    document.querySelector(`.${PII_CLASS}`)!.classList.add(COPIED_CLASS);

    untagPii(root);

    expect(document.querySelectorAll(`.${PII_CLASS}`)).toHaveLength(0);
    expect(document.querySelectorAll(`.${SHOWN_CLASS}`)).toHaveLength(0);
    expect(document.querySelectorAll(`.${COPIED_CLASS}`)).toHaveLength(0);
  });
});
