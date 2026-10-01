/**
 * Snapshot manager ancestor promotion (#288), installed with SnapshotPanelsObserver.
 * The header is a flex item in ConversationRoot, so z-index needs no position or
 * transform override. Level 16 clears transcript CodeBlock banners (6), composer
 * chrome (7/9), and local trajectory details (12); it stays below the separate
 * frame overlay seat (20), mobile drawer (30), and fullscreen right panel (40).
 * No width gate: the Android shell also displays the manager in landscape.
 */
export const SNAPSHOT_PANELS_CSS: string = `
div[data-phase] > header[data-window-drag].dsh-mobile-snapshot-header-raised {
  z-index: 16;
}
`
