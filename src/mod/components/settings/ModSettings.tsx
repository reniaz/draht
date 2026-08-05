import type { FC } from '../../../lib/teact/teact';
import { memo } from '../../../lib/teact/teact';

import { getActions } from '../../../global';
import { SettingsScreens } from '../../../types';

import useHistoryBack from '../../../hooks/useHistoryBack';

import ListItem from '../../../components/ui/ListItem';
import ModPluginList from './ModPluginList';
import ModThemeScreen from './ModThemeScreen';

import './ModSettings.scss';

type OwnProps = {
  screen: SettingsScreens;
  isActive?: boolean;
  onReset: () => void;
};

/**
 * The Draht settings screens.
 *
 * Theme and Plugins are separate screens rather than sections of one long page: the theme
 * editor alone is a screenful, and burying the plugin switches under it makes the common
 * task — find a plugin, turn it on — a scrolling exercise.
 *
 * All three screens route through this one component, so nesting more mod screens later
 * costs no further upstream lines.
 */
const ModSettings: FC<OwnProps> = ({ screen, isActive, onReset }) => {
  const { openSettingsScreen } = getActions();

  useHistoryBack({ isActive, onBack: onReset });

  if (screen === SettingsScreens.ModTheme) {
    return <ModThemeScreen />;
  }

  if (screen === SettingsScreens.ModPluginList) {
    return <ModPluginList />;
  }

  return (
    <div className="settings-content custom-scroll draht-settings">
      <ListItem
        icon="brush"
        narrow
        onClick={() => openSettingsScreen({ screen: SettingsScreens.ModTheme })}
      >
        Theme
      </ListItem>
      <ListItem
        icon="bots"
        narrow
        onClick={() => openSettingsScreen({ screen: SettingsScreens.ModPluginList })}
      >
        Plugins
      </ListItem>
    </div>
  );
};

export default memo(ModSettings);
