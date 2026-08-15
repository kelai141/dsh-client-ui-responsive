/**
 * ThemeBridge: make prefers-color-scheme follow the OS dark state on
 * WebViews whose media query does not track the system uiMode (observed on
 * vivo/Android 16: FORCE_DARK_AUTO leaves matchMedia stuck at light).
 *
 * The shell APK watches Configuration changes and pushes the dark flag via
 * window.__dshThemeBridge.setDark(dark). This module hooks matchMedia for the
 * (prefers-color-scheme: dark) query so the upstream ui-theme service
 * (default preference: system) resolves and live-updates through its own
 * listener — zero upstream changes.
 */
export class ThemeBridge {
  private dark = false
  private listeners = new Set<() => void>()
  private patched = false

  /** Install the matchMedia hook and the bridge object (idempotent). */
  install(): void {
    if (this.patched) return
    this.patched = true
    // The shell's early-injected bridge (host-web-compat POLYFILL_SCRIPT) already
    // owns matchMedia and __dshThemeBridge by the time this client bundle loads;
    // patching again would split the ui-theme listener (first patch) from
    // setDark (this instance), so the theme would never follow. Stand down when
    // a bridge is present and act as the fallback otherwise (desktop/web).
    if ((window as unknown as { __dshThemeBridge?: unknown }).__dshThemeBridge) return
    const self = this
    const nativeMatchMedia = window.matchMedia.bind(window)
    const proxyMatches = (query: string): boolean =>
      query.includes('prefers-color-scheme') ? self.dark : nativeMatchMedia(query).matches

    // Intercept the query ui-theme constructs and listens on.
    window.matchMedia = ((query: string): MediaQueryList => {
      if (!query.includes('prefers-color-scheme')) return nativeMatchMedia(query)
      const onChange = (): void => {
        for (const listener of self.listeners) {
          try { listener() } catch { /* a listener must not break the chain */ }
        }
      }
      return {
        get matches() { return self.dark },
        get media() { return query },
        get onchange() { return null },
        set onchange(_v) { /* not used by the theme service */ },
        addEventListener: (type: string, cb: EventListenerOrEventListenerObject | null) => {
          if (type !== 'change' || typeof cb !== 'function') return
          self.listeners.add(cb as () => void)
          onChange()
        },
        removeEventListener: (type: string, cb: EventListenerOrEventListenerObject | null) => {
          if (type !== 'change' || typeof cb !== 'function') return
          self.listeners.delete(cb as () => void)
        },
        addListener: (cb: (e: MediaQueryListEvent) => void) => { self.listeners.add(cb as unknown as () => void) },
        removeListener: (cb: (e: MediaQueryListEvent) => void) => { self.listeners.delete(cb as unknown as () => void) },
        dispatchEvent: () => false,
      } as MediaQueryList
    }) as typeof window.matchMedia

    const globalObj = window as unknown as { __dshThemeBridge?: { setDark: (d: boolean) => void } }
    globalObj.__dshThemeBridge = {
      setDark: (d: boolean): void => {
        if (self.dark === d) return
        self.dark = d
        for (const listener of self.listeners) {
          try { listener() } catch { /* keep the chain alive */ }
        }
      },
    }
    // Snapshot the current OS state so the boot-rendered light page flips at once.
    try {
      const dark = nativeMatchMedia('(prefers-color-scheme: dark)').matches
      if (dark) globalObj.__dshThemeBridge.setDark(true)
    } catch { /* native query unavailable: stay light until the bridge pushes */ }
  }
}
