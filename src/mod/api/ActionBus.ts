import type { GlobalState } from '../../global/types';
import type { ApiUpdateHandler, ModActionHandler } from './types';

import { addCallback, addUntypedActionHandler, removeCallback } from '../../lib/teact/teactn';
import { modLogger } from './Logger';

/**
 * Fan-out layer over telegram-tt's action bus.
 *
 * Upstream exposes `addUntypedActionHandler` but **no `removeActionHandler`** — handlers
 * are pushed onto an array that is never spliced. Registering one handler per plugin
 * would therefore make `stopPlugin` impossible, and disabling a plugin would need a full
 * reload.
 *
 * So the mod registers exactly **one permanent handler per action name**, which walks a
 * mutable array of live plugin handlers. Attaching and detaching become array
 * operations, plugins become hot-toggleable, and each handler gets error isolation for
 * free — a throw in one plugin cannot take down the action or its siblings.
 *
 * Handlers are threaded sequentially: a handler that returns a new state has that state
 * passed to the next one, matching how upstream's own `handleAction` chains handlers.
 */

const actionBuses = new Map<string, ModActionHandler[]>();
const apiUpdateHandlers = new Map<string, ApiUpdateHandler[]>();
const globalChangeHandlers: ((global: GlobalState) => void)[] = [];

let isApiUpdateBusReady = false;
let isGlobalCallbackReady = false;

function ensureActionBus(name: string) {
  const existing = actionBuses.get(name);
  if (existing) return existing;

  const handlers: ModActionHandler[] = [];
  actionBuses.set(name, handlers);

  addUntypedActionHandler(name as any, (global: any, actions: any, payload: any) => {
    for (const handler of handlers) {
      try {
        const next = handler(global, actions, payload);
        // Only a synchronous state return advances the chain; a promise is fire-and-forget,
        // exactly as upstream treats async handlers.
        if (next && typeof (next as any).then !== 'function') {
          global = next as GlobalState;
        }
      } catch (err) {
        modLogger.error(`action handler for '${name}' failed`, err);
      }
    }

    return global;
  });

  return handlers;
}

export function attachAction(name: string, handler: ModActionHandler) {
  ensureActionBus(name).push(handler);
}

export function detachAction(name: string, handler: ModActionHandler) {
  const handlers = actionBuses.get(name);
  const index = handlers?.indexOf(handler) ?? -1;
  if (index !== -1) handlers!.splice(index, 1);
}

/**
 * `apiUpdate` carries every server-side event, discriminated by `update['@type']`.
 * Plugins subscribe per type rather than each re-implementing the same switch.
 */
function ensureApiUpdateBus() {
  if (isApiUpdateBusReady) return;
  isApiUpdateBusReady = true;

  attachAction('apiUpdate', (global, _actions, update) => {
    const handlers = apiUpdateHandlers.get(update?.['@type']);
    if (!handlers?.length) return undefined;

    for (const handler of handlers) {
      try {
        const next = handler(global, update);
        if (next) global = next;
      } catch (err) {
        modLogger.error(`apiUpdate handler for '${update['@type']}' failed`, err);
      }
    }

    return global;
  });
}

export function attachApiUpdate(type: string, handler: ApiUpdateHandler) {
  ensureApiUpdateBus();

  const handlers = apiUpdateHandlers.get(type) ?? [];
  handlers.push(handler);
  apiUpdateHandlers.set(type, handlers);
}

export function detachApiUpdate(type: string, handler: ApiUpdateHandler) {
  const handlers = apiUpdateHandlers.get(type);
  const index = handlers?.indexOf(handler) ?? -1;
  if (index !== -1) handlers!.splice(index, 1);
}

function onGlobalChanged(global: GlobalState) {
  for (const handler of globalChangeHandlers) {
    try {
      handler(global);
    } catch (err) {
      modLogger.error('global change handler failed', err);
    }
  }
}

export function attachGlobalChange(handler: (global: GlobalState) => void) {
  if (!isGlobalCallbackReady) {
    isGlobalCallbackReady = true;
    addCallback(onGlobalChanged);
  }

  globalChangeHandlers.push(handler);
}

export function detachGlobalChange(handler: (global: GlobalState) => void) {
  const index = globalChangeHandlers.indexOf(handler);
  if (index !== -1) globalChangeHandlers.splice(index, 1);

  // Stop paying the per-change cost once nothing is listening.
  if (!globalChangeHandlers.length && isGlobalCallbackReady) {
    isGlobalCallbackReady = false;
    removeCallback(onGlobalChanged);
  }
}
