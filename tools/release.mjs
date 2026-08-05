#!/usr/bin/env node
/**
 * Publishes a release, with the source and the binary guaranteed to match.
 *
 *   npm run mod:release
 *
 * electron-builder on its own only uploads artefacts — it has no idea whether the code
 * that produced them was committed, let alone pushed. That makes it possible to ship a
 * binary nobody can reproduce, which is both a debugging problem and a GPL one: the
 * licence requires the *corresponding* source to be available.
 *
 * So this refuses to publish unless the tree is clean and pushed, then tags the exact
 * commit the build came from.
 *
 * Requires GH_TOKEN (a GitHub token with `repo` scope).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { cleanRelease } from './clean-release.mjs';
import { buildNotes } from './notes.mjs';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function runLive(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

function die(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;

const builderConfig = readFileSync('electron-builder.yml', 'utf8');
const owner = builderConfig.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builderConfig.match(/^\s*repo:\s*(\S+)/m)?.[1];

function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

async function ensureRelease() {
  const existing = await gh(`/releases/tags/${tag}`);
  if (existing.ok) {
    console.log(`Release ${tag} already exists; uploading into it.\n`);
    return;
  }

  const created = await gh('/releases', {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      name: version,
      // Written from the commits in this release, so the page says what changed instead
      // of being an empty shell under a version number.
      body: buildNotes(tag, { owner, repo, version }).markdown,
      draft: false,
      prerelease: false,
    }),
  });

  if (!created.ok) {
    die(`Could not create release ${tag}: ${created.status} ${await created.text()}`);
  }

  console.log(`Created release ${tag}.\n`);
}

async function verifyRelease() {
  const all = await gh('/releases').then((r) => r.json());
  const forTag = all.filter((r) => r.tag_name === tag);

  if (forTag.length > 1) {
    die(
      `${forTag.length} releases exist for ${tag} — assets are split across them.`,
      `Delete the extras at https://github.com/${owner}/${repo}/releases and re-run.`,
    );
  }

  const assets = forTag[0]?.assets.map((a) => a.name) ?? [];
  const required = ['latest.yml', `Draht-Setup-${version}.exe`];
  const missing = required.filter((name) => !assets.includes(name));

  if (missing.length) {
    die(
      `Release ${tag} is missing: ${missing.join(', ')}`,
      'Without latest.yml the updater cannot see this release.\n'
      + `    Found: ${assets.join(', ') || '(nothing)'}`,
    );
  }

  console.log(`  Verified: ${assets.join(', ')}`);
}

console.log(`\nReleasing ${tag}\n`);

/* 1. The token has to exist before we spend minutes building. */
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  die(
    'GH_TOKEN is not set.',
    'Create a token with `repo` scope at https://github.com/settings/tokens, then:\n'
    + '    set GH_TOKEN=ghp_...        (cmd)\n'
    + '    $env:GH_TOKEN="ghp_..."     (PowerShell)',
  );
}

/*
 * 2. public/version.txt must match.
 *
 * telegram-tt has its own update checker that fetches version.txt and compares it to the
 * compiled-in version with `remote !== app`. If they drift, every client shows a
 * permanent "update available" prompt that reloading never clears — and it fights the
 * real electron-updater.
 */
const versionTxt = readFileSync('public/version.txt', 'utf8').trim();
if (versionTxt !== version) {
  die(
    `public/version.txt says ${versionTxt}, package.json says ${version}.`,
    'They must match, or upstream\'s update checker shows a prompt that never clears:\n'
    + `    echo ${version}> public/version.txt`,
  );
}

/* 3. Uncommitted work would not be in the tag. */
const dirty = run('git', ['status', '--porcelain']);
if (dirty) {
  die(
    'Working tree is not clean — the release would not match the repository.',
    `Commit or stash first:\n${dirty.split('\n').map((l) => `    ${l}`).join('\n')}`,
  );
}

