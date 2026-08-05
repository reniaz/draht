#!/usr/bin/env node
/**
 * Installs the pre-commit credential guard into .git/hooks.
 *
 * Git hooks are not tracked by git, so a fresh clone has none. Run this once after
 * cloning:  npm run mod:secrets:install
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const HOOK_PATH = '.git/hooks/pre-commit';

const HOOK = `#!/bin/sh
# Draht: refuse to commit anything containing the Telegram API credentials.
exec node tools/check-secrets.mjs
`;

if (!existsSync('.git')) {
  console.error('Not a git repository.');
  process.exit(1);
}

mkdirSync('.git/hooks', { recursive: true });
writeFileSync(HOOK_PATH, HOOK, { mode: 0o755 });
chmodSync(HOOK_PATH, 0o755);

console.log(`Installed ${HOOK_PATH}`);
