import { describe, expect, it } from 'vitest';

import { offsetToFillHeight } from './freeSpace';

const PANEL = {
  containerBottom: 900,
  containerPaddingBottom: 16,
  scrollTop: 0,
  currentOffset: 0,
};

describe('offsetToFillHeight', () => {
  it('takes up the slack on a screen with room to spare', () => {
    // A 900px panel whose content ends 180px down: the Draht menu, two rows.
    expect(offsetToFillHeight({ ...PANEL, contentBottom: 180 })).toBe(704);
  });

  it('asks for nothing when the content overflows', () => {
    expect(offsetToFillHeight({ ...PANEL, contentBottom: 2400 })).toBe(0);
  });

  it('gives the same answer wherever the scroller is scrolled to', () => {
    const atTop = offsetToFillHeight({ ...PANEL, contentBottom: 2400 });

    // Scrolled 1500px down, the content's bottom edge has moved up by the same amount.
    const scrolled = offsetToFillHeight({ ...PANEL, contentBottom: 900, scrollTop: 1500 });

    expect(scrolled).toBe(atTop);
  });

  it('leaves the padding below the content alone', () => {
    // Without subtracting it, the pushed-down content would overflow by exactly the
    // padding and put a scrollbar on a screen that fits.
    expect(offsetToFillHeight({
      ...PANEL, containerBottom: 500, contentBottom: 100,
    })).toBe(384);
  });

  it('does not mistake a full screen for an empty one', () => {
    // The regression this replaces: clientHeight - scrollHeight, which cannot be positive
    // because scrollHeight is at least clientHeight, so every screen looked full.
    expect(offsetToFillHeight({ ...PANEL, containerPaddingBottom: 0, contentBottom: 900 }))
      .toBe(0);
  });

  it('is a no-op once the line has been placed', () => {
    const offset = offsetToFillHeight({ ...PANEL, contentBottom: 180 });

    // Measuring again: the content now ends where the offset put it, at the foot of the
    // scroller. The answer has to be the same offset, not zero — anything else oscillates
    // on a scroller whose height follows its content.
    const again = offsetToFillHeight({
      ...PANEL,
      contentBottom: 180 + offset,
      currentOffset: offset,
    });

    expect(again).toBe(offset);
  });

  it('gives the offset back when content grows past the foot', () => {
    // A screen that was short, then loaded enough to overflow on its own.
    expect(offsetToFillHeight({
      ...PANEL,
      contentBottom: 2400,
      currentOffset: 704,
    })).toBe(0);
  });

  it('shrinks the offset when content grows but the screen still fits', () => {
    // Placed at 884, content now ends at 1000: 116px of the offset is no longer needed.
    expect(offsetToFillHeight({
      ...PANEL,
      contentBottom: 1000,
      currentOffset: 704,
    })).toBe(588);
  });
});
