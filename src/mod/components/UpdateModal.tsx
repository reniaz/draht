import type { FC } from '../../lib/teact/teact';
import { memo, useEffect, useState } from '../../lib/teact/teact';

import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

import './UpdateModal.scss';

/**
 * In-app update prompt.
 *
 * Replaces `dialog.showMessageBox`, which is an OS-native message box — unstyleable, and
 * jarring against a themed client. Built from upstream's own Modal and Button, so it
 * inherits whatever colourscheme is active.
 *
 * No version number is shown. Nothing is downloaded at this point: the app restarts and
 * the splash checks again, so the version installed is whatever is newest then — naming
 * one here would risk promising a version that is already superseded by the time you
 * click.
 *
 * Renders nothing outside the desktop shell, where `window.draht` is undefined.
 */
const UpdateModal: FC = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    const native = window.draht;
    if (!native) return undefined;

    return native.onUpdateReady(() => setIsAvailable(true));
  }, []);

  function install() {
    setIsRestarting(true);
    window.draht?.installUpdate();
  }

  return (
    <Modal
      isOpen={isAvailable}
      title="Update available"
      hasCloseButton={!isRestarting}
      onClose={() => !isRestarting && setIsAvailable(false)}
      className="draht-update-modal"
    >
      {isRestarting ? (
        <p className="draht-update-text">Restarting to update…</p>
      ) : (
        <>
          <p className="draht-update-text">An update is available.</p>
          <p className="draht-update-hint">
            Draht restarts and installs it — this takes a few seconds. Your login,
            settings and message log are kept.
          </p>
          <div className="draht-update-actions">
            <Button size="smaller" isText onClick={() => setIsAvailable(false)}>
              Later
            </Button>
            <Button size="smaller" onClick={install}>
              Restart now
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
};

export default memo(UpdateModal);
