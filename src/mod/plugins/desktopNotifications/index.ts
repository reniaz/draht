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
let originalShowNotification: unknown;

/**
 * Makes telegram-tt use the notification API that actually works in Electron.
 *
 * Electron implements the `Notification` constructor but **not**
 * `ServiceWorkerRegistration.showNotification` — calling it neither displays anything nor
 * rejects; it simply never resolves.
 *
 * Upstream feature-detects by checking whether that method exists on the prototype. It
 * does exist, so `checkIfPushSupported()` returns true and `notifyAboutMessage` posts to
 * the service worker instead of constructing a Notification — and that branch has no
 * fallback, so every message notification is silently dropped.
 *
 * Removing the method makes the detection fail, so upstream takes the `new Notification`
 * path, which works. Nothing is lost: the service-worker path was already doing nothing,
 * and web push has no meaning for a desktop build.
 */
function preferDirectNotifications() {
  const proto = ServiceWorkerRegistration.prototype as any;
  if (!('showNotification' in proto)) return;

  originalShowNotification = proto.showNotification;
  delete proto.showNotification;
}

function restoreServiceWorkerNotifications() {
  if (!originalShowNotification) return;

  (ServiceWorkerRegistration.prototype as any).showNotification = originalShowNotification;
  originalShowNotification = undefined;
}

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
    'Makes notifications work and behave like a desktop app: clicking one opens Draht, '
    + 'and new messages flash the taskbar.',
  authors: ['Draht'],
  enabledByDefault: true,

  settings,

  start() {
    // Runs before upstream's first notification, because plugins start from
    // src/mod/init.ts which is imported ahead of ./global/init.
    preferDirectNotifications();

    const native = window.draht;
    if (!native) {
      logger.info('not running in the desktop shell; direct notifications only');
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
    restoreServiceWorkerNotifications();

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
