import type { FC } from '../../../lib/teact/teact';
import { memo, useState } from '../../../lib/teact/teact';

import { getPlugins } from '../../api/PluginManager';
import { visibleSettings } from './pluginSettings';

import useLastCallback from '../../../hooks/useLastCallback';

import PluginSettingControl from './PluginSettingControl';

/**
 * The theme screen.
 *
 * There is no on/off switch: Themes is a required plugin, and "Default" in the theme list
 * is what turns custom colouring off. A switch would be a second way to say the same
 * thing, and an easy way to end up with a chosen theme that silently does nothing.
 */
const ModThemeScreen: FC = () => {
  const [version, setVersion] = useState(0);
  const rerender = useLastCallback(() => setVersion((v) => v + 1));

  const themes = Object.values(getPlugins()).find((plugin) => plugin.name === 'Themes');

  return (
    <div className="settings-content custom-scroll draht-settings" key={version}>
      {themes ? visibleSettings(themes).map(([key, setting]) => (
        <PluginSettingControl
          key={`Themes-${key}`}
          plugin={themes}
          settingKey={key}
          setting={setting}
          onChange={rerender}
        />
      )) : (
        <p className="draht-intro">The Themes plugin is not installed.</p>
      )}
    </div>
  );
};

export default memo(ModThemeScreen);
