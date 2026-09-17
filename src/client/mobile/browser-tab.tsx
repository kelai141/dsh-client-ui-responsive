import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '../android-bridge.ts'
import css from './BrowserTab.module.css'

/** 与 host 侧 Files sidebar tab 契约一致。 */
export const BROWSER_TAB_ID = 'android-browser'
export const BROWSER_TAB_KIND = 'android-browser'

/**
 * 0.14.0 极简面板：顶部地址栏 + 单按钮（打开 / 刷新），底部分辨率输入 + PC/手机切换。
 * 除此之外不渲染任何元素与文字；页面级失败由壳侧错误页承担，内核类缺陷只进 logcat。
 */
interface BrowserHostStatus {
  ok: boolean
  available: boolean
  created: boolean
  visible: boolean
  url: string
  title: string
  pageGeneration: number
  viewportId: string
  viewportWidth: number
  viewportHeight: number
  identityId: string
  ownerSessionId: string
  atTop: boolean
  scrollDirection: number
  reason: string
}

const unavailable: BrowserHostStatus = {
  ok: false,
  available: false,
  created: false,
  visible: false,
  url: 'about:blank',
  title: '',
  pageGeneration: 0,
  viewportId: 'device',
  viewportWidth: 0,
  viewportHeight: 0,
  identityId: 'android-real',
  ownerSessionId: '',
  atTop: true,
  scrollDirection: 0,
  reason: 'browser-host-not-wired',
}

/** PC 身份档（与契约的 linux-desktop 同 UA；只换 UA 串，未编入 UA-CH）。 */
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
const MODE_DEFAULTS = { desktop: '1280x720', mobile: '390x844' } as const
const MODE_STORAGE = 'dsh-browser-resolution'

function parseStatus(raw: string | undefined): BrowserHostStatus {
  if (!raw) return unavailable
  try {
    const value = JSON.parse(raw) as Partial<BrowserHostStatus>
    return {
      ok: value.ok === true,
      available: value.available === true,
      created: value.created === true,
      visible: value.visible === true,
      url: typeof value.url === 'string' ? value.url : 'about:blank',
      title: typeof value.title === 'string' ? value.title : '',
      pageGeneration: typeof value.pageGeneration === 'number' ? value.pageGeneration : 0,
      viewportId: typeof value.viewportId === 'string' ? value.viewportId : 'device',
      viewportWidth: typeof value.viewportWidth === 'number' ? value.viewportWidth : 0,
      viewportHeight: typeof value.viewportHeight === 'number' ? value.viewportHeight : 0,
      identityId: typeof value.identityId === 'string' ? value.identityId : 'android-real',
      ownerSessionId: typeof value.ownerSessionId === 'string' ? value.ownerSessionId : '',
      atTop: value.atTop !== false,
      scrollDirection: typeof value.scrollDirection === 'number' ? value.scrollDirection : 0,
      reason: typeof value.reason === 'string' ? value.reason : '',
    }
  } catch {
    return unavailable
  }
}

/** 解析 "宽 x 高"（接受 x / × / * 与空白）；范围与壳侧一致（240..4096）。 */
function parseResolution(text: string): { width: number; height: number } | undefined {
  const match = /^\s*(\d{2,4})\s*[x×*]\s*(\d{2,4})\s*$/i.exec(text)
  if (match === null) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 240 || width > 4096 || height < 240 || height > 4096) return undefined
  return { width, height }
}

function formatResolution(width: number, height: number): string {
  return width + 'x' + height
}

function rememberedResolution(desktop: boolean): string {
  try {
    const stored = window.localStorage?.getItem(MODE_STORAGE)
    if (stored !== null && stored !== undefined) {
      const parsed = JSON.parse(stored) as Record<string, unknown>
      const value = parsed[desktop ? 'desktop' : 'mobile']
      if (typeof value === 'string' && parseResolution(value) !== undefined) return value
    }
  } catch {
    /* storage unavailable */
  }
  return desktop ? MODE_DEFAULTS.desktop : MODE_DEFAULTS.mobile
}

