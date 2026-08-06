import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';

import logo from '../../assets/draht.svg';

import './TitleBar.scss';

/**
 * The window's title bar, drawn by the page.
 *
 * There is no system frame, so this is the whole of it: the icon, the title, the buttons,
 * and the region you drag the window by. It uses the same surface as the panels below it
 * so the top of the window reads as one piece rather than as a strip laid over the client.
 *
 * The title comes from `document.title`, which the mod already keeps as
 * "Draht | Chat name" — so the bar, the taskbar and Alt-Tab all say the same thing and
 * only one place decides what that is.
 */
const TitleBar: FC = () => {
  const [title, setTitle] = useState(document.title);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const node = document.querySelector('title');
    if (!node) return undefined;

    // The title is rewritten on every chat change, and nothing announces that.
    const observer = new MutationObserver(() => setTitle(document.title));
    observer.observe(node, { childList: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void window.draht?.isWindowMaximized?.().then(setIsMaximized);

    // Maximising also happens from keyboard shortcuts and snap gestures, so the window is
    // asked rather than assumed.
    return window.draht?.onMaximizeChange?.(setIsMaximized);
  }, []);

  // Maximised means the window fills the screen, and a permanent bar there is chrome
  // taking room from the thing you maximised to see. It hides, and returns when the
  // cursor reaches the top edge.
  useEffect(() => {
    document.body.classList.toggle('draht-maximized', isMaximized);

    return () => document.body.classList.remove('draht-maximized');
  }, [isMaximized]);

  /*
   * Revealing it is tracked here rather than left to `:hover`.
   *
   * A hover has no memory: the trigger is a few pixels at the very top, so the bar
   * disappeared again the instant the pointer moved off them — which is on the way to the
   * bar, making it almost impossible to click. Opening on the top edge and closing only
   * once the pointer is clear of the whole bar gives it somewhere to be.
   */
  useEffect(() => {
    if (!isMaximized) {
      document.body.classList.remove('draht-titlebar-open');
      return undefined;
    }

    const REVEAL_AT = 4;
    // Past the bar itself, not past the trigger, so crossing the bar cannot close it.
    const HIDE_BELOW = 40;

    const onMove = (e: MouseEvent) => {
      if (e.clientY <= REVEAL_AT) document.body.classList.add('draht-titlebar-open');
      else if (e.clientY > HIDE_BELOW) document.body.classList.remove('draht-titlebar-open');
    };

    // Leaving through the top — into the bar's own buttons, or off the window — must not
    // count as moving away from it.
    const onLeave = (e: MouseEvent) => {
      if (e.clientY > HIDE_BELOW) document.body.classList.remove('draht-titlebar-open');
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.body.classList.remove('draht-titlebar-open');
    };
  }, [isMaximized]);

  // Outside Electron there is a real title bar already, and these buttons would do nothing.
  if (!window.draht?.closeWindow) return undefined;

  return (
    <div className="draht-titlebar-host">
      <div
        className="draht-titlebar"
        onDoubleClick={() => window.draht?.toggleMaximizeWindow?.()}
      >
        <img src={logo} className="draht-titlebar-icon" alt="" draggable={false} />
        <span className="draht-titlebar-text">{title}</span>

        <div className="draht-titlebar-buttons">
          <button
            type="button"
            className="draht-titlebar-button"
            aria-label="Minimise"
            onClick={() => window.draht?.minimizeWindow?.()}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" /></svg>
          </button>

          <button
            type="button"
            className="draht-titlebar-button"
            aria-label={isMaximized ? 'Restore' : 'Maximise'}
            onClick={() => window.draht?.toggleMaximizeWindow?.()}
          >
            {isMaximized ? (
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 2.5V0.5h7v7h-2" />
                <path d="M0.5 2.5h7v7h-7z" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0.5 0.5h9v9h-9z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="draht-titlebar-button draht-titlebar-close"
            aria-label="Close"
            onClick={() => window.draht?.closeWindow?.()}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(TitleBar);
