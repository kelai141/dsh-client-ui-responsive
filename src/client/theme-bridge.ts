// 桥类型单一事实源（含 Window.androidBridge 全局声明）。
import type {} from './android-bridge.ts'

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
    const android = window.androidBridge
    // The shell's early-injected bridge (host-web-compat POLYFILL_SCRIPT) already
    // owns matchMedia and __dshThemeBridge by the time this client bundle loads;
    // patching again would split the ui-theme listener (first patch) from
    // setDark (this instance), so the theme would never follow. Stand down when
    // a bridge is present.
    if ((window as unknown as { __dshThemeBridge?: unknown }).__dshThemeBridge) return
    // L4（2026-08-16）：没有任何 setDark 来源（无早装桥、无壳的同步查询桥）时
    // 也不安装——否则 matchMedia 被 hook 成永无更新来源的悬空桩（桌面等
    // 非 Android 宿主），陈旧值污染后续所有 prefers-color-scheme 查询。
    if (!android || typeof android.getSystemDark !== 'function') return
    const self = this
    const nativeMatchMedia = window.matchMedia.bind(window)

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
    // H1（2026-08-16）：boot 快照同步拉取壳的真实 uiMode——厂商 WebView 的
    // 原生 matchMedia 可能卡 light（vivo/Android 16），首帧即用真实值，
    // 不再依赖 native 查询或后续异步推送。
    try {
      if (android.getSystemDark()) globalObj.__dshThemeBridge.setDark(true)
    } catch { /* 桥查询不可用：保持浅色直到推送 */ }
  }
}
