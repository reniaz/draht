import type { PiiKind } from './pii';

type Asker = (kind: PiiKind, reveal: NoneToVoidFunction) => void;

let ask: Asker | undefined;

/**
 * Lets the plugin ask before revealing without importing the dialog.
 *
 * The dialog registers itself when it mounts; the click handler only needs to ask. Same
 * arrangement as the other mod modals, and for the same reason: the handler runs outside
 * the component tree and cannot reach into a component's state.
 */
export function setPiiAsker(fn: Asker) {
  ask = fn;
}

export function askBeforeReveal(kind: PiiKind, reveal: NoneToVoidFunction) {
  if (!ask) {
    // No dialog mounted — revealing without asking is better than a click that does
    // nothing at all.
    reveal();
    return;
  }

  ask(kind, reveal);
}
