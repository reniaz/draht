import { copyTextToClipboard } from '../../../util/clipboard';

import { modLogger } from '../../api/Logger';
import { definePlugin } from '../../api/types';
import {
  COPIED_CLASS, resolveClick, SHOWN_CLASS, tagPii, untagPii,
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
 * One click reveals, the next copies.
 *
 * Both swallow the event. These rows are buttons — a username opens a QR code, a phone
 * number a collectible lookup — so a click that fell through would reveal and act at once,
 * which is what the two-step exists to avoid. Capture phase, because the row's own handler
 * would otherwise run first.
 */
function handleClick(e: MouseEvent) {
  const hit = resolveClick(e.target as Element | null);
  if (!hit) return;

  e.preventDefault();
  e.stopPropagation();

  if (hit.action === 'reveal') {
    hit.element.classList.add(SHOWN_CLASS);
    return;
  }

  try {
    copyTextToClipboard(hit.element.textContent || '');

    // Restarted rather than merely added, so copying twice flashes twice instead of
    // looking like nothing happened the second time.
    hit.element.classList.remove(COPIED_CLASS);
    void (hit.element as HTMLElement).offsetWidth;
    hit.element.classList.add(COPIED_CLASS);
  } catch (err) {
    logger.error('could not copy', err);
  }
}

export default definePlugin({
  name: 'HidePii',
  description: 'Blur phone numbers and usernames in profiles until you click them.',
  authors: ['Draht'],
  // On by default. Profile details are the one thing on screen that identifies a real
  // person, and the cost of hiding them is a click. Client behaviour, so the switch lives
  // under Draht Settings -> General.
  enabledByDefault: true,
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
