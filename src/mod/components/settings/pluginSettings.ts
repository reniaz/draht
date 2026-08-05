import type { Plugin, PluginSettingDef } from '../../api/types';

import { OptionType } from '../../api/types';

/**
 * The settings of a plugin that are meant to be rendered.
 *
 * CUSTOM options are plugin-internal state — a saved theme id, a colour seed — driven by
 * the plugin's own editor rather than by a generic control, so they have no row here.
 */
export function visibleSettings(plugin: Plugin): [string, PluginSettingDef][] {
  const def = plugin.settings?.def;
  if (!def) return [];

  return (Object.entries(def) as [string, PluginSettingDef][])
    .filter(([, setting]) => setting.type !== OptionType.CUSTOM
      && !setting.hidden?.call(plugin.settings));
}
