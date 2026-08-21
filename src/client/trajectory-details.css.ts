/**
 * Trajectory local details panel (upstream ui-trajectory) on narrow screens
 * (issue apk#67): the upstream ≤760px media query positions the panel
 * absolute within the ledger region — sandwiched between the trajectory
 * timeline bar above and the composer seat below (which also covers its
 * bottom), leaving a cramped reading band. Overlay it full-viewport inside
 * the mobile frame: fixed positioning escapes the ledger, so the panel spans
 * the whole screen (header + tabs fixed, body scrolls) and the input bar
 * never covers it. The upstream col-resize handle is pointless on touch.
 */
export const TRAJECTORY_DETAILS_CSS: string = `
@media (max-width: 760px) {
  [data-mobile] [aria-label="Event details"] {
    position: fixed;
    inset: 0;
    z-index: 40;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    border-left: none;
    box-shadow: none;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  [data-mobile] [aria-label="Event details"] [aria-label="Resize event details"] {
    display: none;
  }
}
`
