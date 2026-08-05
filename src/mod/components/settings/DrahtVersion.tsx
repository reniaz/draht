import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useRef, useState } from '../../../lib/teact/teact';

import './DrahtVersion.scss';

const SCROLLER_SELECTOR = '.settings-content, .settings-main-scroll';

/**
 * The version line at the foot of every settings screen.
 *
 * `APP_VERSION` is baked in at build time, so it describes the bundle rather than the
 * install. It is shown immediately — asking main takes a round trip, and a flicker of
 * empty space is worse than a value that is almost always already right — and replaced by
 * the installed version once main answers. Unpackaged, main answers with nothing, because
 * there the build-time constant is the only version that means anything.
 *
 * Upstream gives every settings screen its own scroller, and this component is mounted
 * once beside all of them rather than edited into each. To read as the end of the page
 * instead of a fixed overlay the line has to sit *inside* that scroller, so it is built as
 * a plain node and appended there. Rendering it through Teact and then moving the element
 * would leave Teact reconciling against a parent the node no longer has.
 */
const DrahtVersion: FC = () => {
  const anchorRef = useRef<HTMLDivElement>();
  const [version, setVersion] = useState(APP_VERSION);

  useEffect(() => {
    void window.draht?.appVersion?.().then((installed) => {
      if (installed) setVersion(installed);
    });
  }, []);

  useEffect(() => {
    const anchor = anchorRef.current;
    const scroller = anchor?.parentElement?.querySelector(SCROLLER_SELECTOR);
    if (!scroller) return undefined;

    const node = document.createElement('div');
    node.className = 'draht-version';

    const name = document.createElement('div');
    name.textContent = `Draht ${version}`;
    const author = document.createElement('div');
    author.textContent = 'made by nejan';

    node.append(name, author);
    scroller.appendChild(node);

    return () => node.remove();
  }, [version]);

  return <div ref={anchorRef} className="draht-version-anchor" />;
};

export default memo(DrahtVersion);
