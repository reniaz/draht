import { PAGE_TITLE } from '../../config';

const SEPARATOR = ' | ';

/**
 * Prefixes the window title with the app name, so it reads "Draht | Chat name" rather
 * than just the chat name.
 *
 * Applied at `setPageTitleInstant`, which every title update funnels through — including
 * the debounced `setPageTitle`.
 *
 * Titles that already contain the app name are left alone. Upstream uses it verbatim for
 * the idle title and appends to it for other states (`Draht [Inactive]`, `[T] Draht`), and
 * prefixing those would produce "Draht | Draht [Inactive]".
 */
export function withAppTitle(nextTitle: string) {
  if (!nextTitle || !PAGE_TITLE) return nextTitle;
  if (nextTitle.includes(PAGE_TITLE)) return nextTitle;

  return `${PAGE_TITLE}${SEPARATOR}${nextTitle}`;
}
