import { beforeEach, describe, expect, it } from 'vitest';

import {
  hiddenAncestor, PII_CLASS, SHOWN_CLASS, tagPii, untagPii,
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

    expect(hiddenAncestor(inner)).toBe(inner);
  });

  it('reports nothing once revealed, so the row becomes clickable again', () => {
    tagPii(profile());
    const phone = document.querySelector(`.title.${PII_CLASS}`)!;
    phone.classList.add(SHOWN_CLASS);

    expect(hiddenAncestor(phone)).toBeUndefined();
  });

  it('leaves no trace when switched off', () => {
    const root = profile();
    tagPii(root);
    document.querySelector(`.${PII_CLASS}`)!.classList.add(SHOWN_CLASS);

    untagPii(root);

    expect(document.querySelectorAll(`.${PII_CLASS}`)).toHaveLength(0);
    expect(document.querySelectorAll(`.${SHOWN_CLASS}`)).toHaveLength(0);
  });
});
