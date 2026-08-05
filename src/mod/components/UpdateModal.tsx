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
 * Renders nothing outside the desktop shell, where `window.draht` is undefined.
 */
const UpdateModal: FC = () => {
  const [version, setVersion] = useState<string | undefined>();
  const [percent, setPercent] = useState<number | undefined>();
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const native = window.draht;
    if (!native) return undefined;

    const offProgress = native.onUpdateProgress(({ percent: value }) => setPercent(value));
    const offReady = native.onUpdateReady(({ version: value }) => {
      setPercent(undefined);
      setVersion(value);
    });

    return () => {
      offProgress();
      offReady();
    };
  }, []);

  function install() {
    // The window is about to be replaced, so show a terminal state rather than letting
    // the button look unresponsive while NSIS starts.
    setIsInstalling(true);
    window.draht?.installUpdate();
  }

  return (
    <Modal
      isOpen={Boolean(version)}
      title="Update available"
      hasCloseButton={!isInstalling}
      onClose={() => !isInstalling && setVersion(undefined)}
      className="draht-update-modal"
    >
      {isInstalling ? (
        <p className="draht-update-text">
          Updating Draht… the app will restart on its own.
        </p>
      ) : (
        <>
          <p className="draht-update-text">
            {`Draht ${version} has been downloaded.`}
          </p>
          <p className="draht-update-hint">
            Restart now, or it installs by itself the next time you close Draht.
            Your login and message log are kept either way.
          </p>
          <div className="draht-update-actions">
            <Button size="smaller" isText onClick={() => setVersion(undefined)}>
              Later
            </Button>
            <Button size="smaller" onClick={install}>
              Restart now
            </Button>
          </div>
        </>
      )}

      {percent !== undefined && !version && (
        <p className="draht-update-hint">{`Downloading… ${percent}%`}</p>
      )}
    </Modal>
  );
};

export default memo(UpdateModal);
