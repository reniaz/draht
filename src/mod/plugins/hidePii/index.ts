import { modLogger } from '../../api/Logger';
import { definePlugin } from '../../api/types';
import {
  hiddenAncestor, SHOWN_CLASS, tagPii, untagPii,
} from './pii';

import './HidePii.scss';

const logger = modLogger.scoped('HidePii');
const BODY_CLASS = 'draht-hiding-pii';

let observer: MutationObserver | undefined;
let scanHandle: number | undefined;

/**
 * Coalesced into one pass per frame.
 *
 * Profiles are rendered by Teact, which touches the DOM in bursts; tagging on every
 * mutation would run the scan dozens of times for a single profile opening.
 */
function scheduleScan() {
  if (scanHandle !== undefined) return;

  scanHandle = requestAnimationFrame(() => {
    scanHandle = undefined;
    try {
      tagPii(document.body);
    } catch (err) {
      logger.error('scan failed', err);
    }
  });
}

/**
 * Reveals what was clicked, and swallows that click.
 *
 * The rows are buttons — a username opens a QR code or collectible info — so without this
 * the first click would both reveal the value and act on it. Capture phase, because the
 * row's own handler would otherwise run first. Once revealed, clicks pass through as
 * normal, so the row stays usable.
 */
function handleClick(e: MouseEvent) {
  const hidden = hiddenAncestor(e.target as Element | null);
  if (!hidden) return;

  e.preventDefault();
  e.stopPropagation();

  hidden.classList.add(SHOWN_CLASS);
}

export default definePlugin({
  name: 'HidePii',
  description: 'Blur phone numbers and usernames in profiles until you click them.',
  authors: ['Draht'],
  // Off by default: it hides information, and that should be a decision rather than a
  // surprise. Client behaviour, so the switch lives under Draht Settings -> General.
  enabledByDefault: false,
  hidden: true,

  start() {
    document.body.classList.add(BODY_CLASS);
    document.addEventListener('click', handleClick, true);

    tagPii(document.body);

    // Profiles are rendered on demand, so there is nothing to tag until one opens.
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
  },

  stop() {
    observer?.disconnect();
    observer = undefined;

    if (scanHandle !== undefined) cancelAnimationFrame(scanHandle);
    scanHandle = undefined;

    document.removeEventListener('click', handleClick, true);
    document.body.classList.remove(BODY_CLASS);
    untagPii(document.body);
  },
});
