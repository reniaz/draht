import { IS_TAURI } from './browser/globalEnvironment';
import { debounce } from './schedulers';
// #region mod
import { withAppTitle } from '../mod/api/PageTitle';
// #endregion mod

const UPDATE_DEBOUNCE_MS = 200;

// For some reason setting `document.title` to the same value
// causes increment of Chrome Dev Tools > Performance Monitor > DOM Nodes counter
export async function setPageTitleInstant(nextTitle: string) {
  // #region mod
  nextTitle = withAppTitle(nextTitle);
  // #endregion mod

  if (IS_TAURI) {
    await window.tauri?.setWindowTitle(nextTitle);

    return;
  }

  if (document.title !== nextTitle) {
    document.title = nextTitle;
  }
}

// Synchronous page title update has conflicts with History API in Chrome
export const setPageTitle = debounce(setPageTitleInstant, UPDATE_DEBOUNCE_MS, false);
