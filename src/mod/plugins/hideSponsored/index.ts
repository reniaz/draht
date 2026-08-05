import { definePluginSettings } from '../../api/Settings';
import { definePlugin, OptionType } from '../../api/types';

const settings = definePluginSettings({
  hideInChannels: {
    type: OptionType.BOOLEAN,
    description: 'Hide sponsored messages shown at the bottom of channels',
    default: true,
    onChange: () => apply(),
  },
});

const BODY_CLASS = 'draht-hide-sponsored';

function apply() {
  document.body.classList.toggle(BODY_CLASS, Boolean(settings.store.hideInChannels));
}

/**
 * Second plugin, deliberately a different shape from MessageLogger: no seams, no action
 * handlers, just start/stop plus a body class. It exists partly because it is useful and
 * partly because one plugin never proves a plugin system — this is what shows the
 * registry, per-plugin settings, and independent enable/disable actually work.
 *
 * Note this hides sponsored messages rather than preventing them: Telegram still fetches
 * them, and view counts are reported by the client elsewhere. Suppressing the request
 * would mean touching the API layer, which is a larger change than this plugin wants to
 * be.
 */
export default definePlugin({
  name: 'HideSponsored',
  description: 'Hides sponsored messages (ads) in channels.',
  authors: ['Draht'],
  enabledByDefault: false,

  settings,

  start() {
    apply();
  },

  stop() {
    document.body.classList.remove(BODY_CLASS);
  },
});
