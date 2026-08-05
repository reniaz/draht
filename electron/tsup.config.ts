import { defineConfig } from 'tsup';

/**
 * The main process is built as CommonJS, not ESM.
 *
 * electron-updater pulls in fs-extra -> graceful-fs, which uses dynamic `require()` of
 * node builtins. Bundling that into an ESM output makes esbuild replace those calls with
 * a shim that throws "Dynamic require of \"fs\" is not supported" — and it throws at
 * import time, so the app dies on launch with a JavaScript error dialog before it can
 * open a window.
 *
 * CommonJS is the Electron main process default and has a real `require`, so those calls
 * resolve normally. `.cjs` is required because the repo is `"type": "module"`.
 */
export default defineConfig([
  {
    entry: {
      main: 'electron/main.ts',
      smoke: 'electron/smoke.ts',
      diagnose: 'electron/diagnose.ts',
      diagnoseFonts: 'electron/diagnoseFonts.ts',
    },
    outDir: 'electron/dist',
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    target: 'node22',
    platform: 'node',
    external: ['electron'],
    clean: true,
  },
  {
    entry: { preload: 'electron/preload.ts' },
    outDir: 'electron/dist',
    // Sandboxed preloads must be CommonJS.
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    target: 'node22',
    platform: 'node',
    external: ['electron'],
    clean: false,
  },
]);
