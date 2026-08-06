import type { FC } from '../../../lib/teact/teact';

import type { ApiMessage } from '../../../api/types';

import './EditedText.scss';

/**
 * What a message said before it was edited, shown under what it says now.
 *
 * `modEditHistory` stores the *old* text of each edit alongside the timestamp of the edit
 * that replaced it — so the entries read as the message's earlier lives, oldest first, and
 * the current text is the message itself. Showing them together is the point: an edit is
 * only meaningful next to what replaced it, and a modal you have to go and open is a
 * record nobody reads.
 *
 * The theme's deleted colour is reused deliberately. Deleted and edited-away text are the
 * same thing to a reader — words someone tried to take back — and giving them one colour
 * means one thing to learn rather than two.
 */
const EditedText: FC<{ message: ApiMessage; limit: number }> = ({ message, limit }) => {
  const history = message.modEditHistory;
  if (!history?.length) return undefined;

  // Newest first: the version just replaced is the one you are most likely to want, and a
  // long-running edit war should not push it off the bottom.
  const shown = [...history].reverse().slice(0, limit);
  const hidden = history.length - shown.length;

  return (
    <div className="draht-edits" key="draht-edits">
      {shown.map((entry, index) => (
        <div className="draht-edit" key={`${entry.date}-${index}`}>
          {entry.text}
        </div>
      ))}
      {hidden > 0 && (
        <div className="draht-edit-more">
          {`+${hidden} earlier version${hidden === 1 ? '' : 's'}`}
        </div>
      )}
    </div>
  );
};

export default EditedText;
