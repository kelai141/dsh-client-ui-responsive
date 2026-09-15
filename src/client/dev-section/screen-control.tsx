import { useCallback } from 'react'
import { useShellState } from '../mobile/use-shell-state.ts'
import type {} from '../android-bridge.ts'

type ScreenScope = 'virtual-only' | 'real-only' | 'all'
const SCOPES: readonly ScreenScope[] = ['virtual-only', 'real-only', 'all']

type VdisplayState = 'disabled' | 'blocked' | 'ready' | 'active'
interface VdisplayStatus {
  state: VdisplayState
  code: string
  guidance: string
  displayId?: number
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

const STATUS_LABEL: Record<VdisplayState, string> = {
  disabled: '已关闭',
  blocked: '需要准备',
  ready: '可创建',
  active: '已激活',
}

/** The single settings-side screen-control selector and Shizuku capability readout. */
export function ScreenControlSettings() {
  const [scope, refreshScope] = useShellState<ScreenScope>(readScope)
  const [vdisplay, refreshVdisplay] = useShellState<VdisplayStatus>(readVdisplay, { pollMs: 2_000 })

  const setScope = useCallback((next: ScreenScope) => {
    try { window.androidBridge?.setScreenScope?.(next) } catch { /* bridge absence retains readback */ }
    refreshScope()
  }, [refreshScope])

  return (
    <section className="dsh-screen-control-card" aria-labelledby="dsh-screen-control-title">
      <header className="dsh-screen-control-header">
        <span>
          <strong id="dsh-screen-control-title">屏幕与 Shizuku 控制</strong>
          <small>模型只能读取这里明确开放的屏幕；它不能自行更改此设置。</small>
        </span>
        <span className="dsh-screen-control-state" data-state={vdisplay.state}>{STATUS_LABEL[vdisplay.state]}</span>
      </header>
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
      <div className="dsh-screen-control-detail">
        <strong>虚拟屏幕 1</strong>
        <span>{vdisplay.code}</span>
        {vdisplay.displayId === undefined ? null : <span>Android displayId = {vdisplay.displayId}</span>}
      </div>
      <p className="dsh-dev-hint">{vdisplay.guidance}</p>
      <p className="dsh-dev-hint">创建、销毁和测试应用拉起在“文件”面板的“虚拟屏”页完成；本页只展示授权状态和用户拥有的访问范围。</p>
      <button type="button" className="dsh-dev-btn" onClick={refreshVdisplay}>刷新 Shizuku 状态</button>
    </section>
  )
}
