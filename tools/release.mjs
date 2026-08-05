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

/* 2. Uncommitted work would not be in the tag. */
const dirty = run('git', ['status', '--porcelain']);
if (dirty) {
  die(
    'Working tree is not clean — the release would not match the repository.',
    `Commit or stash first:\n${dirty.split('\n').map((l) => `    ${l}`).join('\n')}`,
  );
}

/* 3. The tag must point at a commit others can actually fetch. */
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

/* 4. A reused tag means the version was not bumped, and the updater keys off version. */
const tags = run('git', ['tag', '--list', tag]);
if (tags) {
  die(
    `Tag ${tag} already exists — version ${version} has been released.`,
    'Bump "version" in package.json first.',
  );
}

/* 5. Only now spend time on the build. */
console.log('Verifying...\n');
runLive('npm', ['run', 'mod:verify']);

console.log('\nBuilding...\n');
runLive('npm', ['run', 'mod:build']);

console.log(`\nTagging ${tag}...\n`);
run('git', ['tag', '-a', tag, '-m', `Draht ${version}`]);
runLive('git', ['push', 'origin', tag]);

console.log('\nPublishing...\n');
runLive('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always']);

console.log(`\n  Released ${tag}.`);
console.log('  Installed copies will pick it up on their next launch.\n');
