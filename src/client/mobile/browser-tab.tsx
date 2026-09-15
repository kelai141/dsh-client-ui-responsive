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
    const panelOpen = panel !== null && panel.getAttribute('data-sidebar-right-open') !== null
    const visible = !occupiedRef.current && panelOpen && rect.width > 1 && rect.height > 1 &&
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
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publishBounds)
    if (stageRef.current !== null) observer?.observe(stageRef.current)
    window.addEventListener('resize', publishBounds)
    const timer = window.setInterval(refresh, 1000)
    return () => {
      observer?.disconnect()
      window.clearInterval(timer)
      window.removeEventListener('resize', publishBounds)
      try { window.androidBridge?.browserHostHide?.() } catch { /* host already gone */ }
    }
  }, [publishBounds, refresh])

  // 关闭即销毁（0.14.0）：标签记录消失（关 tab / 会话被删除）时 abort → 销毁页面；
  // 切换标签只是卸载组件（记录仍在），因此 unmount 只 hide。
  useEffect(() => {
    const signal = tabInfo.tab.signal
    const onAbort = () => {
      try { window.androidBridge?.browserHostClose?.() } catch { /* host already gone */ }
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
  const occupied = status.ownerSessionId !== '' && sessionKey !== '' && status.ownerSessionId !== sessionKey

  // 占用态变化立即重发 bounds（原生层与控件一起让位给「由会话 X 使用中」）。
  useEffect(() => {
    occupiedRef.current = occupied
    publishBounds()
  }, [occupied, publishBounds])

  if (occupied) {
    return (
      <section className={css.root} data-plugin="android-browser">
        <div ref={stageRef} className={css.stage} data-testid="browser-stage">
          <p className={css.occupied}>由会话 {status.ownerSessionId.slice(-6)} 使用中</p>
        </div>
      </section>
    )
  }

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
