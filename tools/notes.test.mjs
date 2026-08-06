import { describe, expect, it } from 'vitest';

import { extractNotes, selectPreviousTag } from './notes.mjs';

describe('selectPreviousTag', () => {
  // As `git tag --sort=-v:refname` returns them: highest version first.
  const tags = ['v1.0.11', 'v1.0.10', 'v1.0.9', 'v1.0.2', 'v1.0.1'];

  it('picks the version below the one being released', () => {
    expect(selectPreviousTag(tags, 'v1.0.11')).toBe('v1.0.10');
  });

  it('sorts by version, not by string', () => {
    // The whole reason for -v:refname. As text, "v1.0.9" > "v1.0.10", which would make
    // every release from 1.0.10 on announce the wrong range of commits.
    expect(selectPreviousTag(tags, 'v1.0.10')).toBe('v1.0.9');
  });

  it('has no previous tag for the first release', () => {
    expect(selectPreviousTag(tags, 'v1.0.1')).toBeUndefined();
  });

  it('gives up rather than guessing when the tag is unknown', () => {
    expect(selectPreviousTag(tags, 'v2.0.0')).toBeUndefined();
  });
});

describe('extractNotes', () => {
  it('takes only the lines that ask to be announced', () => {
    // A commit log records how something was built, including the wrong turns and the
    // tooling nobody using the app will ever see.
    const log = [
      'Fix a thing nobody will notice',
      '',
      'Release-note: Export a chat as an HTML file',
      '',
      'Some other commit with no trailer at all',
    ].join('\n');

    expect(extractNotes(log)).toEqual(['Export a chat as an HTML file']);
  });

  it('keeps them newest first, as git hands them over', () => {
    const log = ['Release-note: Second', '', 'Release-note: First'].join('\n');

    expect(extractNotes(log)).toEqual(['Second', 'First']);
  });

  it('says a feature once, however many commits touched it', () => {
    const log = ['Release-note: Chat tabs', '', 'Release-note: Chat tabs'].join('\n');

    expect(extractNotes(log)).toEqual(['Chat tabs']);
  });

  it('ignores an empty trailer rather than announcing a blank line', () => {
    expect(extractNotes(['Release-note:   ', 'Release-note: Real'].join('\n')))
      .toEqual(['Real']);
  });

  it('returns nothing when a release announces nothing', () => {
    expect(extractNotes('Just some commits')).toEqual([]);
  });
});

describe('notes that grew with the feature', () => {
  it('keeps the fullest version and drops its earlier beginnings', () => {
    // Notes arrive newest first, so the extended line is in hand before the line it grew
    // out of. Announcing both says the same thing twice, the second time worse.
    const log = [
      'Release-note: Export a chat as HTML, with its photos and videos',
      '',
      'Release-note: Export a chat as HTML',
    ].join('\n');

    expect(extractNotes(log)).toEqual(['Export a chat as HTML, with its photos and videos']);
  });

  it('keeps genuinely different notes', () => {
    const log = ['Release-note: Chat tabs', '', 'Release-note: Blur profile details'].join('\n');

    expect(extractNotes(log)).toHaveLength(2);
  });
});
