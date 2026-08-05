#!/usr/bin/env node
/**
 * Blocks a commit that would publish the Telegram API credentials.
 *
 * The credentials are compiled into the built web app, and upstream tracks its own
 * `dist/` directory in git. Builds now go to the gitignored `build/` instead, but this
 * exists because the consequence of getting it wrong on a public repo is unrecoverable:
 * a leaked `api_hash` cannot be un-published, only revoked.
 *
 *   node tools/check-secrets.mjs
 *
 * Reads the values from .env and scans everything currently staged.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

if (!existsSync('.env')) {
  console.log('No .env — nothing to check.');
  process.exit(0);
}

const env = readFileSync('.env', 'utf8');
const secrets = [];

for (const key of ['TELEGRAM_API_HASH', 'TELEGRAM_API_ID']) {
  const value = env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
  // Short or empty values would match everywhere; only real credentials are worth scanning for.
  if (value && value.length >= 6) secrets.push({ key, value });
}

if (!secrets.length) {
  console.log('No credentials set — nothing to check.');
  process.exit(0);
}

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACM')
  .split('\n')
  .filter(Boolean);

if (!staged.length) {
  console.log('Nothing staged.');
  process.exit(0);
}

const offenders = [];

for (const file of staged) {
  let contents;
  try {
    // Read the staged blob, not the working tree — they can differ.
    contents = git('show', `:${file}`);
  } catch {
    continue; // binary or unreadable; skip
  }

  for (const { key, value } of secrets) {
    if (contents.includes(value)) offenders.push(`  ${file} contains ${key}`);
  }
}

// `.env` itself must never be committed, regardless of content matching.
if (staged.includes('.env')) offenders.push('  .env is staged');

if (offenders.length) {
  console.error('\nBlocked: staged files would publish your Telegram API credentials.\n');
  offenders.forEach((o) => console.error(o));
  console.error(
    '\nBuilds embed the credentials, so never commit build output. Our builds go to '
    + '`build/` (gitignored); `dist/` belongs to upstream — restore it with '
    + '`git checkout -- dist`.\n',
  );
  process.exit(1);
}

console.log('No credentials in staged files.');
