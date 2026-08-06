import { definePlugin } from '../../api/types';

import './TitleBar.scss';

const BODY_CLASS = 'draht-frameless';

/**
 * Reads a CSS colour off the page.
 *
 * The window controls are drawn by Windows, which knows nothing about the theme, so the
 * colour has to be measured here and handed over. Falls back to the caelus palette when a
 * variable is missing rather than to white, which would flash on every theme change.
 */
function colourOf(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  return value || fallback;
}

/**
 * Matches the window controls to the theme.
 *
 * Deferred to the next frame: this runs on theme changes, and the variables are read back
 * off the document, which has to have applied them first.
 */
export function syncTitleBar() {
  requestAnimationFrame(() => {
    window.draht?.setTitleBar?.(
      colourOf('--color-background', '#1e1f1e'),
      colourOf('--color-text-secondary', '#c6b4a6'),
    );
  });
}

export default definePlugin({
  name: 'TitleBar',
  description: 'Drop the Windows title bar and colour the window controls with your theme.',
  authors: ['Draht'],
  // Client behaviour, so the switch lives under Draht Settings -> General. The frame is
  // already hidden by the time this runs — the plugin governs the drag regions and the
  // colours, not whether the bar exists, which is decided when the window is created.
  hidden: true,
  enabledByDefault: true,

  start() {
    document.body.classList.add(BODY_CLASS);
    syncTitleBar();
  },

  stop() {
    document.body.classList.remove(BODY_CLASS);
  },
});
