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
    </div>
  );
};

export default memo(ModGeneral);
