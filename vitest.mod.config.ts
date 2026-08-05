import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Standalone test config for `src/mod/`.
 *
 * Deliberately does not extend the repo's `vitest.config.ts`: that one sets
 * `setupFiles: ['./tests/init.ts']`, and `tests/` is gitignored upstream, so it does not
 * exist in a fresh clone and the harness cannot run. Keeping the mod's tests independent
 * also means they survive upstream changing its own test setup.
 */
export default defineConfig({
  define: {
    APP_VERSION: JSON.stringify('mod-test'),
    APP_REVISION: JSON.stringify('mod-test'),
    // Normally injected by vite.config.ts from APP_TITLE in .env.
    'import.meta.env.TG_APP_TITLE': JSON.stringify('Draht'),
  },
  resolve: {
    // Mirrors the `paths` in tsconfig.base.json. Needed because the mod's ActionBus
    // imports teactn, which pulls in the Teact JSX runtime by alias.
    alias: {
      '@teact/jsx-dev-runtime': resolve(__dirname, 'src/lib/teact/jsx-dev-runtime.ts'),
      '@teact/jsx-runtime': resolve(__dirname, 'src/lib/teact/jsx-runtime.ts'),
      '@teact': resolve(__dirname, 'src/lib/teact/teact.ts'),
    },
  },
  test: {
    // jsdom, not node: the reducers transitively import the gramjs connector, which
    // touches `window` at module scope.
    environment: 'jsdom',
    setupFiles: ['./src/mod/testSetup.ts'],
    include: ['src/mod/**/*.test.ts'],
  },
});
