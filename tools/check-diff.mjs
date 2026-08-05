#!/usr/bin/env node
/**
 * Enforces the upstream diff budget.
 *
 * The whole rebase strategy rests on keeping changes to upstream files tiny and
 * concentrated — every seam call site is meant to be one import plus one expression. That
 * is easy to state and easy to erode, so this makes it a check rather than an intention.
 *
 *   node tools/check-diff.mjs
 *
 * Fails if an upstream file is touched that is not on the allowlist, or if an allowlisted
 * file exceeds its line budget. Paths under `src/mod/`, `electron/` and `tools/` are ours
 * and are not counted.
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.MOD_UPSTREAM_BASE || 'upstream/master';

/** Upstream files we are allowed to touch, and the max changed lines for each. */
const ALLOWLIST = {
  // Seam call sites.
  'src/index.tsx': 3,
  'src/global/actions/apiUpdaters/messages.ts': 10,
  'src/components/middle/message/Message.tsx': 6,

  // Suppresses the unread marker, which is permanently stale once read receipts are
  // hidden — and which upstream trusts when deciding whether a new message may join the
  // viewport at all.
  'src/global/selectors/messages.ts': 8,
  // Every title update funnels through setPageTitleInstant, so one call covers them all.
  'src/util/updatePageTitle.ts': 8,
  // The main-thread callApi, which is what the app actually calls. Note this is NOT
  // methods/init.ts — that one runs inside the GramJS worker, where a guard registered by
  // a main-thread plugin would never be seen.
  'src/api/gramjs/worker/connector.ts': 10,
  'src/components/middle/message/MessageContextMenu.tsx': 6,

  // Two seams: "open in new tab", which upstream opens as a browser window (in Electron,
  // the OS browser showing a second copy of the client), and "My Profile", which upstream
  // answers by switching you to Saved Messages.
  'src/global/actions/ui/chats.ts': 12,
  'src/components/middle/MiddleColumn.tsx': 8,
  'src/hooks/useChatContextActions.ts': 6,
  // Single mount point for root-level mod UI; further modals nest inside ModRoot.
  'src/components/App.tsx': 6,

  // Settings UI wiring. All four delegate to src/mod/components/settings/ModSettings.tsx,
  // so additional mod screens nest inside that one and cost nothing here.
  'src/types/index.ts': 7,
  'src/components/left/settings/Settings.tsx': 14,
  'src/components/left/settings/SettingsHeader.tsx': 12,
  'src/components/left/settings/SettingsMain.tsx': 10,
  'src/components/left/LeftColumn.tsx': 13,
  // Config files, not seam call sites — the tight budget is about keeping *code* edits
  // surgical, and does not buy anything here.
  'package.json': 46,
  // Must track package.json's version; upstream's own update checker compares them.
  'public/version.txt': 4,
  '.gitignore': 10,
  // Plugin registration, the @mod alias, and the outDir redirect that keeps builds out
  // of upstream's tracked `dist/`.
  'vite.config.ts': 18,
  // Regenerated wholesale by npm; reviewing its line count is meaningless.
  'package-lock.json': Infinity,

  // The fork has its own identity. Upstream's README is preserved verbatim as
  // README.upstream.md rather than dropped, since it carries the dependency licences.
  'README.md': Infinity,
};

/** Paths that belong to the mod rather than upstream. */
const OURS = [
  /^src\/mod\//,
  /^electron\//,
  /^tools\//,
  /^vitest\.mod\.config\.ts$/,
  /^electron-builder\.yml$/,
  /^README\.mod\.md$/,
  // Upstream's README, preserved verbatim under a new name.
  /^README\.upstream\.md$/,
];

/**
 * Upstream commits its build output, and any local build rewrites it. That churn is not
 * a source change and would drown out the signal.
 */
const IGNORED = [/^dist\//];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

let numstat;
try {
  // `--no-renames` so a rename reports as a delete plus an add. With detection on, git
  // emits a single `old => new` path that no per-file rule can match.
  numstat = git('diff', '--numstat', '--no-renames', BASE);
} catch {
  console.error(
    `Could not diff against '${BASE}'.\n`
    + "Add the remote with: git remote add upstream https://github.com/Ajaxy/telegram-tt.git\n"
    + 'then: git fetch upstream',
  );
  process.exit(2);
}

const violations = [];
const touched = [];

for (const line of numstat.split('\n').filter(Boolean)) {
  const [addedRaw, removedRaw, file] = line.split('\t');
  if (!file) continue;
  if (OURS.some((re) => re.test(file)) || IGNORED.some((re) => re.test(file))) continue;

  // Binary files report '-'.
  const changed = (Number(addedRaw) || 0) + (Number(removedRaw) || 0);
  const budget = ALLOWLIST[file];

  if (budget === undefined) {
    violations.push(`  ${file} — not on the allowlist (${changed} lines changed)`);
    continue;
  }

  touched.push(`  ${file}: ${changed}/${budget === Infinity ? '∞' : budget}`);

  if (changed > budget) {
    violations.push(`  ${file} — ${changed} lines changed, budget is ${budget}`);
  }
}

if (touched.length) {
  console.log(`Upstream files touched (vs ${BASE}):`);
  touched.forEach((t) => console.log(t));
}

if (violations.length) {
  console.error('\nUpstream diff budget exceeded:');
  violations.forEach((v) => console.error(v));
  console.error(
    '\nIf a seam needs more than one import plus one expression at its call site, the '
    + 'seam is designed wrong — move the logic into src/mod/ rather than raising the '
    + 'budget.',
  );
  process.exit(1);
}

console.log('\nUpstream diff within budget.');
