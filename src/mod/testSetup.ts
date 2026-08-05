// jsdom has no IndexedDB, which the message log's durable store needs.
import 'fake-indexeddb/auto';

/**
 * jsdom polyfills for the mod's tests.
 *
 * Importing anything from `global/reducers` transitively pulls in the gramjs connector,
 * which probes browser capabilities at module scope. jsdom implements only part of that
 * surface. Upstream has an equivalent setup file at `tests/init.ts`, but `tests/` is
 * gitignored so it is absent from a fresh clone — hence our own.
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom ships no `CSS` object at all. Upstream calls `CSS.supports` at module scope in
// windowEnvironment.ts, which anything importing a UI component transitively pulls in.
// Reporting "unsupported" is the right answer here: it selects upstream's fallback paths,
// which are the ones that work without a real layout engine.
if (!(window as any).CSS) {
  (window as any).CSS = { supports: () => false, escape: (s: string) => s };
} else if (!window.CSS.supports) {
  (window as any).CSS.supports = () => false;
}

if (!('IntersectionObserver' in window)) {
  (window as any).IntersectionObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}

    takeRecords() { return []; }
  };
}

if (!('ResizeObserver' in window)) {
  (window as any).ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
}
