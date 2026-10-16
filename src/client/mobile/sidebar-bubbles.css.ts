/** Narrow navigation only; native headers keep their measured boxes and React ownership. */
export const SIDEBAR_BUBBLES_CSS = `
@media (max-width: 767px) {
  [data-dsh-bubble-panel] [data-dsh-bubble-native] {
    visibility: hidden !important; min-height: 48px;
  }
  [data-dsh-bubble-panel]:not([data-sidebar-right-open]) > [data-dsh-bubble-nav] { display: none; }
  [data-dsh-bubble-nav] { box-sizing: border-box; pointer-events: auto; }
  .dsh-bubble-header {
    position: absolute; left: 0; right: 0; z-index: 90; height: 48px;
    display: flex; align-items: center; gap: 2px; padding: 2px 8px;
    background: var(--dsw-specific-sidebar-fill); color: var(--dsw-alias-label-primary);
    border-bottom: 1px solid var(--dsw-alias-border-l2);
  }
  .dsh-bubble-heading { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; }
  .dsh-bubble-heading [data-dockkit-tab-title] { max-width: 100%; }
  .dsh-bubble-control, .dsh-bubble-close {
    flex: none; display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border: 0; border-radius: var(--dsw-radius-sm, 8px);
    padding: 10px; color: var(--dsw-alias-label-secondary); background: transparent;
    font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .dsh-bubble-control svg, .dsh-bubble-close svg { width: 18px; height: 18px; flex: none; }
  .dsh-bubble-control:disabled { opacity: .4; cursor: default; }
  .dsh-bubble-control:hover, .dsh-bubble-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
  [data-dsh-sidebar-bubbles-toggle][aria-expanded='true'] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
  .dsh-bubble-mask { position: absolute; inset: 0; z-index: 75; background: transparent; }
  .dsh-bubble-popover {
    position: absolute; z-index: 85; overflow-x: hidden; overflow-y: auto;
    padding: 5px; scroll-padding: 8px; overscroll-behavior: contain;
    touch-action: pan-y pinch-zoom; -webkit-overflow-scrolling: touch;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
    border-radius: 18px; color: var(--dsw-alias-label-primary);
    background: var(--dsw-specific-sidebar-fill); border: 1px solid var(--dsw-alias-border-l2);
    box-shadow: 0 8px 26px var(--dsw-alias-bg-mask-1);
    transform-origin: top right; transition: opacity 180ms ease, transform 180ms ease, visibility 180ms;
  }
  .dsh-bubble-popover[data-state='closed'] { opacity: 0; transform: translateY(-6px) scale(.97); visibility: hidden; pointer-events: none; }
  .dsh-bubble-popover[data-state='open'] { opacity: 1; transform: none; visibility: visible; }
  .dsh-bubble-list { list-style: none; display: flex; flex-direction: column; gap: 7px; padding: 0; margin: 0; }
  .dsh-bubble-row {
    position: relative; display: flex; align-items: center; min-width: 0; min-height: 46px;
    border-radius: 24px; background: var(--dsw-alias-interactive-bg-hover);
    border: 1px solid transparent; transform-origin: top right;
    transition: opacity 160ms ease, transform 180ms ease; transition-delay: var(--dsh-bubble-delay, 0ms);
  }
  [data-state='closed'] .dsh-bubble-row { opacity: 0; transform: translateY(-8px) scale(.98); }
  .dsh-bubble-row[data-selected] { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-active); }
  .dsh-bubble-select {
    display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1;
    min-height: 46px; padding: 9px 4px 9px 13px; border: 0; border-radius: 24px;
    background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
    touch-action: pan-y pinch-zoom; -webkit-tap-highlight-color: transparent;
  }
  .dsh-bubble-icon { width: 18px; height: 18px; flex: none; color: var(--dsw-alias-label-secondary); }
  .dsh-bubble-label { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.4; }
  .dsh-bubble-label > span { max-width: 100%; }
  .dsh-bubble-close { width: 44px; height: 44px; padding: 13px; }
  .dsh-bubble-row[data-group-start] { margin-top: 7px; }
  .dsh-bubble-row[data-drop='before']::before, .dsh-bubble-row[data-drop='after']::after {
    content: ''; position: absolute; left: 14px; right: 14px; height: 2px;
    background: var(--dsw-alias-label-secondary); border-radius: 2px;
  }
  .dsh-bubble-row[data-drop='before']::before { top: -5px; }
  .dsh-bubble-row[data-drop='after']::after { bottom: -5px; }
  .dsh-bubble-row[data-dragging] { z-index: 1; pointer-events: none; opacity: .82; transition: none; box-shadow: 0 3px 12px var(--dsw-alias-bg-mask-1); }
  .dsh-bubble-actions { display: flex; flex-wrap: wrap; border-top: 1px solid var(--dsw-alias-border-l2); margin-top: 8px; padding-top: 4px; }
  .dsh-bubble-actions .dsh-bubble-control { width: auto; min-width: 44px; gap: 6px; padding: 8px 12px; }
  [data-dsh-bubble-nav] button:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: -3px; }
  .dsh-bubble-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-bubble-popover, .dsh-bubble-row { transition: none !important; }
}
`
