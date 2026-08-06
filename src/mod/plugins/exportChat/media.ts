export type MediaPlan = {
  /** What the file will be called inside the export's `media` folder. */
  name: string;
  kind: 'photo' | 'video';
};

/**
 * Whether a message's media is the kind worth putting in an export.
 *
 * Photos and videos are what a transcript loses most by omitting — a conversation of
 * "Photo" placeholders is barely a record of anything. Everything else is excluded: an
 * archive, an installer or a spreadsheet is usually far larger than the entire rest of the
 * export and rarely the thing being kept.
 *
 * A photo or video *sent as a file* arrives as a document, so the decision is made on the
 * mime type rather than on which field it happens to occupy. That way a .png someone sent
 * uncompressed is included and a .zip is not, which is the distinction that matters.
 */
export function planFor(content: any, id: number): MediaPlan | undefined {
  if (!content) return undefined;

  if (content.photo) return { name: `${id}.jpg`, kind: 'photo' };

  if (content.video) {
    const extension = content.video.mimeType === 'video/webm' ? 'webm' : 'mp4';
    return { name: `${id}.${extension}`, kind: 'video' };
  }

  const mime: string = content.document?.mimeType || '';

  if (mime.startsWith('image/')) {
    return { name: `${id}${extensionFor(mime, content.document?.fileName, '.jpg')}`, kind: 'photo' };
  }

  if (mime.startsWith('video/')) {
    return { name: `${id}${extensionFor(mime, content.document?.fileName, '.mp4')}`, kind: 'video' };
  }

  return undefined;
}

/**
 * Keeps the sender's own extension where there is one.
 *
 * Renaming a .png to .jpg would still display, but the file would be lying about itself
 * to anything that reads it later.
 */
function extensionFor(mime: string, fileName: string | undefined, fallback: string) {
  const fromName = fileName?.match(/(\.[a-z0-9]{1,5})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();

  const fromMime = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '');

  return fromMime ? `.${fromMime.toLowerCase()}` : fallback;
}

export type Budget = {
  maxFileBytes: number;
  maxTotalBytes: number;
};

/**
 * Decides whether one more file fits.
 *
 * Two limits, because they fail differently: a single huge video is what makes an export
 * take an age, and a thousand small ones are what fills a disk. Neither alone catches
 * both.
 */
export function fits(size: number, used: number, budget: Budget): boolean {
  if (size <= 0) return false;
  if (size > budget.maxFileBytes) return false;

  return used + size <= budget.maxTotalBytes;
}
