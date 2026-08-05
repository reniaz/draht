import type { FC } from '../../../lib/teact/teact';
import { memo } from '../../../lib/teact/teact';

import { getActions } from '../../../global';
import { SettingsScreens } from '../../../types';

import ListItem from '../../../components/ui/ListItem';
import logo from '../../assets/draht.svg';

import './DrahtSettingsItem.scss';

/**
 * The Draht row in Telegram's settings menu.
 *
 * A whole component rather than a `<ListItem>` written inline upstream, so the upstream
 * edit stays a single element. The logo is an image because upstream's `icon` prop takes
 * a name from its icon font, which has no entry for ours.
 */
const DrahtSettingsItem: FC = () => {
  const { openSettingsScreen } = getActions();

  return (
    <ListItem
      narrow
      leftElement={<img src={logo} className="icon ListItem-main-icon draht-menu-logo" alt="" />}
      onClick={() => openSettingsScreen({ screen: SettingsScreens.ModPlugins })}
    >
      Draht
    </ListItem>
  );
};

export default memo(DrahtSettingsItem);
