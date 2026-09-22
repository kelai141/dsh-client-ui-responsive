/**
 * 「手机控制」设置分区（0.14.0 用户定例：把手机控制单独开一个设置页）。
 *
 * 内容：Shizuku 特权通道（状态 + 下载/打开入口 + 视频教程）/ 开放屏幕范围 / 虚拟屏分辨率档位 /
 * 虚拟屏浮窗（退后台自动显示）/ 无障碍入口（含 Android 13+ 受限设置解锁）/ 强制销毁（连点三次确认）。
 *
 * 数据面纪律：全部经 window.androidBridge 只读回读 + 写后回读；桥不可用/抛错一律**如实报不可读**，
 * 不用安全默认值冒充事实（0.14.1 UI 审查：桥缺席时页面显示「未开启 / 0.75 / 仅虚拟屏幕」这些
 * 看起来像事实的值，改完还会自己弹回）。
 *
 * 0.14.1 Shizuku 面重做（用户 2026-09-22 定例，UI 审查 P0）：
 *  - **状态源换掉**：旧实现读的是 `vdisplayStatus()`——标题写「Shizuku 特权通道」，内容却是虚拟屏
 *    状态码与 displayId（只有虚拟屏 blocked 时才顺带透出 Shizuku 的 guidance）。现在读 `shizukuStatus()`，
 *    虚拟屏状态另起一行、名字也改对。
 *  - **两个入口**：左「下载 Shizuku」右「打开 Shizuku」，并列半行宽；**未安装时「打开 Shizuku」不可点**
 *    （旧态是「模型让用户去设置页安装、启动并授权 Shizuku」，而那一页一个入口都没有——死循环）。
 *  - **两个外链共用一条壳侧通道**：下载页与视频教程都只是跳出去，页面只传 key，URL 表在壳侧
 *    （`ExternalLinks`），页面拿不到「打开任意地址」的能力。
 *  - **授权只能由用户在 Shizuku 内完成**（被提权方不得自改授权），壳侧只负责把人送到界面；
 *    回到本页每 2 秒轮询一次状态，授权完成会自动收敛，不需要用户手动点刷新。
 */
import { useCallback, useEffect, useState } from 'react'
import { useShellState } from '../mobile/use-shell-state.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '../android-bridge.ts'

type ScreenScope = 'virtual-only' | 'real-only' | 'all'
const SCOPES: readonly ScreenScope[] = ['virtual-only', 'real-only', 'all']
const SCALE_OPTIONS: readonly number[] = [0.5, 0.75, 1]

/** 外链 key（与壳侧 `ExternalLinks` 的登记名逐字一致）。 */
const LINK_DOWNLOAD = 'shizuku-download'
const LINK_TUTORIAL = 'shizuku-tutorial'

type VdisplayState = 'disabled' | 'blocked' | 'ready' | 'active'
interface VdisplayStatus {
  state: VdisplayState
  code: string
  guidance: string
  displayId?: number
}
interface A11yStatus {
  /** 状态是否真的读到了（false = 桥缺席/解析失败，界面不得冒充「未开启」）。 */
  readable: boolean
  enabled: boolean
  hint: string
  restrictedSettingsApplies: boolean
}
interface ShizukuStatus {
  /** 状态是否真的读到了（false = 桥缺席/解析失败）。 */
  readable: boolean
  installed: boolean
  running: boolean
  granted: boolean
  bound: boolean
  binding: boolean
  guidance: string
}

const STATUS_LABEL: Record<VdisplayState, string> = {
  disabled: '已关闭',
  blocked: '需要准备',
  ready: '可创建',
  active: '已激活',
}

const A11Y_UNREADABLE: A11yStatus = {
  readable: false,
  enabled: false,
  hint: '',
  restrictedSettingsApplies: false,
}

const SHIZUKU_UNREADABLE: ShizukuStatus = {
  readable: false,
  installed: false,
  running: false,
  granted: false,
  bound: false,
  binding: false,
  guidance: '',
}

