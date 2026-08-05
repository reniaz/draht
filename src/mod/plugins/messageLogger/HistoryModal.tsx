import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';

import type { ApiMessage } from '../../../api/types';

import { setHistoryOpener } from './actions';

import Modal from '../../../components/ui/Modal';

import './HistoryModal.scss';

function formatDate(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Shows every recorded version of an edited message, oldest first.
 *
 * `modEditHistory` holds only *superseded* text, so the current content has to be
 * appended to produce the full list. Timestamps are offset by one relative to the text:
 * entry N's date is when that text stopped being current, so it labels the *next*
 * revision's start. The first row is therefore labelled with `modFirstEditDate`.
 */
const HistoryModal: FC = () => {
  const [message, setMessage] = useState<ApiMessage | undefined>();

  useEffect(() => {
    setHistoryOpener(setMessage);
  }, []);

  const history = message?.modEditHistory ?? [];
  const currentText = message?.content?.text?.text ?? '';

  const revisions = [
    ...history.map((entry, index) => ({
      text: entry.text,
      date: index === 0 ? message?.modFirstEditDate : history[index - 1].date,
    })),
    { text: currentText, date: history[history.length - 1]?.date },
  ];

  return (
    <Modal
      isOpen={Boolean(message)}
      title="Edit history"
      hasCloseButton
      onClose={() => setMessage(undefined)}
      className="draht-history-modal"
    >
      {revisions.map((revision, index) => (
        <div
          key={index}
          className={index === revisions.length - 1
            ? 'draht-revision draht-revision-current'
            : 'draht-revision'}
        >
          <div className="draht-revision-meta">
            {revision.date ? formatDate(revision.date) : 'before logging started'}
            {index === revisions.length - 1 && ' · current'}
          </div>
          <div className="draht-revision-text">{revision.text || <i>(empty)</i>}</div>
        </div>
      ))}
    </Modal>
  );
};

export default memo(HistoryModal);
