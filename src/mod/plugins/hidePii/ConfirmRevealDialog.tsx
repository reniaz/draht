import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';

import type { PiiKind } from './pii';

import { setPiiAsker } from './actions';

import ConfirmDialog from '../../../components/ui/ConfirmDialog';

/**
 * Asks before uncovering a value.
 *
 * The cover exists so a number is not on screen when someone walks past or a stream is
 * running, and a single stray click undoes that with no way to take it back. A
 * confirmation costs one keystroke and makes revealing deliberate.
 */
const ConfirmRevealDialog: FC = () => {
  const [pending, setPending] = useState<{ kind: PiiKind; reveal: NoneToVoidFunction } | undefined>();

  useEffect(() => {
    setPiiAsker((kind, reveal) => setPending({ kind, reveal }));
  }, []);

  const isPhone = pending?.kind === 'phone';

  return (
    <ConfirmDialog
      isOpen={Boolean(pending)}
      title={isPhone ? 'Show phone number?' : 'Show username?'}
      text={isPhone
        ? 'Your phone number will be visible on screen until you leave this profile.'
        : 'The username will be visible on screen until you leave this profile.'}
      confirmLabel="Show"
      confirmHandler={() => {
        pending?.reveal();
        setPending(undefined);
      }}
      onClose={() => setPending(undefined)}
    />
  );
};

export default memo(ConfirmRevealDialog);
