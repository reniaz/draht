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

/** A phone number is worth more to a stranger than a handle, so they are asked about separately. */
export type PiiKind = 'phone' | 'username';

function kindOf(row: Element): PiiKind {
  return row.querySelector('.icon-phone') ? 'phone' : 'username';
}

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
 * What a press anywhere in a profile row should do.
 *
 * Resolved from the row, not from the covered value. The row is a button that copies, and
 * it is taller than the chip inside it — so a press a few pixels below the cover used to
 * reach the row's own handler and copy a value that was still hidden, which is the exact
 * thing being guarded against. Anywhere in the row now counts as pressing the cover.
 *
 * Every covered value in the row is revealed together: a username row holds the main
 * handle and the secondary ones, and revealing half of it would be a strange half-state.
 */
export function resolveClick(target: Element | null): {
  elements: Element[];
  action: 'reveal' | 'copy';
  kind: PiiKind;
} | undefined {
  const row = target?.closest('.ListItem');
  if (!row) return undefined;

  const tagged = [...row.querySelectorAll(`.${PII_CLASS}`)];
  if (!tagged.length) return undefined;

  const kind = kindOf(row);

  const hidden = tagged.filter((element) => !element.classList.contains(SHOWN_CLASS));
  if (hidden.length) return { elements: hidden, action: 'reveal', kind };

  // Revealed already, so this press copies. The value pressed directly if there is one,
  // otherwise the row's primary value rather than whichever happens to be first.
  const direct = target?.closest(`.${PII_CLASS}`);
  const primary = row.querySelector(`.title.${PII_CLASS}`);

  return { elements: [direct ?? primary ?? tagged[0]], action: 'copy', kind };
}
