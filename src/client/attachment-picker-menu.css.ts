/** Composer paperclip source chooser, built from DSH semantic surface and elevation tokens. */
export const ATTACHMENT_PICKER_MENU_CSS = `
[data-dsh-attachment-picker-menu] {
  position: fixed;
  z-index: 2147483000;
  display: grid;
  gap: 2px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l4);
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-markdown-base);
}
[data-dsh-attachment-picker-menu] [data-dsh-attachment-picker-item] {
  display: flex;
  min-height: 40px;
  width: 100%;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
}
[data-dsh-attachment-picker-menu] [data-dsh-attachment-picker-item] svg {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-attachment-picker-menu] [data-dsh-attachment-picker-item]:hover,
[data-dsh-attachment-picker-menu] [data-dsh-attachment-picker-item]:focus-visible {
  outline: none;
  background: var(--dsw-alias-bg-layer-2);
}
[data-dsh-attachment-picker-menu] [data-dsh-attachment-picker-item]:active {
  background: var(--dsw-alias-bg-layer-1);
}
`
