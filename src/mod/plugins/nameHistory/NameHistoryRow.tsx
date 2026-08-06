import type { FC } from '../../../lib/teact/teact';

import { getHistory } from './store';

import ListItem from '../../../components/ui/ListItem';

import './NameHistory.scss';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * What this person used to be called.
 *
 * Shown in the profile rather than anywhere else because that is where you go when you are
 * asking who someone is — usually right before deciding whether to trust them. A handle
 * that changed last week is the cheapest impersonation signal there is, and Telegram shows
 * nothing at all.
 */
const NameHistoryRow: FC<{ peerId: string }> = ({ peerId }) => {
  const history = getHistory(peerId);
  if (!history) return undefined;

  const entries = [
    ...history.usernames.map((entry) => ({ ...entry, isUsername: true })),
    ...history.names.map((entry) => ({ ...entry, isUsername: false })),
  ].sort((a, b) => b.changedAt - a.changedAt);

  if (!entries.length) return undefined;

  return (
    <ListItem icon="clock" multiline narrow inactive>
      <span className="title draht-name-history-title">Previously known as</span>
      <span className="subtitle">
        {entries.map((entry) => (
          <span className="draht-name-history-entry" key={`${entry.value}-${entry.changedAt}`}>
            <span className="draht-name-history-value">
              {entry.isUsername ? `@${entry.value}` : entry.value}
            </span>
            <span className="draht-name-history-date">{`until ${formatDate(entry.changedAt)}`}</span>
          </span>
        ))}
      </span>
    </ListItem>
  );
};

export default NameHistoryRow;
