export type NameRecord = {
  /** The name or handle as it was. */
  value: string;
  /** When it was first replaced by something else. */
  changedAt: number;
};

export type PeerHistory = {
  names: NameRecord[];
  usernames: NameRecord[];
};

const STORAGE_KEY = 'draht-name-history';

/** Per peer, so one prolific renamer cannot crowd out everyone else. */
const MAX_PER_KIND = 10;

/** Across all peers. Every chat and every group member is a candidate. */
const MAX_PEERS = 2000;

let history: Record<string, PeerHistory> = {};
let saveTimer: number | undefined;

export function getHistory(peerId: string): PeerHistory | undefined {
  return history[peerId];
}

export function getAll() {
  return history;
}

export function clearHistory() {
  history = {};
  if (saveTimer) self.clearTimeout(saveTimer);
  saveTimer = undefined;
  saveNow();
}

/**
 * Records that a peer's name or handle used to be something else.
 *
 * The *previous* value is stored, not the current one: the current one is on the peer
 * already, and what nobody can look up afterwards is what it was before. Called with the
 * old value at the moment it stops being true, which is the only moment it is knowable.
 *
 * @returns true when this was a change worth recording.
 */
export function recordChange(
  peerId: string,
  kind: 'names' | 'usernames',
  previous: string,
  changedAt = Date.now(),
): boolean {
  if (!peerId || !previous) return false;

  const entry = history[peerId] ?? { names: [], usernames: [] };
  const list = entry[kind];

  // Telegram resends the same user object often; only an actual change is news.
  if (list[0]?.value === previous) return false;

  entry[kind] = [{ value: previous, changedAt }, ...list].slice(0, MAX_PER_KIND);

  // Re-inserted so the object's key order is least-recently-changed first, which is what
  // makes the eviction below correct without storing a timestamp per peer.
  delete history[peerId];
  history[peerId] = entry;

  const keys = Object.keys(history);
  if (keys.length > MAX_PEERS) {
    for (const stale of keys.slice(0, keys.length - MAX_PEERS)) delete history[stale];
  }

  save();

  return true;
}

function saveNow() {
  saveTimer = undefined;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Losing the history costs a warning nobody sees, not correctness.
  }
}

/**
 * Throttled: a group's member list arriving rewrites many peers at once, and each one
 * would otherwise serialise the whole record again.
 */
function save() {
  if (saveTimer) return;

  saveTimer = self.setTimeout(saveNow, 2000);
}

export function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') history = parsed;
  } catch {
    // A corrupt file starts empty rather than breaking startup.
  }
}
