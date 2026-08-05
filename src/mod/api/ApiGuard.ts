
/**
 * Lets plugins stop specific requests from reaching Telegram.
 *
 * The ActionBus cannot do this: every registered handler runs, so a plugin can observe an
 * action but not cancel it. Suppression has to happen where the request is actually made,
 * which is `callApi` in `src/api/gramjs/methods/init.ts` — the single point every
 * outgoing method goes through.
 *
 * Blocked calls resolve with `undefined` rather than throwing. Callers treat these as
 * fire-and-forget (`void callApi(...)`), and a rejection would surface as an unhandled
 * error for something the user deliberately turned off.
 */
const blocked = new Map<string, Set<string>>();

/** `owner` is the plugin name, so one plugin unblocking cannot undo another's block. */
export function blockApiMethod(owner: string, method: string) {
  const owners = blocked.get(method) ?? new Set<string>();
  owners.add(owner);
  blocked.set(method, owners);
}

export function unblockApiMethod(owner: string, method: string) {
  const owners = blocked.get(method);
  if (!owners) return;

  owners.delete(owner);
  if (!owners.size) blocked.delete(method);
}

export function unblockAllForOwner(owner: string) {
  for (const method of [...blocked.keys()]) {
    unblockApiMethod(owner, method);
  }
}

/**
 * Called from upstream's `callApi`, so it runs on every single API request. Kept to a
 * size check and a map lookup, with no logging — this is the hottest path the mod
 * touches.
 */
export function isApiMethodBlocked(method: string) {
  return blocked.size > 0 && blocked.has(method);
}
