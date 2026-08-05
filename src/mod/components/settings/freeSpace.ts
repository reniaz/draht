export type Measurements = {
  /** Viewport-relative bottom edge of the scroller's border box. */
  containerBottom: number;
  /** The scroller's bottom padding, which sits below its content. */
  containerPaddingBottom: number;
  /** Viewport-relative bottom edge of the last element inside the scroller. */
  contentBottom: number;
  /** How far the scroller is scrolled, since that moves `contentBottom` up. */
  scrollTop: number;
  /** The offset currently applied, which `contentBottom` already reflects. */
  currentOffset: number;
};

/**
 * The offset that puts the end of a scroller's content at the foot of the scroller, or 0
 * when the content already reaches past it.
 *
 * Deliberately not `clientHeight - scrollHeight`: `scrollHeight` is defined as at least
 * `clientHeight`, so that difference is never positive and reports "no room" even on a
 * screen that is nearly empty. Comparing the two bottom edges is the measurement that
 * actually answers the question.
 *
 * It is also deliberately incremental — the offset already in effect is folded in rather
 * than measured from scratch. Applying an offset can change the scroller's own height if
 * that height is content-driven, and a from-scratch measurement would then read "no room"
 * and remove the offset, restoring the room, forever. Folding it in makes a placed line
 * measure as needing no further change, so re-measuring is a no-op.
 *
 * `scrollTop` is added back so the answer does not depend on where the user has scrolled
 * to — the content is measured as if the scroller were at the top.
 */
export function offsetToFillHeight({
  containerBottom,
  containerPaddingBottom,
  contentBottom,
  scrollTop,
  currentOffset,
}: Measurements): number {
  const room = (containerBottom - containerPaddingBottom) - (contentBottom + scrollTop);
  const next = currentOffset + room;

  return next > 0 ? next : 0;
}