/* 4. The tag must point at a commit others can actually fetch. */
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
let unpushed;
try {
  unpushed = run('git', ['rev-list', '--count', '@{u}..HEAD']);
} catch {
  die(`Branch '${branch}' has no upstream.`, `    git push -u origin ${branch}`);
}

if (unpushed !== '0') {
  die(
    `${unpushed} commit(s) on '${branch}' are not pushed.`,
    `    git push origin ${branch}`,
  );
}

/*
 * 5. A reused tag means the version was not bumped, and the updater keys off version.
 *
 * The remote is what decides that, not the local tag. A failed run — GitHub 500s on tag
 * pushes occasionally — leaves a local tag behind, and treating that as "already
 * released" would send you off bumping a version that was never published.
 */
/*
 * Nor is a remote tag proof on its own. The tag is pushed and the release created before
 * the installer is built, so a build that fails — a file lock on `release/`, which Windows
 * produces readily — leaves both behind with nothing attached. That is an interrupted run
 * to be finished, not a released version, and the assets are what tell the two apart.
 */
const remoteTag = run('git', ['ls-remote', '--tags', 'origin', tag]);
if (remoteTag) {
  const existing = await gh(`/releases/tags/${tag}`);
  const assets = existing.ok ? (await existing.json()).assets ?? [] : [];

  if (assets.length) {
    die(
      `Tag ${tag} already exists on the remote — version ${version} has been released.`,
      'Bump "version" in package.json first.',
    );
  }

  console.log(`Tag ${tag} is on the remote but its release is empty; finishing that run.\n`);
}

const hasLocalTag = Boolean(run('git', ['tag', '--list', tag]));
if (hasLocalTag) {
  console.log(`Reusing local tag ${tag} left behind by an earlier failed run.\n`);
}

/* 6. Only now spend time on the build. */
console.log('Verifying...\n');
runLive('npm', ['run', 'mod:verify']);

console.log('\nBuilding...\n');
runLive('npm', ['run', 'mod:build']);

/*
 * Prove the build actually starts before shipping it.
 *
 * v1.0.0 shipped a main process that died at import time, because "the process is still
 * running" was mistaken for proof it worked — a modal error dialog keeps the process
 * running. This waits for the app to serve.
 */
console.log('\nChecking the app boots...\n');
runLive('npm', ['run', 'mod:check:app']);

console.log(`\nTagging ${tag}...\n`);
if (!hasLocalTag) run('git', ['tag', '-a', tag, '-m', `Draht ${version}`]);
// Already there when finishing an interrupted run, and pushing it again is rejected.
if (!remoteTag) runLive('git', ['push', 'origin', tag]);

/*
 * 7. Create the GitHub release before electron-builder uploads anything.
 *
 * electron-builder uploads artefacts in parallel, and each upload independently does
 * "find or create the release for this tag". When they start together none of them sees a
 * release yet, so several get created for the same tag — and the assets scatter across
 * them. GitHub then picks one as "latest", and if that is not the one holding latest.yml,
 * every client's update check 404s silently.
 *
 * Creating it up front means every upload finds the same existing release.
 */
await ensureRelease();

console.log('\nPublishing...\n');
runLive('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always']);

/* 8. Fail loudly if the assets did not all land on one release. */
await verifyRelease();

/*
 * 9. The artefacts are on GitHub now; the local copies are just disk.
 *
 * Packaging leaves ~450 MB of unpacked app behind every time, which is invisible until it
 * is several gigabytes.
 */
console.log('');
cleanRelease(version);

/*
 * 10. Announce it.
 *
 * Last, and unable to fail the release: the build is already published and clients can
 * already update, so an outage at Discord must not be reported as a failed release.
 */
try {
  runLive('node', ['tools/announce.mjs', version]);
} catch {
  // runLive throws on a non-zero exit, and letting that through would abort the script
  // after the release is already live — reporting a published release as a failure.
  console.error('\n  Announcing failed. The release itself is published and complete.');
  console.error('  Re-run it with `npm run mod:announce -- ' + version + '`.');
}

console.log(`\n  Released ${tag}.`);
console.log('  Installed copies will pick it up on their next launch.\n');
