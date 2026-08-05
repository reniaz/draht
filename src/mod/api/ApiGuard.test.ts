import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { blockApiMethod, isApiMethodBlocked, unblockAllForOwner } from './ApiGuard';

describe('ApiGuard', () => {
  it('blocks only what it is asked to', () => {
    blockApiMethod('T', 'alpha');

    expect(isApiMethodBlocked('alpha')).toBe(true);
    expect(isApiMethodBlocked('beta')).toBe(false);

    unblockAllForOwner('T');
    expect(isApiMethodBlocked('alpha')).toBe(false);
  });
});

/**
 * The guard is useless if it is installed in the wrong JavaScript context.
 *
 * GramJS runs in a Web Worker, and there are two `callApi` functions: one in
 * `methods/init.ts` that executes *inside* the worker, and one in `worker/connector.ts`
 * that the app calls on the main thread. Hooking the worker-side one looks completely
 * correct and does nothing at all — plugins run on the main thread, so they populate a
 * different copy of this module and the worker's copy stays empty.
 *
 * That is exactly what shipped in 1.0.5, and no behavioural test could see it: the guard
 * worked perfectly in isolation. These assert the wiring instead of the logic.
 */
describe('ApiGuard is wired into the callApi the app actually uses', () => {
  const gramjsIndex = readFileSync('src/api/gramjs/index.ts', 'utf8');
  const connector = readFileSync('src/api/gramjs/worker/connector.ts', 'utf8');
  const workerMethods = readFileSync('src/api/gramjs/methods/init.ts', 'utf8');

  it('confirms the app re-exports callApi from worker/connector', () => {
    // If upstream ever switches this back to './methods/init', the guard silently stops
    // working — so fail loudly here instead.
    expect(gramjsIndex).toMatch(/export\s*{[^}]*callApi[^}]*}\s*from\s*'\.\/worker\/connector'/s);
  });

  it('has the guard in the main-thread callApi', () => {
    expect(connector).toContain('isApiMethodBlocked');
  });

  it('does not have the guard in the worker-side callApi', () => {
    // Harmless but misleading: it would never fire, and would suggest the feature works.
    expect(workerMethods).not.toContain('isApiMethodBlocked');
  });
});
