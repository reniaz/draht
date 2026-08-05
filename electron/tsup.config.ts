import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { main: 'electron/main.ts', smoke: 'electron/smoke.ts' },
    outDir: 'electron/dist',
    // The repo is `"type": "module"`, so a `.js` main is treated as ESM.
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    external: ['electron'],
    clean: true,
  },
  {
    entry: { preload: 'electron/preload.ts' },
    outDir: 'electron/dist',
    // Sandboxed preloads must be CommonJS; `.cjs` opts out of the package `type: module`.
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    target: 'node22',
    platform: 'node',
    external: ['electron'],
    clean: false,
  },
]);
