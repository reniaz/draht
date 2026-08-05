import { describe, expect, it } from 'vitest';

import { filterSubjects, selectPreviousTag } from './notes.mjs';

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

describe('filterSubjects', () => {
  it('drops version-bump commits', () => {
    expect(filterSubjects(['Fix the thing', '1.0.11'])).toEqual(['Fix the thing']);
  });

  it('drops build and merge commits', () => {
    expect(filterSubjects(['[Build]', 'Merge branch mod', 'Real change']))
      .toEqual(['Real change']);
  });

  it('keeps a version number that is part of a sentence', () => {
    expect(filterSubjects(['Bump Electron to 1.0.11 for the ICU fix']))
      .toEqual(['Bump Electron to 1.0.11 for the ICU fix']);
  });

  it('removes duplicates and blanks, preserving order', () => {
    expect(filterSubjects(['A', '', 'B', 'A', '   '])).toEqual(['A', 'B']);
  });
});