/**
 * 外链/拉起失败原因的中文口径。
 *
 * 机器码不上屏是本轮 UI 审查的文案专项：`unknown-key` / `no-handler` 这类串对用户无意义，
 * 且不给下一步。这里只做一件事——把壳侧原因翻译成「发生了什么 + 你现在能做什么」。
 */
const LINK_REASON_LABEL: Record<string, string> = {
  'unknown-key': '这个链接没有在本版登记，请更新应用后再试',
  'insecure-url': '链接不是 https，已拒绝打开',
  'no-handler': '设备上没有能打开该链接的应用，请先安装浏览器',
  'not-installed': '还没装 Shizuku，请先点「下载 Shizuku」',
  'bridge not wired': '壳侧未接线（安装包不完整），请重新安装应用',
}

/** 壳侧原因 → 人话（未知原因原样带出，不吞）。 */
export function linkReasonLabel(reason: string | undefined): string {
  if (reason === undefined || reason === '') return '未知原因'
  return LINK_REASON_LABEL[reason] ?? '调用失败：' + reason
}

/**
 * Shizuku 通道状态 → 中文状态词。
 *
 * 五态与壳侧 `ShizukuTransport.status()` 的字段一一对应；顺序即真实推进顺序
 * （未安装 → 未启动 → 未授权 → 未绑定 → 就绪），用户据此知道自己在第几步。
 */
export function shizukuStateLabel(status: ShizukuStatus): string {
  if (!status.readable) return '状态不可读'
  if (!status.installed) return '未安装'
  if (!status.running) return '已安装，Shizuku 未启动'
  if (!status.granted) return '已启动，尚未授权'
  if (!status.bound) return status.binding ? '已授权，通道建立中' : '已授权，通道未建立'
  return '通道就绪'
}

/** 壳侧 guidance 缺失时的兜底说明（每态都能说清「下一步做什么」）。 */
export function shizukuStepHint(status: ShizukuStatus): string {
  if (!status.readable) return '读不到 Shizuku 状态：壳侧桥未装配或解析失败。'
  if (!status.installed) return '点「下载 Shizuku」到发布页装好，再回来点「打开 Shizuku」。'
  if (!status.running) return '点「打开 Shizuku」，在应用内按提示用无线调试启动它（重启设备后需要重做一次）。'
  if (!status.granted) return '点「打开 Shizuku」，在里面允许本应用使用 Shizuku——授权只能由你亲手完成。'
  if (!status.bound) return '状态每 2 秒自动刷新，稍等即可；一直停在这里可以点「打开 Shizuku」重进一次。'
  return '特权通道已就绪，虚拟屏与特权 shell 可以用了。'
}

interface BridgeAnswer {
  ok?: boolean
  reason?: string
  message?: string
}

function parseAnswer(raw: string | undefined): BridgeAnswer | undefined {
  if (raw === undefined || raw === '') return undefined
  try {
    return JSON.parse(raw) as BridgeAnswer
  } catch {
    return undefined
  }
}

/** 外链/拉起类调用统一结算：成功给人话，失败给「原因 + 下一步」，绝不静默。 */
export function settleLinkCall(
  raw: string | undefined,
  okText: string,
  failLead: string,
): { ok: boolean; text: string } {
  const answer = parseAnswer(raw)
  if (answer?.ok === true) return { ok: true, text: okText }
  return { ok: false, text: failLead + '：' + linkReasonLabel(answer?.reason) }
}

/** 受限设置解锁结算（壳侧回 `{ok, message}`，message 已是人话）。 */
export function settleUnlockCall(raw: string | undefined): { ok: boolean; text: string } {
  const answer = parseAnswer(raw)
  if (answer?.ok === true) {
    return { ok: true, text: answer.message ?? '已解锁受限设置，现在可以回系统页开启无障碍服务。' }
  }
  return {
    ok: false,
    text: '解锁失败：' + (answer?.message ?? linkReasonLabel(answer?.reason)),
  }
}

