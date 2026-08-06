let opener: NoneToVoidFunction | undefined;

/**
 * Lets the plugin open the list without importing the component.
 *
 * The modal registers itself when it mounts; the menu item only needs to ask for it. Same
 * arrangement as the deleted-message viewer, and for the same reason: a menu builder is
 * synchronous and cannot reach into a component's state.
 */
export function setBookmarksOpener(fn: NoneToVoidFunction) {
  opener = fn;
}

export function openBookmarks() {
  opener?.();
}
