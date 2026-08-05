/**
 * Release notes, built from the commits between two tags.
 *
 * Kept separate from `release.mjs` so the same notes go to the GitHub release body and to
 * every announcement — one source, so they cannot drift into three descriptions of the
 * same release.
 */
import { execFileSync } from 'node:child_process';

/** Commit subjects that describe the release rather than anything in it. */
const NOISE = [
  /^\d+\.\d+\.\d+$/, // version bumps
  /^\[Build\]$/i,
  /^Merge /,
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * The tag released before `tag`.
 *
 * Sorted by version rather than by date: tags get pushed out of order often enough (a
 * failed push retried later, a hotfix cut from an older commit) that "the most recent tag
 * by time" is not reliably "the previous version".
 */
export function selectPreviousTag(tags, tag) {
  const index = tags.indexOf(tag);
  if (index === -1) return undefined;

  return tags[index + 1];
}

/** Commit subjects worth showing, newest first, with duplicates and noise removed. */
export function filterSubjects(subjects) {
  const seen = new Set();

  return subjects
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !NOISE.some((pattern) => pattern.test(line)))
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

/**
 * @returns {{ previous: string|undefined, changes: string[], markdown: string }}
 */
export function buildNotes(tag, { owner, repo, version }) {
  const tags = git(['tag', '--list', 'v*', '--sort=-v:refname']).split('\n').filter(Boolean);
  const previous = selectPreviousTag(tags, tag);

  const range = previous ? `${previous}..${tag}` : tag;
  const subjects = git(['log', range, '--no-merges', '--format=%s']).split('\n');
  const changes = filterSubjects(subjects);

  const download = `https://github.com/${owner}/${repo}/releases/download/${tag}/Draht-Setup-${version}.exe`;

  const body = [
    changes.length ? changes.map((line) => `- ${line}`).join('\n') : '- Maintenance release.',
    '',
    `**[Download Draht ${version}](${download})**`,
    '',
    'Existing installs update themselves on the next launch.',
    previous
      ? `\n[Full changelog](https://github.com/${owner}/${repo}/compare/${previous}...${tag})`
      : '',
  ].join('\n').trim();

  return { previous, changes, markdown: body, download };
}