function readScope(): ScreenScope {
  try {
    const raw = window.androidBridge?.getScreenScope?.()
    if (SCOPES.includes(raw as ScreenScope)) return raw as ScreenScope
  } catch {
    /* old/desktop shells retain the safe default */
  }
  return 'virtual-only'
}

function readVdisplay(): VdisplayStatus {
  try {
    const raw = window.androidBridge?.vdisplayStatus?.()
    const parsed = raw ? JSON.parse(raw) as Partial<VdisplayStatus> : undefined
    const state = parsed?.state
    return {
      state: state === 'disabled' || state === 'blocked' || state === 'ready' || state === 'active' ? state : 'blocked',
      code: typeof parsed?.code === 'string' ? parsed.code : 'vdisplay-status-unavailable',
      guidance: typeof parsed?.guidance === 'string' ? parsed.guidance : '虚拟屏状态暂不可读；不会把虚拟屏请求回退到真实屏幕。',
      ...(typeof parsed?.displayId === 'number' ? { displayId: parsed.displayId } : {}),
    }
  } catch {
    return { state: 'blocked', code: 'vdisplay-status-unavailable', guidance: '虚拟屏状态读取失败（fail-closed）。' }
  }
}

function readScale(): number {
  try {
    const value = window.androidBridge?.getVdisplayScale?.()
    if (typeof value === 'number' && Number.isFinite(value)) return value
  } catch {
    /* fall through to the default tier */
  }
  return 0.75
}

function readFloat(): boolean {
  try {
    return window.androidBridge?.getVdisplayFloatEnabled?.() ?? true
  } catch {
    return true
  }
}

/**
 * Shizuku 通道状态（**唯一**「装没装」的事实来源）。
 *
 * `installed` 字段决定「打开 Shizuku」是否可点：拿不到状态时按**未安装**处理（复用
 * [SHIZUKU_UNREADABLE]），于是按钮不可点而不是点了没反应——死路形态在本页被结构性排除。
 */
export function readShizuku(): ShizukuStatus {
  try {
    const raw = window.androidBridge?.shizukuStatus?.()
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : undefined
    if (parsed === undefined || typeof parsed.installed !== 'boolean') return SHIZUKU_UNREADABLE
    return {
      readable: true,
      installed: parsed.installed === true,
      running: parsed.running === true,
      granted: parsed.granted === true,
      bound: parsed.bound === true,
      binding: parsed.binding === true,
      guidance: typeof parsed.guidance === 'string' ? parsed.guidance : '',
    }
  } catch {
    return SHIZUKU_UNREADABLE
  }
}

/** 无障碍通道状态；读不到时如实报不可读，不冒充「未开启」（0.14.1 UI 审查 P1）。 */
export function readA11y(): A11yStatus {
  try {
    const raw = window.androidBridge?.a11yStatus?.()
    if (typeof raw === 'string' && raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return {
        readable: true,
        enabled: parsed.enabled === true,
        hint: typeof parsed.hint === 'string' ? parsed.hint : '',
        restrictedSettingsApplies: parsed.restrictedSettingsApplies === true,
      }
    }
  } catch {
    /* bridge absent: report unavailable rather than guessing */
  }
  return A11Y_UNREADABLE
}

/**
 * 渲染「手机控制」设置分区。
 * @returns 分区元素树。
 */
