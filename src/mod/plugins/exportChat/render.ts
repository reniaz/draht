export type ExportedMessage = {
  id: number;
  sender: string;
  /** Milliseconds, so the file can be rendered without knowing Telegram's units. */
  date: number;
  text: string;
  isOutgoing?: boolean;
  /** Describes media rather than embedding it — see the note in `buildChatHtml`. */
  attachment?: string;
  /** Kept by MessageLogger after the sender removed it. */
  isDeleted?: boolean;
  /** Relative path of the file saved beside the transcript, when there is one. */
  mediaFile?: string;
  mediaKind?: 'photo' | 'video';
};

export type ExportOptions = {
  title: string;
  messages: ExportedMessage[];
  /** The active theme's CSS custom properties, so the file looks like the client does. */
  vars: Record<string, string>;
  exportedAt: number;
};

/**
 * Escapes text for HTML.
 *
 * Every string in the export comes from someone else — message text, display names, chat
 * titles — so this is the only thing standing between a message containing `<script>` and
 * a file that runs it when opened. Applied to every interpolation without exception.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** `2024-05-01`, so a day's worth of messages groups under one heading. */
function dayKey(ms: number) {
  return new Date(ms).toDateString();
}

function renderMessage(message: ExportedMessage) {
  const classes = ['msg'];
  if (message.isOutgoing) classes.push('own');
  if (message.isDeleted) classes.push('deleted');

  let attachment = '';

  if (message.mediaFile) {
    const src = escapeHtml(message.mediaFile);
    // `loading="lazy"` matters: a long chat can hold hundreds of images, and a browser
    // asked for all of them at once will stall on opening the file.
    attachment = message.mediaKind === 'video'
      ? `<video class="media" controls preload="none" src="${src}"></video>`
      : `<img class="media" loading="lazy" src="${src}" alt="">`;
  } else if (message.attachment) {
    attachment = `<div class="attachment">${escapeHtml(message.attachment)}</div>`;
  }

  // Text carries the sender's own line breaks, which are the only formatting preserved.
  const text = message.text
    ? `<div class="text">${escapeHtml(message.text).replace(/\n/g, '<br>')}</div>`
    : '';

  return `      <div class="${classes.join(' ')}">
        <div class="meta"><span class="sender">${escapeHtml(message.sender)}</span>`
    + `<span class="time">${escapeHtml(formatDate(message.date))}</span></div>
${text}${attachment}      </div>`;
}

/**
 * Renders a chat as a single self-contained HTML file.
 *
 * One file with everything inline, so it can be opened from anywhere, mailed, or archived
 * without a folder of assets beside it that has to survive with it.
 *
 * Media is described rather than embedded. The bytes live in Telegram's cache, are not
 * ours to redistribute, and embedding them would turn a readable transcript into a
 * hundred-megabyte file — while photos the sender has since deleted would not be there to
 * embed anyway. A line saying what was sent is honest and keeps the file useful.
 */
export function buildChatHtml({
  title, messages, vars, exportedAt,
}: ExportOptions): string {
  const saved = messages.filter((message) => message.mediaFile).length;
  const mediaNote = saved
    ? `${saved} photo${saved === 1 ? '' : 's'} and video${saved === 1 ? '' : 's'} saved beside this file.`
    : 'Media is described, not included.';
  const theme = Object.entries(vars)
    .map(([name, value]) => `      ${name}: ${value};`)
    .join('\n');

  const body = messages.length
    ? messages.map((message, index) => {
      const previous = messages[index - 1];
      const isNewDay = !previous || dayKey(previous.date) !== dayKey(message.date);
      const divider = isNewDay
        ? `      <div class="day">${escapeHtml(dayKey(message.date))}</div>\n`
        : '';

      return divider + renderMessage(message);
    }).join('\n')
    : '      <div class="empty">No messages were loaded for this chat.</div>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
${theme}
  }

  body {
    margin: 0;
    padding: 2rem 1rem 4rem;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.45;
    color: var(--color-text, #fff);
    background: var(--color-background-secondary, #0f0f0f);
  }

  .wrap { max-width: 46rem; margin: 0 auto; }

  header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-borders, #333);
  }

  h1 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .exported { font-size: 0.8125rem; color: var(--color-text-secondary, #888); }

  .day {
    margin: 1.5rem 0 0.75rem;
    text-align: center;
    font-size: 0.75rem;
    color: var(--color-text-secondary, #888);
  }

  .msg {
    max-width: 80%;
    margin-bottom: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    background: var(--color-background, #1b1b1b);
  }

  .msg.own {
    margin-left: auto;
    background: var(--color-background-own, #2b5278);
  }

  .msg.deleted {
    color: var(--draht-deleted, #e05561);
    border: 1px solid var(--draht-deleted, #e05561);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.125rem;
    font-size: 0.75rem;
  }

  .sender { font-weight: 600; color: var(--color-primary, #3390ec); }
  .msg.own .sender { color: inherit; }
  .time { color: var(--color-text-secondary, #888); white-space: nowrap; }

  .media {
    display: block;
    max-width: 100%;
    max-height: 24rem;
    margin-top: 0.375rem;
    border-radius: 0.5rem;
  }

  .attachment {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
    font-style: italic;
    color: var(--color-text-secondary, #888);
  }

  .empty, footer {
    margin-top: 2rem;
    text-align: center;
    font-size: 0.8125rem;
    color: var(--color-text-secondary, #888);
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="exported">Exported from Draht on ${escapeHtml(formatDate(exportedAt))} · ${messages.length} message${messages.length === 1 ? '' : 's'}</div>
    </header>

${body}

    <footer>${escapeHtml(mediaNote)}</footer>
  </div>
</body>
</html>
`;
}
