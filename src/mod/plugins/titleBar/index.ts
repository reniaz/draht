import { definePlugin } from '../../api/types';

const BODY_CLASS = 'draht-frameless';

/**
 * The window's title bar and its buttons.
 *
 * Always on. The window is created without a system frame, so this is the only bar there
 * is — turning it off would leave the app running under a fixed strip with no title, no
 * way to move the window and no way to close it. A switch here would only offer a broken
 * state, which is not a choice worth giving anyone.
 *
 * The bar itself is rendered from `ModRoot`, unconditionally like the other root-level
 * components; this governs the layout shift and the drag regions around it.
 */
export default definePlugin({
  name: 'TitleBar',
  description: 'The window title bar, drawn by the client so it matches the theme.',
  authors: ['Draht'],
  required: true,
  hidden: true,

  start() {
    document.body.classList.add(BODY_CLASS);
  },

  stop() {
    document.body.classList.remove(BODY_CLASS);
  },
});
