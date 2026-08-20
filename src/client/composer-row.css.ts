/**
 * Composer control-row narrow-screen fixes:
 * - The model-selection pill is 176px fixed; on phones below the 400px
 *   breakpoint it overlaps the permission/access pill (device-observed on
 *   360dp phones). Cap its width and ellipsize so both stay tappable.
 */
export const COMPOSER_ROW_CSS: string = `
@media (max-width: 400px) {
  [data-composer-card] [aria-label*='选择模型'],
  [data-composer-card] [aria-label*='model'] {
    max-width: 118px;
  }
  [data-composer-card] [aria-label*='选择模型'] span,
  [data-composer-card] [aria-label*='model'] span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
`
