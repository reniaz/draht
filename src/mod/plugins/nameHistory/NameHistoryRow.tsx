import type { FC } from '../../../lib/teact/teact';

import { getGlobal } from '../../../global';
import { getUserFullName } from '../../../global/helpers/users';
import { getHistory } from './store';

import ListItem from '../../../components/ui/ListItem';

import './NameHistory.scss';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function activeUsername(peer: any): string | undefined {
  return peer?.usernames?.find((u: any) => u.isActive)?.username || peer?.username;
}

/**
 * What this person used to be called.
 *
 * Shown in the profile because that is where you go when you are asking who someone is —
 * usually right before deciding whether to trust them. A handle that changed last week is
 * the cheapest impersonation signal there is, and Telegram shows nothing.
 */
const NameHistoryRow: FC<{ peerId: string; showOwn: boolean }> = ({ peerId, showOwn }) => {
  const global = getGlobal();

  if (!showOwn && peerId === global.currentUserId) return undefined;

  const history = getHistory(peerId);
  if (!history) return undefined;

  const peer = (global.users?.byId as any)?.[peerId] || (global.chats?.byId as any)?.[peerId];
  const currentName = peer ? (getUserFullName(peer) || peer.title) : undefined;
  const currentHandle = activeUsername(peer);

  /*
   * Anything still in use is dropped.
   *
   * A record is written when a value stops being true, but Telegram resends peers freely
   * and a stale copy arriving after a change writes the *new* value as though it were the
   * old one. The result was a profile listing its own current name as a former one —
   * which, with the blur on, put the current handle on screen in a row that was not
   * covered.
   *
   * Filtered at display rather than at capture: the check is "does this equal what is
   * true now", and only the profile knows that.
   */
  const entries = [
    ...history.usernames
      .filter((entry) => entry.value !== currentHandle)
      .map((entry) => ({ ...entry, isUsername: true })),
    ...history.names
      .filter((entry) => entry.value !== currentName)
      .map((entry) => ({ ...entry, isUsername: false })),
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
