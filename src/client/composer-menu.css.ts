/**
 * Composer command-menu scroll fix (upstream ui-input-trigger):
 * .viewport (the menu's scroll container) is a flex child without flex:1,
 * so when the candidate list exceeds max-height (320px), the viewport grows
 * past the menu and gets clipped by the menu's overflow:hidden — the
 * scrollbar lands outside the visible area and the list appears unscrollable.
 * Fix: let the viewport fill the menu and scroll inside it.
 */
export const COMPOSER_MENU_CSS: string = `
[data-composer-card] [role='listbox'] > div {
  flex: 1 1 0%;
  min-height: 0;
}
`