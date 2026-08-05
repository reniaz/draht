import type { FC } from '../../../lib/teact/teact';
import { memo, useState } from '../../../lib/teact/teact';

import type { Plugin } from '../../api/types';

import { getPlugins, isPluginEnabled, setPluginEnabled } from '../../api/PluginManager';
import { visibleSettings } from './pluginSettings';

import useLastCallback from '../../../hooks/useLastCallback';

import Icon from '../../../components/common/icons/Icon';
import Switcher from '../../../components/ui/Switcher';
import PluginSettingControl from './PluginSettingControl';

/**
 * The plugin list.
 *
 * Plugins are collapsed by default: the common task is "find a plugin and turn it on or
 * off", and showing every option of every plugin at once buries that under a wall of
 * controls. Options appear only when a plugin is expanded, and only when it is enabled —
 * configuring something that is switched off has no effect and only adds noise.
 */
const ModPluginList: FC = () => {
  // The settings store lives outside Teact, so re-render is driven explicitly.
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState<string | undefined>();

  const rerender = useLastCallback(() => setVersion((v) => v + 1));

  // Themes has its own screen, so it does not appear here.
  const plugins = Object.values(getPlugins())
    .filter((plugin) => !plugin.hidden && plugin.name !== 'Themes')
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleToggle = useLastCallback((plugin: Plugin, enabled: boolean) => {
    setPluginEnabled(plugin.name, enabled);
    if (enabled && visibleSettings(plugin).length) setExpanded(plugin.name);
    rerender();
  });

  return (
    <div className="settings-content custom-scroll draht-settings" key={version}>
      <p className="draht-intro">
        Plugins change how this client behaves. Changes apply immediately — no restart.
      </p>

      {plugins.map((plugin) => {
        const enabled = isPluginEnabled(plugin.name);
        const options = enabled ? visibleSettings(plugin) : [];
        const isOpen = expanded === plugin.name && options.length > 0;

        return (
          <div key={plugin.name} className="draht-plugin">
            <div className="draht-plugin-header">
              <div
                className="draht-plugin-info"
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(isOpen ? undefined : plugin.name)}
              >
                <div className="draht-plugin-name">
                  {plugin.name}
                  {options.length > 0 && (
                    <Icon
                      name="down"
                      className={isOpen ? 'draht-chevron draht-chevron-open' : 'draht-chevron'}
                    />
                  )}
                </div>
                <div className="draht-plugin-description">{plugin.description}</div>
              </div>

              <Switcher
                label={plugin.name}
                checked={enabled}
                disabled={plugin.required}
                onCheck={(checked) => handleToggle(plugin, checked)}
              />
            </div>

            {isOpen && (
              <div className="draht-plugin-options">
                {options.map(([key, setting]) => (
                  <PluginSettingControl
                    key={`${plugin.name}-${key}`}
                    plugin={plugin}
                    settingKey={key}
                    setting={setting}
                    onChange={rerender}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!plugins.length && <p className="draht-intro">No plugins are installed.</p>}
    </div>
  );
};

export default memo(ModPluginList);
