import { getActions } from '../../../global';

import { copyTextToClipboard } from '../../../util/clipboard';

import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';
import { askBeforeReveal } from './actions';
import {
  COPIED_CLASS, resolveClick, SHOWN_CLASS, tagPii, untagPii,
} from './pii';

import './HidePii.scss';

const logger = modLogger.scoped('HidePii');

const settings = definePluginSettings({
  confirmPhone: {
    type: OptionType.BOOLEAN,
    displayName: 'Ask before showing a phone number',
    description:
      'A stray click otherwise puts it on screen with no way to take it back, which is '
      + 'the whole thing the cover exists to prevent.',
    default: true,
  },
  confirmUsername: {
    type: OptionType.BOOLEAN,
    displayName: 'Ask before showing a username',
    description: 'Off by default: a handle is public anyway, and asking every time is friction.',
    default: false,
  },
});
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
 * One press reveals, the next copies.
 *
 * On **mousedown**, not click. `ListItem` runs its action through `useFastClick`, which on
 * a non-touch device fires on mousedown — so a handler waiting for the click runs after
 * the row has already copied the value, which is exactly what the first version did.
 *
 * The event is swallowed either way: these rows are buttons, and a press that fell through
 * would reveal and act at once, which is what the two steps exist to avoid.
 */
function handlePress(e: MouseEvent) {
  // Only the primary button; right-click should still reach the context menu.
  if (e.button !== 0) return;

  const hit = resolveClick(e.target as Element | null);
  if (!hit) return;

  e.preventDefault();
  e.stopPropagation();

  if (hit.action === 'reveal') {
    const reveal = () => {
      for (const element of hit.elements) element.classList.add(SHOWN_CLASS);
    };

    const needsConfirming = hit.kind === 'phone'
      ? settings.store.confirmPhone
      : settings.store.confirmUsername;

    if (needsConfirming) askBeforeReveal(hit.kind, reveal);
    else reveal();

    return;
  }

  const [element] = hit.elements;

  try {
    copyTextToClipboard(element.textContent || '');

    // Restarted rather than merely added, so copying twice flashes twice instead of
    // looking like nothing happened the second time.
    element.classList.remove(COPIED_CLASS);
    void (element as HTMLElement).offsetWidth;
    element.classList.add(COPIED_CLASS);

    // The same confirmation the row itself would have shown, so a copy through this looks
    // no different from a copy through Telegram.
    getActions().showNotification({ message: 'Copied' });
  } catch (err) {
    logger.error('could not copy', err);
  }
}

/**
 * Swallows the click that follows a press we handled.
 *
 * Without it the row's click-phase handlers still run on touch devices, and any anchor
 * inside the value would follow its href.
 */
function handleClick(e: MouseEvent) {
  if (!resolveClick(e.target as Element | null)) return;

  e.preventDefault();
  e.stopPropagation();
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

  settings,

  start() {
    document.body.classList.add(BODY_CLASS);
    document.addEventListener('mousedown', handlePress, true);
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

    document.removeEventListener('mousedown', handlePress, true);
    document.removeEventListener('click', handleClick, true);
    document.body.classList.remove(BODY_CLASS);
    untagPii(document.body);
  },
});
