import { modLogger } from '../../api/Logger';
import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';

const logger = modLogger.scoped('DesktopNotifications');

const settings = definePluginSettings({
  focusOnClick: {
    type: OptionType.BOOLEAN,
    displayName: 'Clicking a notification opens Draht',
    description:
      'Restores and raises the window. Without this, clicking a notification does '
      + 'nothing when Draht is minimised.',
    default: true,
  },
  flashTaskbar: {
    type: OptionType.BOOLEAN,
    displayName: 'Flash the taskbar on new messages',
    description: 'Highlights Draht in the taskbar until you look at it.',
    default: true,
  },
});

let originalFocus: typeof window.focus | undefined;
let OriginalNotification: typeof Notification | undefined;

/**
 * Makes desktop notifications behave like a desktop app's.
 *
 * telegram-tt's notifications already work here — permission is granted by default in
 * Electron, and they fire whenever the window is unfocused. What does not work is what
 * happens *around* them, because the web app can only use browser APIs:
 *
 *  - Its click handler calls `window.focus()`, which in Electron cannot restore a
 *    minimised window or raise a background one. Rather than patching the two call sites
 *    upstream, `window.focus` itself is replaced — that covers both, and any added later.
 *  - Nothing flashes the taskbar, because a web page cannot. The `Notification`
 *    constructor is wrapped so anything upstream shows also gets an OS-level nudge.
 *
 * Both originals are restored on stop, so disabling the plugin leaves no trace.
 */
export default definePlugin({
  name: 'DesktopNotifications',
  description:
    'Makes notifications behave like a desktop app: clicking one opens Draht, and new '
    + 'messages flash the taskbar.',
  authors: ['Draht'],
  enabledByDefault: true,

  settings,

  start() {
    const native = window.draht;
    if (!native) {
      logger.info('not running in the desktop shell; nothing to do');
      return;
    }

    originalFocus = window.focus.bind(window);
    window.focus = () => {
      if (settings.store.focusOnClick) native.focusWindow();
      originalFocus?.();
    };

    if ('Notification' in window) {
      OriginalNotification = window.Notification;
      const Wrapped = new Proxy(OriginalNotification, {
        construct(target, args: [string, NotificationOptions?]) {
          if (settings.store.flashTaskbar) native.flashWindow();
          return Reflect.construct(target, args);
        },
      });

      window.Notification = Wrapped;
    }

    logger.info('started');
  },

  stop() {
    if (originalFocus) {
      window.focus = originalFocus;
      originalFocus = undefined;
    }

    if (OriginalNotification) {
      window.Notification = OriginalNotification;
      OriginalNotification = undefined;
    }
  },
});