function rememberResolution(desktop: boolean, value: string): void {
  try {
    const stored = window.localStorage?.getItem(MODE_STORAGE)
    const parsed = stored !== null && stored !== undefined ? (JSON.parse(stored) as Record<string, unknown>) : {}
    parsed[desktop ? 'desktop' : 'mobile'] = value
    window.localStorage?.setItem(MODE_STORAGE, JSON.stringify(parsed))
  } catch {
    /* storage unavailable */
  }
}

function normalizeAddress(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/** Browser tab type definition; its guide card belongs beside workspace files. */
export function browserTabDefinition(): SidebarRightTabDefinition {
  return {
    id: BROWSER_TAB_ID,
    kind: BROWSER_TAB_KIND,
    priority: 'extension',
    title: () => 'AI 浏览器',
    guide: [{
      order: 20,
      title: () => 'AI 浏览器',
      description: () => '在右侧栏打开一个独立、隔离的浏览器工作台。',
    }],
  }
}

/**
 * Browser workbench chrome. The page surface is a native second WebView positioned over `stage`;
 * this component owns only DSH-native controls and never embeds a third-party page itself.
 */
export function BrowserTab({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
  const sessionKey = typeof sessionId === 'string' ? sessionId : String(sessionId ?? '')
  const tabInfo = useTabInfo()
  const stageRef = useRef<HTMLDivElement>(null)
  const occupiedRef = useRef(false)
  const [status, setStatus] = useState<BrowserHostStatus>(unavailable)
  const [address, setAddress] = useState('')
  const [resolution, setResolution] = useState('')
  const [desktop, setDesktop] = useState(false)
  const [edited, setEdited] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const refresh = useCallback(() => {
    try {
      setStatus(parseStatus(window.androidBridge?.browserHostStatus?.()))
    } catch {
      setStatus(unavailable)
    }
  }, [])

  const publishBounds = useCallback(() => {
    const stage = stageRef.current
    if (stage === null) return
    const rect = stage.getBoundingClientRect()
    const style = getComputedStyle(stage)
    const panel = stage.closest('[data-sidebar-right-panel]')
    // 可见性判据（0.14.0 设备实证四次修正——三版都错在「拿静态属性当状态」，别再简化）：
    //  1) `data-sidebar-right-open` 收起态**仍是 "true"**、舞台仍有布局矩形 → 只看它恒判可见
    //     （原生覆盖层留在聊天上方）。
    //  2) `[data-rightbar-col]` 上**没有** collapsed 属性，它在祖先 frame 上。
    //  3) `data-rightbar-collapsed` 是**常量**：实测在展开/收起/全屏三种状态下**恒为 "true"**，
    //     它不是状态量。用它当判据 → 恒判「已收起」→ 页面几乎永远不可见。**这是最深的陷阱**：
    //     第一版「修好」缺陷 A 其实只是把页面永久隐藏了（假修）。
    //  4) 权威状态信号 = **展开控件是否在场**。上游 `ExpandButton` 源码注释原文：
    //     「The expand control while the panel is collapsed; nothing while it is shown」——
    //     即 `[data-sidebar-right-expand]` **只在收起时渲染**。设备实测三态吻合：
    //     收起→在场、展开→不在场、全屏→不在场。
    const collapsed = document.querySelector('[data-sidebar-right-expand]') !== null
    const panelOpen = panel !== null && panel.getAttribute('data-sidebar-right-open') !== null
    const visible = !occupiedRef.current && !collapsed && panelOpen &&
      rect.width > 1 && rect.height > 1 &&
      style.display !== 'none' && style.visibility !== 'hidden'
    try {
      window.androidBridge?.browserHostBounds?.(JSON.stringify({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        visible,
        session: sessionKey,
      }))
    } catch {
      /* desktop/old shell: status remains explicitly unavailable */
    }
  }, [sessionKey])

  useEffect(() => {
    refresh()
    publishBounds()
    // 切回本面板时，若页面仍在（壳侧保活）就重新置为可见——否则会表现为「切走即卸载」。
    // 非归属会话不在此列（占用态由渲染层处理，原生层 foreignViewer 亦 fail-closed）。
    try {
      const current = parseStatus(window.androidBridge?.browserHostStatus?.())
      const foreign = current.ownerSessionId !== '' && sessionKey !== '' && current.ownerSessionId !== sessionKey
      // 只在「面板确实展开着 + 页面在但被隐藏」时重申可见性（切走再切回）。
      // 收起态绝不重申：用户刚收起来，再 show 一次就是抢控制权（设备实测的「自动展开」）。
      // 收起判据同 publishBounds：以上游「展开控件在场」为准（data-rightbar-collapsed 是常量，不可用）。
      const collapsedNow = document.querySelector('[data-sidebar-right-expand]') !== null
      if (current.created && !current.visible && !foreign && !collapsedNow) window.androidBridge?.browserHostShow?.()
    } catch {
      /* shell unavailable */
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publishBounds)
    if (stageRef.current !== null) observer?.observe(stageRef.current)
    window.addEventListener('resize', publishBounds)
    // 侧栏收起/展开若只改可见性而不改舞台尺寸，ResizeObserver 不触发 → 原生覆盖层会留在
    // 聊天上方。轮询同批下发 refresh + bounds，保证覆盖层随面板收起/展开即时隐藏/恢复。
    const timer = window.setInterval(() => { refresh(); publishBounds() }, 300)
    return () => {
      observer?.disconnect()
      window.clearInterval(timer)
      window.removeEventListener('resize', publishBounds)
      try { window.androidBridge?.browserHostHide?.() } catch { /* host already gone */ }
    }
  }, [publishBounds, refresh, sessionKey])

  // 保活（SPEC §1.4）：切走标签只是卸载组件 → 只隐藏；标签记录消失（关标签 / 会话被删除）
  // 也不销毁页面，与正常浏览器一致地保活（销毁仅发生在 Activity 销毁或模型显式 browserClose）。
  useEffect(() => {
    const signal = tabInfo.tab.signal
    const onAbort = () => {
      try { window.androidBridge?.browserHostHide?.() } catch { /* host already gone */ }
    }
    signal.addEventListener('abort', onAbort)
    return () => signal.removeEventListener('abort', onAbort)
  }, [tabInfo.tab.signal])

  // 地址栏回填：用户未编辑时跟随当前页 URL。
  useEffect(() => {
    if (edited) return
    setAddress(status.created && status.url !== 'about:blank' ? status.url : '')
  }, [edited, status.created, status.url])

  // 身份档首次同步：壳侧已是桌面档时切到 PC 态（只做一次，不覆盖用户操作）。
  const identitySynced = useRef(false)
  useEffect(() => {
    if (identitySynced.current || !status.available) return
    identitySynced.current = true
    if (status.identityId !== 'android-real') setDesktop(true)
  }, [status.available, status.identityId])

  // 分辨率输入按模式回填（本地记忆）；不随状态轮询抖动。
  useEffect(() => {
    setResolution(rememberedResolution(desktop))
  }, [desktop])

  // 竖屏滚动避让：页面前进（内容上滑）收起控件、回看带回、到顶必现；横屏锁定常驻。
  const landscape = status.viewportWidth > 0 && status.viewportWidth > status.viewportHeight
  useEffect(() => {
    if (!status.created || landscape) {
      setCollapsed(false)
      return () => {}
    }
    const timer = window.setInterval(() => {
      try {
        const next = parseStatus(window.androidBridge?.browserHostStatus?.())
        if (next.atTop || next.scrollDirection <= 0) setCollapsed(false)
        else setCollapsed(true)
      } catch {
        /* keep the last chrome state */
      }
    }, 200)
    return () => window.clearInterval(timer)
  }, [landscape, status.created])

  // 控件收起 / 展开改变工位矩形：重新上报原生 bounds。
  useEffect(() => { publishBounds() }, [collapsed, publishBounds])

  const applyResolution = useCallback((value: string, mode: boolean) => {
    const parsed = parseResolution(value)
    if (parsed === undefined) return
    const formatted = formatResolution(parsed.width, parsed.height)
    try {
      setStatus(parseStatus(window.androidBridge?.browserHostViewport?.(
        JSON.stringify({ id: 'custom', width: parsed.width, height: parsed.height, route: 'S2' }),
      )))
      rememberResolution(mode, formatted)
    } catch {
      /* shell unavailable */
    }
    publishBounds()
  }, [publishBounds])

  const open = useCallback((event?: FormEvent) => {
    event?.preventDefault()
    const target = address.trim()
    const pageOpen = status.created && status.url !== 'about:blank' && status.url !== ''
    const sameAsPage = pageOpen && normalizeAddress(address) === normalizeAddress(status.url)
    try {
      if (sameAsPage) {
        setStatus(parseStatus(window.androidBridge?.browserHostReload?.()))
      } else if (target !== '') {
        setStatus(parseStatus(window.androidBridge?.browserHostShow?.(
          JSON.stringify({ url: target, session: sessionKey }),
        )))
        setEdited(false)
      }
    } catch {
      /* shell unavailable: no text is rendered by design */
    }
    publishBounds()
  }, [address, publishBounds, sessionKey, status.created, status.url])

  const toggleMode = useCallback(() => {
    const nextMode = !desktop
    const value = rememberedResolution(nextMode)
    const parsed = parseResolution(value)
    setDesktop(nextMode)
    setResolution(value)
    try {
      // 身份 + 该模式记忆分辨率合并为一次调用 → 壳侧只重载一次（SPEC §1.2）。
      setStatus(parseStatus(window.androidBridge?.browserHostIdentity?.(JSON.stringify({
        profile: nextMode ? 'linux-desktop' : 'android-real',
        ua: nextMode ? DESKTOP_UA : '',
        preset: 'custom',
        width: parsed?.width ?? 0,
        height: parsed?.height ?? 0,
        route: 'S2',
        session: sessionKey,
      }))))
    } catch {
      /* shell unavailable */
    }
    publishBounds()
  }, [desktop, publishBounds, sessionKey])

  const submitResolution = useCallback((event?: FormEvent) => {
    event?.preventDefault()
    applyResolution(resolution, desktop)
  }, [applyResolution, desktop, resolution])

  const pageOpen = status.created && status.url !== 'about:blank' && status.url !== ''
  const sameAsPage = pageOpen && normalizeAddress(address) === normalizeAddress(status.url)
  const buttonLabel = sameAsPage ? '刷新' : '打开'
  // ── 跨会话占用态已移除（0.14.0 用户口径：按会话隔离、互不占用） ──────────────────
  //
  // 原实现在「壳侧归属 ≠ 本面板会话」时把整个面板替换成「由会话 X 使用中」。那套模型的前提是
  // 工作台全局单实例 + 单向归属锁，于是切到别的对话什么也看不到、且**只有原会话能解锁**
  // （原会话被删则永久锁死）。现在壳侧改为每个会话各自一个 Workspace：
  //   - 本面板的会话就是当前工作台（bounds 下推时已切换过去），`ownerSessionId` 恒等于本会话；
  //   - 别的会话的页面由原生层置为 GONE，根本不会出现"看到别人的页面"，也无需占用提示。
  // 因此 `occupiedRef` 恒为 false；保留该 ref 只为 publishBounds 的既有签名稳定。
  useEffect(() => {
    occupiedRef.current = false
    publishBounds()
  }, [publishBounds])

  return (
    <section className={css.root} data-plugin="android-browser">
      <form className={css.bar + ' ' + css.barTop + (collapsed ? ' ' + css.barCollapsed : '')} onSubmit={open}>
        <input
          aria-label="浏览器地址"
          className={css.input}
          value={address}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://example.com"
          disabled={!status.available}
          onChange={(event) => { setEdited(true); setAddress(event.target.value) }}
        />
        <button type="submit" className={css.primary} disabled={!status.available}>{buttonLabel}</button>
      </form>

      <div ref={stageRef} className={css.stage} data-testid="browser-stage" />

      <form className={css.bar + ' ' + css.barBottom + (collapsed ? ' ' + css.barCollapsed : '')} onSubmit={submitResolution}>
        <input
          aria-label="分辨率"
          className={css.input}
          value={resolution}
          inputMode="numeric"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={desktop ? MODE_DEFAULTS.desktop : MODE_DEFAULTS.mobile}
          disabled={!status.available}
          onChange={(event) => setResolution(event.target.value)}
        />
        <button type="button" className={css.mode} aria-pressed={desktop} onClick={toggleMode} disabled={!status.available}>
          {desktop ? 'PC 网页' : '手机网页'}
        </button>
      </form>
    </section>
  )
}
