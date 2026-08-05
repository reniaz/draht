/**
 * Lets plugins drop or rewrite requests before they reach Telegram.
 *
 * The ActionBus cannot do this: every registered handler runs, so a plugin can observe an
 * action but not cancel it. Interception has to happen where the request is made, which is
 * `callApi` in `src/api/gramjs/worker/connector.ts` — the main-thread entry point every
 * outgoing method passes through.
 *
 * Note this is *not* `methods/init.ts`. That `callApi` runs inside the GramJS Web Worker,
 * where a block registered by a main-thread plugin would never be seen — it looks correct
 * and silently does nothing.
 *
 * Rewriting matters as much as blocking. Suppressing "I am online" only makes the client
 * silent, and Telegram then infers presence from activity; appearing offline requires
 * actively saying so. Blocking is therefore the special case, not the primitive.
 */
export const BLOCK = Symbol('draht:block');

export type ApiInterceptor = (args: any[]) => any[] | typeof BLOCK;

type Entry = { owner: string; intercept: ApiInterceptor };

const interceptors = new Map<string, Entry[]>();

export function interceptApiMethod(owner: string, method: string, intercept: ApiInterceptor) {
  const entries = interceptors.get(method) ?? [];
  // One interceptor per owner per method, so re-applying settings cannot stack duplicates.
  const existing = entries.findIndex((entry) => entry.owner === owner);
  if (existing !== -1) entries.splice(existing, 1);

  entries.push({ owner, intercept });
  interceptors.set(method, entries);
}

/** Sugar for the common case: drop the call entirely. */
export function blockApiMethod(owner: string, method: string) {
  interceptApiMethod(owner, method, () => BLOCK);
}

export function unblockApiMethod(owner: string, method: string) {
  const entries = interceptors.get(method);
  if (!entries) return;

  const index = entries.findIndex((entry) => entry.owner === owner);
  if (index !== -1) entries.splice(index, 1);
  if (!entries.length) interceptors.delete(method);
}

export function unblockAllForOwner(owner: string) {
  for (const method of [...interceptors.keys()]) {
    unblockApiMethod(owner, method);
  }
}

/**
 * Called from upstream's `callApi`, so it runs on every API request. The empty-map check
 * keeps the cost to one property read when no plugin is intercepting anything.
 *
 * Returns the arguments to send, or `undefined` to drop the call.
 */
export function interceptApiCall(method: string, args: any[]): any[] | undefined {
  if (!interceptors.size) return args;

  const entries = interceptors.get(method);
  if (!entries?.length) return args;

  let next = args;
  for (const { intercept } of entries) {
    const result = intercept(next);
    if (result === BLOCK) return undefined;
    next = result;
  }

  return next;
}

/** Kept for tests and callers that only care whether something is being dropped. */
export function isApiMethodBlocked(method: string) {
  return interceptApiCall(method, []) === undefined;
}
