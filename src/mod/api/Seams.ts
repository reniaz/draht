import type { TeactNode } from '../../lib/teact/teact';

import type { MenuItemContextAction } from '../../components/ui/ListItem';

import type { ApiMessage } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { modLogger } from './Logger';

/**
 * Seams are the mod's replacement for Vencord's runtime `patches` array.
 *
 * Vencord string-patches Discord's webpack module factories at runtime. That has no
 * equivalent here: telegram-tt ships as native ESM (Vite/Rolldown) with no module
 * registry to hook. Since we control the build instead, extension points are compiled in
 * as named, typed call sites.
 *
 * The cost of that is an upstream diff, so the discipline is strict: **every upstream
 * call site is one import plus one expression.** If a seam needs more than that where it
 * is called, the seam is designed wrong and the logic belongs in `src/mod/`. Keeping to
 * that is what makes `git rebase upstream/master` a mechanical operation.
 *
 * Reduction is per-seam, not generic — concatenating class names and threading global
 * state through a partition are not the same operation.
 */

export type DeleteSource =
  | 'deleteMessages'
  | 'deleteHistory'
  | 'deleteParticipantHistory'
  | 'deleteThread';

export type BeforeDeleteMessages = <T extends GlobalState>(
  global: T,
  chatId: string | undefined,
  ids: number[],
) => { global: T; deletableIds: number[] };

export type MessageClassNamesContext = {
  isOwn?: boolean;
};

export type MessageClassNames = (
  message: ApiMessage,
  context: MessageClassNamesContext,
) => string | undefined;

/**
 * Menu seams return already-rendered nodes rather than item descriptors.
 *
 * That keeps the upstream call site to a single interpolated expression and leaves the
 * menu component's import (and any future changes to it) entirely on the mod's side.
 */
export type MessageMenuItems = (message: ApiMessage) => TeactNode | undefined;

/**
 * The chat list builds its menu from descriptors rather than rendering nodes, so this
 * seam matches that shape instead of forcing a node through it.
 */
export type ChatMenuItems = (chatId: string) => MenuItemContextAction[] | undefined;

type SeamRegistry = {
  beforeDeleteMessages: BeforeDeleteMessages[];
  messageClassNames: MessageClassNames[];
  messageMenuItems: MessageMenuItems[];
  chatMenuItems: ChatMenuItems[];
};

const seams: SeamRegistry = {
  beforeDeleteMessages: [],
  messageClassNames: [],
  messageMenuItems: [],
  chatMenuItems: [],
};

export function addSeam<K extends keyof SeamRegistry>(name: K, fn: SeamRegistry[K][number]) {
  (seams[name] as unknown[]).push(fn);
}

export function removeSeam<K extends keyof SeamRegistry>(name: K, fn: SeamRegistry[K][number]) {
  const list = seams[name] as unknown[];
  const index = list.indexOf(fn);
  if (index !== -1) list.splice(index, 1);
}

/**
 * Called at the top of upstream `deleteMessages`, before either the channel or the
 * common-box path runs.
 *
 * Partitioning here — rather than clearing `isDeleting` between the two phases — is
 * deliberate. The channel path defers physical removal and re-filters on `isDeleting`,
 * so clearing the flag would work there; the common-box path (private chats and basic
 * groups) calls `deleteChatMessages` unconditionally, so it would not. Removing ids from
 * the list up front is the only approach that covers both, and it also avoids starting a
 * delete animation that then has to be aborted.
 *
 * Returns the ids upstream is still allowed to delete.
 */
export function runBeforeDeleteMessages<T extends GlobalState>(
  global: T,
  chatId: string | undefined,
  ids: number[],
): { global: T; deletableIds: number[] } {
  const list = seams.beforeDeleteMessages;
  if (!list.length) return { global, deletableIds: ids };

  let deletableIds = ids;

  for (const fn of list) {
    try {
      const result = fn(global, chatId, deletableIds);
      global = result.global;
      deletableIds = result.deletableIds;
    } catch (err) {
      // A throw here would corrupt upstream's delete flow, so contain it and let the
      // deletion proceed as though the mod were not installed.
      modLogger.error('beforeDeleteMessages seam failed', err);
    }
  }

  return { global, deletableIds };
}

/**
 * Called from `buildClassName(...)` in Message.tsx.
 *
 * This is the one seam on a hot path — once per message, per render. It must stay a
 * single length check with no allocation when nothing is registered.
 */
function runMenuSeam<T>(list: ((arg: T) => TeactNode | undefined)[], arg: T, label: string) {
  if (!list.length) return undefined;

  const nodes: TeactNode[] = [];

  for (const fn of list) {
    try {
      const node = fn(arg);
      if (node) nodes.push(node);
    } catch (err) {
      // A throw here would take down the whole context menu, not just our entry.
      modLogger.error(`${label} seam failed`, err);
    }
  }

  return nodes.length ? nodes : undefined;
}

/** Extra entries for the message context menu. */
export function runMessageMenuItems(message: ApiMessage) {
  return runMenuSeam(seams.messageMenuItems, message, 'messageMenuItems');
}

/** Extra entries for the chat-list context menu. */
export function runChatMenuItems(chatId: string): MenuItemContextAction[] {
  const list = seams.chatMenuItems;
  if (!list.length) return [];

  const actions: MenuItemContextAction[] = [];

  for (const fn of list) {
    try {
      const items = fn(chatId);
      if (items?.length) actions.push(...items);
    } catch (err) {
      modLogger.error('chatMenuItems seam failed', err);
    }
  }

  return actions;
}

export function runMessageClassNames(
  message: ApiMessage,
  context: MessageClassNamesContext,
): string | undefined {
  const list = seams.messageClassNames;
  if (!list.length) return undefined;

  let result: string | undefined;

  for (const fn of list) {
    try {
      const value = fn(message, context);
      if (!value) continue;
      result = result ? `${result} ${value}` : value;
    } catch (err) {
      modLogger.error('messageClassNames seam failed', err);
    }
  }

  return result;
}
