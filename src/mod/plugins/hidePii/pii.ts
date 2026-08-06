/**
 * Which profile rows hold identifying details.
 *
 * Matched on the row's icon rather than its label: the label is translated, so reading it
 * would work in English and quietly stop working in every other language. The icon class
 * is the same everywhere.
 *
 * `mention` is a user's @username, `link` a channel's t.me address, `phone` the number.
 * Display names are deliberately absent — a blurred name makes a profile unreadable
 * without hiding anything you would not say out loud.
 */
export const PII_ICONS = ['icon-phone', 'icon-mention', 'icon-link'];

/** Marks an element as hidden until clicked. */
export const PII_CLASS = 'draht-pii';

/** Marks one the user has chosen to reveal. */
export const SHOWN_CLASS = 'draht-pii-shown';

/** Brief highlight after a copy, since a copy is otherwise invisible. */
export const COPIED_CLASS = 'draht-pii-copied';

function isPiiRow(row: Element) {
  return PII_ICONS.some((icon) => row.querySelector(`.${icon}`));
}

/**
 * Tags the identifying parts of every profile row under `root`.
 *
 * Only the value is tagged, never the whole row: the label beneath it ("Phone",
 * "Username") has to stay readable, or the profile becomes a column of grey smudges with
 * no clue what any of them are.
 *
 * @returns how many elements were newly tagged.
 */
export function tagPii(root: ParentNode): number {
  let tagged = 0;

  for (const row of root.querySelectorAll('.ListItem')) {
    if (!isPiiRow(row)) continue;

    // `.title` is the value; `.other-usernames` holds the secondary handles, which are
    // just as identifying as the first.
    for (const value of row.querySelectorAll('.title, .other-usernames')) {
      if (value.classList.contains(PII_CLASS)) continue;

      value.classList.add(PII_CLASS);
      tagged++;
    }
  }

  return tagged;
}

/** Removes every trace, so turning the setting off restores the profile exactly. */
export function untagPii(root: ParentNode) {
  for (const element of root.querySelectorAll(`.${PII_CLASS}`)) {
    element.classList.remove(PII_CLASS, SHOWN_CLASS, COPIED_CLASS);
  }
}

/**
 * The tagged element a click landed on, and what that click should do.
 *
 * Walks up from the target because the click usually lands on a text node's parent — a
 * link inside `.other-usernames`, say — rather than on the tagged element itself.
 *
 * One click reveals, the next copies. Both are answered here rather than by the row's own
 * handler, which would otherwise open a QR code or a collectible lookup on the way past.
 */
export function resolveClick(target: Element | null): {
  element: Element;
  action: 'reveal' | 'copy';
} | undefined {
  const element = target?.closest(`.${PII_CLASS}`);
  if (!element) return undefined;

  return {
    element,
    action: element.classList.contains(SHOWN_CLASS) ? 'copy' : 'reveal',
  };
}
