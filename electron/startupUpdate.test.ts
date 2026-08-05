import { describe, expect, it } from 'vitest';

import { isNewerVersion } from './startupUpdate';

describe('isNewerVersion', () => {
  it('accepts a higher version', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.99')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('rejects the same version', () => {
    // The shipped bug: an equal version taken as an update closed the splash and quit.
    expect(isNewerVersion('1.0.9', '1.0.9')).toBe(false);
  });

  it('rejects an older version', () => {
    // The other half: a local build ahead of the feed. Treating that as an update makes
    // downloadUpdate() throw "Please check update first" on every single launch.
    expect(isNewerVersion('1.0.9', '1.0.10')).toBe(false);
    expect(isNewerVersion('1.0.9', '2.0.0')).toBe(false);
  });

  it('compares segments numerically, not as text', () => {
    // "1.0.10" < "1.0.9" as strings, which is the classic way this goes wrong.
    expect(isNewerVersion('1.0.10', '1.0.2')).toBe(true);
    expect(isNewerVersion('1.0.2', '1.0.10')).toBe(false);
  });

  it('treats missing segments as zero', () => {
    expect(isNewerVersion('1.1', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
  });

  it('ignores a pre-release suffix', () => {
    expect(isNewerVersion('1.0.10-beta.1', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0.9-beta.1', '1.0.9')).toBe(false);
  });
});
