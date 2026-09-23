/**
 * Mobile chrome: the phone form's top bar and its drawer mask.
 *
 * Registered into the frame's `shell.overlay` seat. It owns exactly one
 * control — the sidebar toggle — which is why it exists at all: on a phone the
 * upstream collapsed rail sits off-canvas (mobile-form.css), so the drawer
 * needs one reachable entry, and the composer row stays free of another icon.
 *
 * The open state is mirrored from the frame's own `data-sidebar-collapsed`
 * attribute rather than owned here: the rail keeps its own toggle, and the
 * marker may also flip the attribute through rotation. Reading it keeps the
 * mask and `aria-expanded` honest without a second source of truth.
 */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BROWSER_PENDING_ATTR } from './browser-auto-place.ts'
import css from './MobileChrome.module.css'

/** Copy (the Android layer's product strings are Chinese; see DevSection/ExportResultDialog). */
const TOGGLE_OPEN = '打开导航'
const TOGGLE_CLOSE = '关闭导航'

/** The apply-world callbacks this entry may use. */
export interface MobileChromeInjected {
  /** Toggle the frame's left sidebar (upstream `ctx.layout.toggleSidebar`). */
  toggleSidebar(): void
}

/** Full props: the overlay runtime share (session list included) plus the injected toggle. */
export type MobileChromeProps =
  & PropsRuntime<'shell.overlay'>
  & InjectFace<MobileChromeInjected>

/** The frame root, tagged by the form marker; the right column identifies it before the tag lands. */
function frameElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-dsh-frame]')
    ?? document.querySelector<HTMLElement>('[data-rightbar-col]')?.parentElement
    ?? null
}

/**
 * Mirror whether the left sidebar is expanded.
 * @returns true while the frame renders the sidebar opened.
 */
function useSidebarOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let frame: HTMLElement | null = null
    let frameObserver: MutationObserver | null = null
    const sync = (): void => { setOpen(frame !== null && !frame.hasAttribute('data-sidebar-collapsed')) }
    const bind = (): boolean => {
      frame = frameElement()
      if (frame === null) return false
      frameObserver = new MutationObserver(sync)
      frameObserver.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed'] })
      sync()
      return true
    }
    if (bind()) return () => { frameObserver?.disconnect() }
    // The frame can mount after this entry (plugin order): wait for it.
    const waitObserver = new MutationObserver(() => { if (bind()) waitObserver.disconnect() })
    waitObserver.observe(document.documentElement, { childList: true, subtree: true })
    return () => {
      waitObserver.disconnect()
      frameObserver?.disconnect()
    }
  }, [])
  return open
}

/**
 * The phone form's top bar with the sidebar toggle, plus the drawer mask.
 * @param props - runtime share (unused) and the injected toggle.
 * @returns the chrome, or the hidden shell when the phone form is off.
 */
/**
 * 观察「模型打开了浏览器标签但侧栏收起着」这个跨模块信号（S3-19）。
 *
 * 缺陷现场：侧栏收起时，模型打开浏览器对用户**完全静默**——`browser-auto-place` 只把意图记下来
 * 等用户自己展开，屏上没有任何提示，用户根本不知道有东西在等。这里把它做成侧栏开关上的一个徽标：
 * 位置就在用户要点的那个按钮上，点开即见。
 * @returns true 表示当前有待展开的浏览器标签。
 */
function useBrowserPending(): boolean {
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const sync = (): void => { setPending(document.documentElement.hasAttribute(BROWSER_PENDING_ATTR)) }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [BROWSER_PENDING_ATTR] })
    return () => { observer.disconnect() }
  }, [])
  return pending
}

export function MobileChrome({ toggleSidebar }: MobileChromeProps) {
  const open = useSidebarOpen()
  const browserPending = useBrowserPending()
  return (
    <div className={css.root}>
      <div
        className={css.mask}
        data-open={open || undefined}
        data-dsh-mobile-mask=""
        onClick={() => { toggleSidebar() }}
      />
      <div className={css.bar} data-dsh-mobile-topbar="">
        <button
          type="button"
          className={css.toggle}
          aria-label={
            browserPending && !open
              ? TOGGLE_OPEN + '（有一个浏览器标签在等你展开侧栏）'
              : (open ? TOGGLE_CLOSE : TOGGLE_OPEN)
          }
          aria-expanded={open}
          onClick={() => { toggleSidebar() }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {/* S3-19：侧栏收起时有待展开的浏览器标签 → 开关上给一个可见徽标（不只是 aria）。 */}
          {browserPending && !open && <span className={css.badge} data-dsh-browser-badge="pending" aria-hidden="true" />}
        </button>
        {browserPending && !open && (
          <span className={css.pendingHint} data-dsh-browser-pending-hint="">
            有浏览器标签待展开
          </span>
        )}
      </div>
    </div>
  )
}
