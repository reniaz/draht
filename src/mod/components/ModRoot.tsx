import type { FC } from '../../lib/teact/teact';
import { memo } from '../../lib/teact/teact';

import BookmarksModal from '../plugins/bookmarks/BookmarksModal';
import TitleBar from '../plugins/titleBar/TitleBar';
import DeletedLogModal from '../plugins/messageLogger/DeletedLogModal';
import HistoryModal from '../plugins/messageLogger/HistoryModal';
import UpdateModal from './UpdateModal';

/**
 * Mount point for mod UI that has to live at the app root — modals, overlays, anything
 * that must survive the screen it was opened from.
 *
 * Rendered once from `src/components/App.tsx`. That is the only upstream line this costs;
 * every future root-level component nests here instead of adding another.
 *
 * Components are mounted unconditionally and stay inert until opened, rather than being
 * conditional on their plugin being enabled — a disabled plugin simply never triggers
 * them, and gating the mount would mean re-rendering the app root on every settings
 * toggle.
 */
const ModRoot: FC = () => (
  <>
    <HistoryModal />
    <DeletedLogModal />
    <BookmarksModal />
    <TitleBar />
    <UpdateModal />
  </>
);

export default memo(ModRoot);
