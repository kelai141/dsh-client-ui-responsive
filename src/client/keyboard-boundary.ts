/**
 * KeyboardBoundary (issue #57): Android 16 edge-to-edge WebViews do not
 * shrink the layout viewport when the soft keyboard opens (adjustResize
 * does not resize the WebView content; visualViewport shrinks but
 * innerHeight stays 758). The mobile frame (height: 100%) therefore extends
 * under the keyboard, and its scrollable content leaves a blank band below
 * the composer — swiping up past the input reveals empty black.
 *
 * Fix: while the IME inset is non-zero, pin the mobile frame's height to the
 * visualViewport height (the keyboard's top edge). The frame's overflow:
 * hidden then clips the blank band instead of letting it scroll into view.
 * Restored to 100% when the keyboard closes.
 */
export class KeyboardBoundary {
  private frame: HTMLElement | null = null
  private media: MediaQueryList | null = null
  private lastIme = 0
  private lastVv = 0

  /** Watch visualViewport resize + the shell's IME inset variable. */
  attach(): void {
    window.visualViewport?.addEventListener('resize', this.onViewportChange)
    this.media = window.matchMedia('(max-width: 640px)')
    this.media.addEventListener?.('change', this.onViewportChange)
    this.onViewportChange()
  }

  /** Remove listeners and restore the frame height. */
  detach(): void {
    window.visualViewport?.removeEventListener('resize', this.onViewportChange)
    this.media?.removeEventListener?.('change', this.onViewportChange)
    if (this.frame !== null) this.frame.style.height = ''
    this.frame = null
  }

  private readonly onViewportChange = (): void => {
    const frame = document.querySelector<HTMLElement>('[data-mobile]')
    if (frame === null) return
    this.frame = frame
    const rootStyle = getComputedStyle(document.documentElement)
    const ime = Number.parseFloat(rootStyle.getPropertyValue('--dsh-android-ime-bottom')) || 0
    const vv = window.visualViewport
    const vvHeight = vv === null ? 0 : Math.round(vv.height)
    // Only react to real keyboard transitions (IME inset > 0); a resize with
    // no inset is a window resize and must keep the natural 100% height.
    if (ime > 0 && vvHeight > 0 && (ime !== this.lastIme || vvHeight !== this.lastVv)) {
      this.lastIme = ime
      this.lastVv = vvHeight
      frame.style.height = `${vvHeight}px`
    } else if (ime === 0 && (this.lastIme !== 0 || frame.style.height !== '')) {
      this.lastIme = 0
      this.lastVv = 0
      frame.style.height = ''
    }
  }
}
