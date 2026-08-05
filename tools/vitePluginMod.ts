import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Build-time plugin discovery, ported from Vencord's esbuild `~plugins` module
 * (scripts/build/common.mjs:136).
 *
 * Plugins are globbed from disk and emitted as a static registry, so there is no runtime
 * loader, no manifest format, and full type-checking across the boundary. Adding a plugin
 * means rebuilding — which is the accepted trade for zero runtime cost.
 *
 * Two simplifications over Vencord's version:
 *  - The registry is keyed by `plugin.name` at runtime, so Vencord's
 *    `PluginDefinitionNameMatcher` regex (which scrapes the name out of source text at
 *    build time) is unnecessary.
 *  - No `.web.ts` / `.desktop.ts` target-suffix filtering: we ship exactly one target.
 */

const VIRTUAL_ID = '~modplugins';
const RESOLVED_ID = '\0~modplugins';

const PLUGIN_DIRS = [
  'src/mod/plugins/_api',
  'src/mod/plugins',
  'src/mod/userplugins',
];

function discover(root: string) {
  const found: string[] = [];

  for (const dir of PLUGIN_DIRS) {
    const absolute = resolve(root, dir);
    if (!existsSync(absolute)) continue;

    for (const entry of readdirSync(absolute)) {
      // `_`-prefixed entries are shared internals, not plugins.
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      if (entry === 'index.ts' || entry === 'index.tsx') continue;

      const entryPath = join(absolute, entry);
      const isDirectory = statSync(entryPath).isDirectory();

      if (isDirectory) {
        const hasIndex = ['index.ts', 'index.tsx']
          .some((name) => existsSync(join(entryPath, name)));
        if (!hasIndex) continue;
      } else if (!/\.tsx?$/.test(entry)) {
        continue;
      }

      // Skip test files that live beside their plugin.
      if (/\.test\.tsx?$/.test(entry)) continue;

      found.push(`${dir}/${entry}`.replace(/\.tsx?$/, ''));
    }
  }

  return found;
}

export function modPlugins(): Plugin {
  let root = process.cwd();

  return {
    name: 'draht:plugins',

    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_ID) return undefined;

      const paths = discover(root);

      const imports = paths
        .map((path, index) => `import p${index} from '/${path}';`)
        .join('\n');

      const entries = paths
        .map((_path, index) => `[p${index}.name]: p${index}`)
        .join(', ');

      const meta = paths
        .map((path, index) => `[p${index}.name]: ${JSON.stringify({
          path,
          userPlugin: path.startsWith('src/mod/userplugins'),
        })}`)
        .join(', ');

      return `${imports}

export const PluginMeta = { ${meta} };
export default { ${entries} };
`;
    },

    configureServer(server) {
      const watched = PLUGIN_DIRS.map((dir) => resolve(root, dir));

      server.watcher.on('all', (event, file) => {
        if (event !== 'add' && event !== 'unlink' && event !== 'addDir' && event !== 'unlinkDir') {
          return;
        }
        if (!watched.some((dir) => file.startsWith(dir))) return;

        // The registry is generated from a directory listing, so adding or removing a
        // plugin changes a module Vite has no dependency edge to. Invalidate explicitly.
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
