import { describe, expect, it } from 'vitest';

import { fits, planFor } from './media';

describe('choosing what media to export', () => {
  it('takes photos and videos', () => {
    expect(planFor({ photo: {} }, 7)).toEqual({ name: '7.jpg', kind: 'photo' });
    expect(planFor({ video: { mimeType: 'video/mp4' } }, 7))
      .toEqual({ name: '7.mp4', kind: 'video' });
  });

  it('leaves archives and everything else alone', () => {
    // The whole reason for filtering: one installer can be larger than the rest of the
    // export put together, and is rarely the thing being kept.
    expect(planFor({ document: { mimeType: 'application/zip', fileName: 'a.zip' } }, 7))
      .toBeUndefined();
    expect(planFor({ document: { mimeType: 'application/pdf' } }, 7)).toBeUndefined();
    expect(planFor({ voice: {} }, 7)).toBeUndefined();
    expect(planFor({ text: { text: 'hi' } }, 7)).toBeUndefined();
    expect(planFor(undefined, 7)).toBeUndefined();
  });

  it('takes a photo that was sent as a file', () => {
    // Sending uncompressed makes it a document, but it is still a photo.
    expect(planFor({ document: { mimeType: 'image/png', fileName: 'shot.png' } }, 7))
      .toEqual({ name: '7.png', kind: 'photo' });
  });

  it('keeps the sender\'s own extension', () => {
    // Renaming a .webp to .jpg would still display, but the file would be lying about
    // itself to anything that reads it later.
    expect(planFor({ document: { mimeType: 'image/webp', fileName: 'x.webp' } }, 3).name)
      .toBe('3.webp');
  });

  it('falls back to the mime type when there is no filename', () => {
    expect(planFor({ document: { mimeType: 'video/quicktime' } }, 3).name).toBe('3.quicktime');
  });

  it('names files after the message, so two photos never collide', () => {
    expect(planFor({ photo: {} }, 1).name).not.toBe(planFor({ photo: {} }, 2).name);
  });
});

describe('the media budget', () => {
  const budget = { maxFileBytes: 1000, maxTotalBytes: 2500 };

  it('refuses a file over the per-file limit', () => {
    // One long video is what makes an export take an age.
    expect(fits(1001, 0, budget)).toBe(false);
    expect(fits(1000, 0, budget)).toBe(true);
  });

  it('refuses once the total would be exceeded', () => {
    // A thousand small files is what fills a disk; the per-file limit never catches it.
    expect(fits(600, 2000, budget)).toBe(false);
    expect(fits(500, 2000, budget)).toBe(true);
  });

  it('refuses a file of no size at all', () => {
    expect(fits(0, 0, budget)).toBe(false);
  });
});
