import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiChat } from '../../../api/types';
import type { ChatTab } from './store';

import { getChatTitle } from '../../../global/helpers';
import { selectChat, selectCurrentMessageList } from '../../../global/selectors';
import {
  getTabs, isSameTab, neighbourOf, removeTab, subscribe,
} from './store';

import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';

import Icon from '../../../components/common/icons/Icon';

import './TabBar.scss';

type StateProps = {
  currentChatId?: string;
  currentThreadId?: ChatTab['threadId'];
  chats: Record<string, ApiChat>;
};

/**
 * The strip of open chats above the message header.
 *
 * Tabs are chats within this one window, not separate app instances. Upstream's "open in
 * new tab" calls `window.open`, which in Electron means the OS browser and a second copy
 * of the whole client fighting over the same session — so the seam redirects it here and
 * a tab becomes what it should be: another chat you can switch to.
 */
const TabBar: FC<StateProps> = ({ currentChatId, currentThreadId, chats }) => {
  const { openChat, openThread } = getActions();
  const lang = useOldLang();

  // The tab list lives outside the global state, so redraws are driven by the store.
  const [, forceUpdate] = useState(0);
  useEffect(() => subscribe(() => forceUpdate((v) => v + 1)), []);

  const tabs = getTabs();

  const handleClose = useLastCallback((tab: ChatTab, e: MouseEvent) => {
    e.stopPropagation();

    const isActive = currentChatId === tab.chatId
      && String(currentThreadId) === String(tab.threadId);
    const next = isActive ? neighbourOf(tab) : undefined;

    removeTab(tab);

    if (!isActive) return;

    // Closing what you are looking at should move you somewhere, not leave the chat open
    // with its tab gone. With nothing left to move to, that somewhere is the empty view
    // you start on.
    if (next) openThread({ chatId: next.chatId, threadId: next.threadId });
    else openChat({ id: undefined });
  });

  // A single tab that is the chat you are already looking at says nothing, so the bar
  // stays out of the way. It comes back if you leave that chat, which is also the only
  // way to close the last tab and get back to the empty view.
  const isOnlyCurrent = tabs.length === 1
    && tabs[0].chatId === currentChatId
    && String(tabs[0].threadId) === String(currentThreadId);

  const isVisible = Boolean(tabs.length) && !isOnlyCurrent;

  // The class carries the column's layout change, so it is only present while the bar
  // actually takes up space.
  useEffect(() => {
    document.body.classList.toggle('draht-tabs-visible', isVisible);

    return () => document.body.classList.remove('draht-tabs-visible');
  }, [isVisible]);

  if (!isVisible) return undefined;

  return (
    <div className="draht-tabbar" dir={lang.isRtl ? 'rtl' : undefined}>
      <div className="draht-tabbar-scroll custom-scroll-x">
        {tabs.map((tab) => {
          const key = `${tab.chatId}-${tab.threadId}`;
          const chat = chats[key];
          // Titles are resolved here rather than in the state mapper, because the mapper
          // has no access to hooks and `getChatTitle` needs the language function.
          const title = chat ? getChatTitle(lang, chat) : 'Chat';
          const isActive = currentChatId === tab.chatId
            && String(currentThreadId) === String(tab.threadId);

          return (
            <div
              key={key}
              className={`draht-tab${isActive ? ' draht-tab-active' : ''}`}
              role="button"
              tabIndex={0}
              title={title}
              onClick={() => openThread({ chatId: tab.chatId, threadId: tab.threadId })}
            >
              <span className="draht-tab-title">{title}</span>
              <span
                className="draht-tab-close"
                role="button"
                tabIndex={0}
                aria-label="Close tab"
                onClick={(e) => handleClose(tab, e as unknown as MouseEvent)}
              >
                <Icon name="close" />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(withGlobal(
  (global): StateProps => {
    const { chatId, threadId } = selectCurrentMessageList(global) || {};

    // Read here so a renamed chat re-renders the bar through the same path as everything
    // else that depends on global state.
    const chats: Record<string, ApiChat> = {};
    for (const tab of getTabs()) {
      const chat = selectChat(global, tab.chatId);
      if (chat) chats[`${tab.chatId}-${tab.threadId}`] = chat;
    }

    return { currentChatId: chatId, currentThreadId: threadId, chats };
  },
)(TabBar));
