/**
 * 「手机控制」设置分区（0.14.0 用户定例：把手机控制单独开一个设置页）。
 *
 * 内容：Shizuku 状态与引导 / 开放屏幕范围 / 虚拟屏分辨率档位 / 退后台自动浮窗 / 无障碍入口 /
 * 强制销毁（连点三次确认）。ADB 诊断面板随 0.14.0 移除（ADB 链退役，正式特权通道转 Shizuku）。
 *
 * 数据面纪律：全部经 window.androidBridge 只读回读 + 写后回读；桥不可用/抛错一律回落安全默认。
 */
import { useCallback, useEffect, useState } from 'react'
import { useShellState } from '../mobile/use-shell-state.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '../android-bridge.ts'

type ScreenScope = 'virtual-only' | 'real-only' | 'all'
const SCOPES: readonly ScreenScope[] = ['virtual-only', 'real-only', 'all']
const SCALE_OPTIONS: readonly number[] = [0.5, 0.75, 1]

type VdisplayState = 'disabled' | 'blocked' | 'ready' | 'active'
interface VdisplayStatus {
  state: VdisplayState
  code: string
  guidance: string
  displayId?: number
}
interface A11yStatus {
  enabled?: boolean
  hint?: string
  sdk?: number
  restrictedSettingsApplies?: boolean
}

const STATUS_LABEL: Record<VdisplayState, string> = {
  disabled: '已关闭',
  blocked: '需要准备',
  ready: '可创建',
  active: '已激活',
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

function readA11y(): A11yStatus {
  try {
    const raw = window.androidBridge?.a11yStatus?.()
    if (typeof raw === 'string' && raw.startsWith('{')) return JSON.parse(raw) as A11yStatus
  } catch {
    /* bridge absent: report unavailable rather than guessing */
  }
  return { enabled: false }
}

/**
 * 渲染「手机控制」设置分区。
 * @returns 分区元素树。
 */
export function PhoneControlSection(_props: PropsRuntime<'settings.section'>) {
  const [scope, refreshScope] = useShellState<ScreenScope>(readScope)
  const [vdisplay, refreshVdisplay] = useShellState<VdisplayStatus>(readVdisplay, { pollMs: 2_000 })
  const [scale, refreshScale] = useShellState<number>(readScale)
  const [floatOn, refreshFloat] = useShellState<boolean>(readFloat)
  const [a11y] = useShellState<A11yStatus>(readA11y, { pollMs: 3_000 })
  const [confirmStage, setConfirmStage] = useState(0)
  const [forceMsg, setForceMsg] = useState<string | null>(null)
  const [forceOk, setForceOk] = useState<boolean | null>(null)

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

  return (
    <section className="dsh-screen-control-card" aria-labelledby="dsh-phone-control-title">
      <header className="dsh-screen-control-header">
        <span>
          <strong id="dsh-phone-control-title">手机控制</strong>
          <small>屏幕与特权通道的授权面；模型不能自行更改这里的任何设置。</small>
        </span>
        <span className="dsh-screen-control-state" data-state={vdisplay.state}>{STATUS_LABEL[vdisplay.state]}</span>
      </header>

      <div className="dsh-screen-control-detail">
        <strong>Shizuku 特权通道</strong>
        <span>{vdisplay.code}</span>
        {vdisplay.displayId === undefined ? null : <span>Android displayId = {vdisplay.displayId}</span>}
      </div>
      <p className="dsh-dev-hint">{vdisplay.guidance}</p>
      <button type="button" className="dsh-dev-btn" onClick={refreshVdisplay}>刷新 Shizuku 状态</button>

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
          <strong>退后台自动浮窗</strong>
          <small>只读浮窗：应用切到后台时显示虚拟屏画面；前台只在侧栏可见。</small>
        </span>
        <input
          aria-label="退后台自动浮窗"
          type="checkbox"
          checked={floatOn}
          onChange={(event) => setFloat(event.target.checked)}
        />
      </label>

      <div className="dsh-screen-control-detail">
        <strong>无障碍通道</strong>
        <span>{a11y.enabled === true ? '已开启（语义读取/点击/输入）' : '未开启（推荐开启）'}</span>
        {typeof a11y.hint === 'string' && a11y.hint !== '' ? <span>{a11y.hint}</span> : null}
      </div>
      <button type="button" className="dsh-dev-btn" onClick={openA11y}>去开启无障碍服务</button>

      <div className="dsh-screen-control-detail">
        <strong>强制销毁虚拟屏</strong>
        <span>销毁全部虚拟屏与其上的任务（无视会话归属）；需连续点击三次确认。</span>
      </div>
      <button
        type="button"
        className="dsh-dev-btn"
        data-stage={confirmStage}
        onClick={tapForce}
      >
        {forceLabel}
      </button>
      {forceMsg === null ? null : <p className={forceOk === true ? 'dsh-dev-hint' : 'dsh-dev-error'}>{forceMsg}</p>}
    </section>
  )
}