export function PhoneControlSection(_props: PropsRuntime<'settings.section'>) {
  const [scope, refreshScope] = useShellState<ScreenScope>(readScope)
  const [vdisplay, refreshVdisplay] = useShellState<VdisplayStatus>(readVdisplay, { pollMs: 2_000 })
  const [shizuku, refreshShizuku] = useShellState<ShizukuStatus>(readShizuku, { pollMs: 2_000 })
  const [scale, refreshScale] = useShellState<number>(readScale)
  const [floatOn, refreshFloat] = useShellState<boolean>(readFloat)
  const [a11y, refreshA11y] = useShellState<A11yStatus>(readA11y, { pollMs: 3_000 })
  const [confirmStage, setConfirmStage] = useState(0)
  const [forceMsg, setForceMsg] = useState<string | null>(null)
  const [forceOk, setForceOk] = useState<boolean | null>(null)
  const [shizukuMsg, setShizukuMsg] = useState<string | null>(null)
  const [shizukuOk, setShizukuOk] = useState<boolean | null>(null)
  const [a11yMsg, setA11yMsg] = useState<string | null>(null)
  const [a11yOk, setA11yOk] = useState<boolean | null>(null)

  // 三连点确认：4 秒内没有下一步就复位，避免「隔很久点一下」误触。
  useEffect(() => {
    if (confirmStage === 0) return undefined
    const timer = window.setTimeout(() => setConfirmStage(0), 4_000)
    return () => window.clearTimeout(timer)
  }, [confirmStage])

  const setScope = useCallback((next: ScreenScope) => {
    try { window.androidBridge?.setScreenScope?.(next) } catch { /* readback keeps the truth */ }
    refreshScope()
  }, [refreshScope])

  const setScale = useCallback((next: number) => {
    try { window.androidBridge?.setVdisplayScale?.(next) } catch { /* readback keeps the truth */ }
    refreshScale()
  }, [refreshScale])

  const setFloat = useCallback((enable: boolean) => {
    try { window.androidBridge?.setVdisplayFloatEnabled?.(enable) } catch { /* readback keeps the truth */ }
    refreshFloat()
  }, [refreshFloat])

  const openA11y = useCallback(() => {
    try { window.androidBridge?.openA11ySettings?.() } catch { /* bridge absent on desktop */ }
  }, [])

  const unlockA11y = useCallback(() => {
    let raw: string | undefined
    try { raw = window.androidBridge?.unlockRestrictedSettings?.() } catch { raw = undefined }
    const settled = settleUnlockCall(raw)
    setA11yOk(settled.ok)
    setA11yMsg(settled.text)
    refreshA11y()
  }, [refreshA11y])

  /** 外链与拉起的共同收口（两个入口共用一条通道，结算也共用）。 */
  const runShizukuAction = useCallback((
    call: (() => string) | undefined,
    okText: string,
    failLead: string,
  ) => {
    let raw: string | undefined
    try { raw = call?.() } catch { raw = undefined }
    const settled = settleLinkCall(raw, okText, failLead)
    setShizukuOk(settled.ok)
    setShizukuMsg(settled.text)
    refreshShizuku()
  }, [refreshShizuku])

  const downloadShizuku = useCallback(() => {
    runShizukuAction(
      window.androidBridge?.openExternalLink
        ? () => window.androidBridge!.openExternalLink!(LINK_DOWNLOAD)
        : undefined,
      '已打开 Shizuku 发布页——下载 release 版 APK 装好后回到这里。',
      '打开下载页失败',
    )
  }, [runShizukuAction])

  const tutorialShizuku = useCallback(() => {
    runShizukuAction(
      window.androidBridge?.openExternalLink
        ? () => window.androidBridge!.openExternalLink!(LINK_TUTORIAL)
        : undefined,
      '已用浏览器打开视频教程。',
      '打开教程失败',
    )
  }, [runShizukuAction])

  const openShizuku = useCallback(() => {
    runShizukuAction(
      window.androidBridge?.openShizukuManager
        ? () => window.androidBridge!.openShizukuManager!()
        : undefined,
      '已打开 Shizuku——在那里启动并授权后，回到本页状态会自动刷新。',
      '打开 Shizuku 失败',
    )
  }, [runShizukuAction])

  const tapForce = useCallback(() => {
    const next = confirmStage + 1
    if (next < 3) {
      setConfirmStage(next)
      setForceMsg(null)
      return
    }
    setConfirmStage(0)
    try {
      const raw = window.androidBridge?.forceDestroyVdisplay?.()
      const parsed = raw ? JSON.parse(raw) as { ok?: boolean; code?: string } : undefined
      const ok = parsed?.ok === true
      setForceOk(ok)
      setForceMsg(ok ? '已强制销毁全部虚拟屏。' : '销毁失败：' + String(parsed?.code ?? 'unknown'))
    } catch {
      setForceOk(false)
      setForceMsg('销毁调用失败（原生桥不可用）。')
    }
    refreshVdisplay()
  }, [confirmStage, refreshVdisplay])

  const forceLabel = confirmStage === 0
    ? '强制销毁虚拟屏'
    : '再次点击确认（' + confirmStage + '/3）'
  // P5-5：进入确认态后必须给**取消途径**。旧实现没有任何退出通道——误点一下就只能
  // 「再点两下把它执行掉」或者等 4 秒超时（超时不可见，用户并不知道自己还能等）。
  const forceArmed = confirmStage > 0
  const cancelForce = useCallback(() => {
    setConfirmStage(0)
    setForceMsg(null)
  }, [])

  // 「打开 Shizuku」的可点条件：只有**确知已安装**才可点（读不到状态时按未安装处理）。
  const canOpenShizuku = shizuku.readable && shizuku.installed

  return (
    <section
      className="dsh-screen-control-card"
      aria-labelledby="dsh-phone-control-title"
      {...(vdisplay.displayId === undefined ? {} : { 'data-display-id': String(vdisplay.displayId) })}
    >
      <header className="dsh-screen-control-header">
        <span>
          <strong id="dsh-phone-control-title">手机控制</strong>
          <small>屏幕与特权通道的授权面；模型不能自行更改这里的任何设置。</small>
        </span>
        <span className="dsh-screen-control-state" data-state={vdisplay.state}>{STATUS_LABEL[vdisplay.state]}</span>
      </header>

      {/* 虚拟屏的状态说明：壳侧在 blocked 态把 Shizuku 的 guidance 原样透给 vdisplayStatus，
          于是这句话会和下面 Shizuku 区块**逐字重复**（0.14.1 设备实测）。按值去重——
          只是不重复同一句，不臆造替代文案。 */}
      {vdisplay.guidance !== shizuku.guidance ? (
        <p className="dsh-dev-hint">{vdisplay.guidance}</p>
      ) : null}

      <div className="dsh-screen-control-detail">
        <strong>Shizuku 特权通道</strong>
        <span data-code={shizuku.readable ? undefined : 'shizuku-status-unreadable'}>
          {shizukuStateLabel(shizuku)}
        </span>
      </div>
      <p className="dsh-dev-hint">
        {shizuku.guidance !== '' ? shizuku.guidance : shizukuStepHint(shizuku)}
      </p>
      <div className="dsh-dev-row dsh-dev-split">
        <button type="button" className="dsh-dev-btn" onClick={downloadShizuku}>下载 Shizuku</button>
        <button
          type="button"
          className="dsh-dev-btn"
          disabled={!canOpenShizuku}
          onClick={openShizuku}
        >
          打开 Shizuku
        </button>
      </div>
      <p className="dsh-dev-hint">
        两个入口都会跳到应用外（系统浏览器 / Shizuku 应用）。装好并授权后回到本页即可——
        状态每 2 秒自动刷新，不需要手动操作。授权只能在 Shizuku 内由你亲手完成。
      </p>
      <div className="dsh-dev-row">
        <button type="button" className="dsh-dev-link" onClick={tutorialShizuku}>点击查看教程</button>
        <button type="button" className="dsh-dev-btn" onClick={refreshShizuku}>刷新状态</button>
      </div>
      {shizukuMsg === null ? null : (
        <p className={shizukuOk === true ? 'dsh-dev-hint' : 'dsh-dev-error'}>{shizukuMsg}</p>
      )}

      <label className="dsh-screen-scope-row">
        <span>
          <strong>开放屏幕范围</strong>
          <small>默认仅虚拟屏幕。真实屏幕、截图与控制都遵守此范围和完全访问权限。</small>
        </span>
        <select aria-label="开放屏幕范围" value={scope} onChange={(event) => setScope(event.target.value as ScreenScope)}>
          <option value="virtual-only">仅虚拟屏幕</option>
          <option value="real-only">仅真实屏幕</option>
          <option value="all">全部开放</option>
        </select>
      </label>

      <label className="dsh-screen-scope-row">
        <span>
          <strong>虚拟屏分辨率档位</strong>
          <small>跟随真机比例并同比例缩放 densityDpi（下次建屏生效；默认 0.75，更省性能）。</small>
        </span>
        <select aria-label="虚拟屏分辨率档位" value={String(scale)} onChange={(event) => setScale(Number(event.target.value))}>
          {SCALE_OPTIONS.map((option) => (
            <option key={option} value={String(option)}>
              {option === 1 ? '原生' : String(Math.round(option * 100)) + '%'}
            </option>
          ))}
        </select>
      </label>

      <label className="dsh-screen-scope-row">
        <span>
          <strong>虚拟屏浮窗（退后台自动显示）</strong>
          {/* P5-6：与开发者选项里的「悬浮球」去混淆。两者都叫「浮」，但一个是**虚拟屏只读画面**，
              一个是**任务面板入口**——旧文案各说各的，用户在两页之间对不上号。 */}
          <small>只读浮窗：应用切到后台时显示虚拟屏画面；前台只在侧栏可见。与开发者选项里的「悬浮球」不是同一个东西（那个是任务面板入口）。</small>
        </span>
        <input
          aria-label="虚拟屏浮窗（退后台自动显示）"
          type="checkbox"
          checked={floatOn}
          onChange={(event) => setFloat(event.target.checked)}
        />
      </label>

      <div className="dsh-screen-control-detail">
        <strong>无障碍通道</strong>
        <span>
          {!a11y.readable
            ? '状态不可读'
            : (a11y.enabled ? '已开启（语义读取/点击/输入）' : '未开启（推荐开启）')}
        </span>
        {a11y.hint !== '' ? <span>{a11y.hint}</span> : null}
      </div>
      {a11y.readable && !a11y.enabled && a11y.restrictedSettingsApplies ? (
        <p className="dsh-dev-hint">
          Android 13 及以上对侧载应用默认开启「受限设置」：系统页里本应用的开关会是灰的。
          先点「解锁受限设置」（经 Shizuku 特权通道，只影响本应用这一项），再回去开启。
        </p>
      ) : null}
      <div className="dsh-dev-row">
        <button type="button" className="dsh-dev-btn" onClick={openA11y}>去开启无障碍服务</button>
        {a11y.readable && !a11y.enabled && a11y.restrictedSettingsApplies ? (
          <button type="button" className="dsh-dev-btn" onClick={unlockA11y}>解锁受限设置</button>
        ) : null}
      </div>
      {a11yMsg === null ? null : (
        <p className={a11yOk === true ? 'dsh-dev-hint' : 'dsh-dev-error'}>{a11yMsg}</p>
      )}

      <div className="dsh-screen-control-detail">
        <strong>强制销毁虚拟屏</strong>
        <span>销毁全部虚拟屏与其上的任务（无视会话归属）；需连续点击三次确认，点错可取消。</span>
      </div>
      {/* P5-5：破坏性按钮必须与同页的普通按钮**看得出区别**（dsh-dev-danger），
          并在确认态给「取消」。此前它长得和「刷新状态」一模一样，还紧邻其它按钮。 */}
      <div className="dsh-dev-row">
        <button
          type="button"
          className={forceArmed ? 'dsh-dev-btn dsh-dev-danger' : 'dsh-dev-btn'}
          data-stage={confirmStage}
          data-armed={forceArmed ? 'true' : 'false'}
          onClick={tapForce}
        >
          {forceLabel}
        </button>
        {forceArmed ? (
          <button type="button" className="dsh-dev-link" onClick={cancelForce}>取消</button>
        ) : null}
      </div>
      {forceMsg === null ? null : <p className={forceOk === true ? 'dsh-dev-hint' : 'dsh-dev-error'}>{forceMsg}</p>}
    </section>
  )
}
