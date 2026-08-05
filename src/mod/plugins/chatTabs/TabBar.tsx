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
  const { openThread } = getActions();
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

    // Closing what you are looking at should move you somewhere, not leave the chat open
    // with its tab gone.
    if (next) openThread({ chatId: next.chatId, threadId: next.threadId });
  });

  if (!tabs.length) return undefined;

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
