#!/usr/bin/env node
/**
 * Removes build artefacts left in `release/` after packaging.
 *
 *   npm run mod:clean
 *
 * Packaging leaves ~450 MB of unpacked app (a full Electron tree, rebuilt from scratch
 * every time) plus an installer per version and per format. None of it is needed once a
 * release is published — the artefacts are on GitHub and everything is reproducible from
 * the tag — but it accumulates quietly until the disk notices.
 *
 * The current version's artefacts are kept, so they can still be handed to someone
 * directly after a release.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RELEASE_DIR = 'release';

function sizeOf(path) {
  try {
    const stat = statSync(path);
    if (stat.isFile()) return stat.size;

    return readdirSync(path)
      .reduce((total, entry) => total + sizeOf(join(path, entry)), 0);
  } catch {
    return 0;
  }
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function cleanRelease(keepVersion) {
  if (!existsSync(RELEASE_DIR)) return 0;

  let freed = 0;
  const removed = [];

  for (const entry of readdirSync(RELEASE_DIR)) {
    const full = join(RELEASE_DIR, entry);

    // The unpacked build is regenerated on every package and is never needed afterwards.
    const isUnpacked = entry.endsWith('-unpacked') || entry === 'mac';

    // Installers for versions other than the one just built, in every format the
    // platforms produce: `Draht-Setup-<version>.exe`, `Draht-<version>.AppImage`,
    // `Draht-<version>.rpm`, and the blockmaps beside them.
    const isOldInstaller = /^Draht-.+\.(exe|AppImage|rpm|blockmap)$/.test(entry)
      && (!keepVersion || !entry.includes(`-${keepVersion}.`));

    if (!isUnpacked && !isOldInstaller) continue;

    const size = sizeOf(full);
    try {
      rmSync(full, { recursive: true, force: true });
      freed += size;
      removed.push(`  ${entry} (${mb(size)})`);
    } catch {
      // A file held open by Explorer or an antivirus scan is not worth failing over.
    }
  }

  if (removed.length) {
    console.log(`Cleaned ${mb(freed)} from ${RELEASE_DIR}/:`);
    removed.forEach((line) => console.log(line));
  } else {
    console.log(`Nothing to clean in ${RELEASE_DIR}/.`);
  }

  return freed;
}

// Run directly: keep the current package.json version's installer.
if (process.argv[1] && process.argv[1].endsWith('clean-release.mjs')) {
  const { readFileSync } = await import('node:fs');
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  cleanRelease(version);
}
