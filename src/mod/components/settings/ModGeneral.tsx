import type { FC } from '../../../lib/teact/teact';
import { memo, useState } from '../../../lib/teact/teact';

import { isPluginEnabled, setPluginEnabled } from '../../api/PluginManager';

import useLastCallback from '../../../hooks/useLastCallback';

import Checkbox from '../../../components/ui/Checkbox';

/**
 * How the client itself behaves, as opposed to what plugins add.
 *
 * The options here are backed by plugins — that is what gives them a start/stop lifecycle
 * — but those plugins are `hidden`, because someone looking for "should chats open as
 * tabs" is thinking about the client, not browsing a plugin list.
 */
const ModGeneral: FC = () => {
  const [version, setVersion] = useState(0);
  const rerender = useLastCallback(() => setVersion((v) => v + 1));

  const toggle = useLastCallback((name: string, enabled: boolean) => {
    setPluginEnabled(name, enabled);
    rerender();
  });

  return (
    <div className="settings-content custom-scroll draht-settings" key={version}>
      <div className="draht-setting draht-setting-boolean">
        <Checkbox
          label="Open chats in tabs"
          subLabel={'"Open in new tab" adds a tab above the chat instead of opening a '
            + 'second window in your browser.'}
          checked={isPluginEnabled('ChatTabs')}
          onChange={(e) => toggle('ChatTabs', e.currentTarget.checked)}
        />
      </div>

      <div className="draht-setting draht-setting-boolean">
        <Checkbox
          label="Open chats at the newest message"
          subLabel={'Open at the bottom, and follow new messages there instead of '
            + 'jumping back to the oldest unread one. Needed with hidden read receipts, '
            + 'where the server keeps believing you have not read anything.'}
          checked={isPluginEnabled('OpenAtNewest')}
          onChange={(e) => toggle('OpenAtNewest', e.currentTarget.checked)}
        />
      </div>

      <div className="draht-setting draht-setting-boolean">
        <Checkbox
          label="Colour the window frame with your theme"
          subLabel={'Hides the Windows title bar and paints the window controls to match. '
            + 'Turning it off leaves the controls their default colour; the bar itself is '
            + 'set when the window opens, so that needs a restart.'}
          checked={isPluginEnabled('TitleBar')}
          onChange={(e) => toggle('TitleBar', e.currentTarget.checked)}
        />
      </div>

      <div className="draht-setting draht-setting-boolean">
        <Checkbox
          label="Blur phone numbers and usernames"
          subLabel={'Hides identifying details in every profile, your own included. One '
            + 'click reveals a value, a second copies it. Display names are left alone, '
            + 'and nothing leaves this machine either way.'}
          checked={isPluginEnabled('HidePii')}
          onChange={(e) => toggle('HidePii', e.currentTarget.checked)}
        />
      </div>

      <div className="draht-setting draht-setting-boolean">
        <Checkbox
          label="Keep My Profile out of Saved Messages"
          subLabel={'Your own chat is Saved Messages, so My Profile normally switches you '
            + 'there. This opens it in Settings and leaves your chat alone.'}
          checked={isPluginEnabled('OwnProfile')}
          onChange={(e) => toggle('OwnProfile', e.currentTarget.checked)}
        />
      </div>
    </div>
  );
};

export default memo(ModGeneral);
