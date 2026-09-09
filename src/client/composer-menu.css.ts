/**
 * Composer popup geometry (upstream ui-input-trigger + ui-model-selection):
 * - The slash menu's scroll container (`.viewport`, the `[role='listbox']`) is a
 *   flex child without flex:1, so when the candidate list exceeds max-height the
 *   viewport grows past the menu and is clipped by the menu's overflow:hidden —
 *   the scrollbar lands outside the visible area and the list appears
 *   unscrollable. Fix: let the viewport fill the menu and scroll inside it.
 * - The upstream menus clamp against viewport y=0 only, and size themselves
 *   against their trigger, so on phones they can leave the viewport sideways or
 *   rise above the fixed top bar. `ComposerPopupGuard` measures each open popup
 *   and writes the caps below; the width cap is applied to the scroll container
 *   and to the painted card alike so the card never stays wider than its
 *   content (a blank strip with a detached scrollbar — issue apk#135).
 */
export const COMPOSER_MENU_CSS: string = `
[data-composer-card] [role='listbox'] > div {
  flex: 1 1 0%;
  min-height: 0;
}

[data-mobile] [data-composer-card] [role='listbox'],
[data-mobile] [data-composer-card] [role='menu'] {
  max-width: var(--dsh-mobile-popup-max-width, min(92vw, 340px)) !important;
}

[data-mobile] [data-composer-card] [role='listbox'] {
  max-height: var(--dsh-mobile-menu-max-height, 320px) !important;
}

/* The model menu is its own painted surface; its height cap only exists while
   the guard measures one, so the upstream 360px design cap stays in charge. */
[data-mobile] [data-composer-card] [role='menu'] {
  max-height: var(--dsh-mobile-menu-max-height, none) !important;
}

/* Horizontal containment: the guard marks the painted card of every open
   popup and writes its shift, keeping the card inside the viewport. */
[data-dsh-popup] {
  transform: translateX(var(--dsh-mobile-popup-shift, 0px));
}
`
