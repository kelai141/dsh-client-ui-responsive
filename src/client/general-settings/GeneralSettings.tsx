/**
 * General-settings additions for the Android shell (issue #59): the upstream
 * Settings → General section lost the Android-only immersive status-bar toggle.
 * The shell bridge exists (androidBridge.getImmersiveMode / setImmersiveMode,
 * whose truth source is the shell's ShellState.ImmersiveMode) and the row
 * registers at the upstream settings.general.item extension point (auto
 * projected into the General section nav), mirroring DevSection.
 *
 * 0.13.3 (D6 收益省略): the font-size slider (WebView textZoom, 50–200%)
 * retired — upstream ui-theme now ships a native fontSize field (12–17px
 * content font size) rendered in the Appearance section with persistence.
 * The shell's setTextZoom bridge and persistence were removed with it.
 *
 * ST-10: the value is the bridge's getImmersiveMode() (shell pref is the truth
 * source). The localStorage key (dsh.android.immersive) is only a fallback for
 * hosts without that bridge (desktop / older shells), and this page is its sole
 * writer — no injected index.html script writes it.
 *
 * ST-09: the read goes through useShellState (mount + visible/foreground
 * re-read + write-then-read-back), never a one-shot bridge read.
 */
import { useCallback, useState } from 'react'
import { useShellState } from '../mobile/use-shell-state.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls in the settings.section owner share (erased at build time, types only).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Single source of truth for the bridge types (incl. the Window.androidBridge global).
import type {} from '../android-bridge.ts'

/** Full section props: the settings shell supplies only `close`. */
export type GeneralSettingsProps = PropsRuntime<'settings.general.item'>

const IMMERSIVE_KEY = 'dsh.android.immersive'

/**
 * Immersive initial value (ST-10): the shell bridge is the sole truth source
 * (ShellState.ImmersiveMode); the localStorage mirror is only the fallback for
 * hosts without that bridge, and the default stays true (the shell's default).
 * @returns the effective immersive flag for this render.
 */
function readImmersive(): boolean {
  try {
    const fromBridge = window.androidBridge?.getImmersiveMode?.()
    if (typeof fromBridge === 'boolean') return fromBridge
  } catch {
    /* bridge absent or threw: fall through to the storage mirror */
  }
  try {
    return localStorage.getItem(IMMERSIVE_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Render the Android general-settings rows (immersive and screen scope).
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function GeneralSettings(_props: GeneralSettingsProps) {
  // ST-09：设置页这一处也走 useShellState（挂载 + 可见/回前台重读）；ST-10：真源是壳桥。
  const [immersive, refreshImmersive] = useShellState<boolean>(readImmersive)
  /** 写失败回执（S3-17：本项是设置页里唯一**没有**失败反馈路径的开关）。 */
  const [notice, setNotice] = useState<string | null>(null)

  const toggleImmersive = useCallback((enabled: boolean) => {
    setNotice(null)
    try {
      localStorage.setItem(IMMERSIVE_KEY, enabled ? '1' : '0')
    } catch {
      /* storage unavailable: still push to the shell */
    }
    if (window.androidBridge?.setImmersiveMode === undefined) {
      // 桌面/旧壳没有这个桥：localStorage 镜像就是本机真值，不算失败（本页是它的唯一写入者）。
      refreshImmersive()
      return
    }
    try {
      window.androidBridge.setImmersiveMode(enabled)
    } catch {
      setNotice('设置没有生效：应用与页面的连接不可用——请重新打开应用后再试。')
      refreshImmersive()
      return
    }
    // 写后回读：展示值一律取壳侧真值；**读回与请求不一致时如实说明**（旧实现默默回弹，
    // 用户以为点了没反应）。
    refreshImmersive()
    if (readImmersive() !== enabled) {
      setNotice(
        enabled
          ? '沉浸式状态栏没有开启：系统或应用未接受本次设置——可到系统设置里检查本应用的显示权限。'
          : '沉浸式状态栏没有关闭：系统或应用未接受本次设置——请重试，或重新打开应用。',
      )
    }
  }, [refreshImmersive])

  return (
    <div data-plugin="android-general">
      <label className="dsh-dev-row dsh-dev-switch">
        <input
          type="checkbox"
          checked={immersive}
          onChange={(e) => toggleImmersive(e.target.checked)}
        />
        <span>沉浸式状态栏</span>
      </label>
      <p className="dsh-dev-hint">常态隐藏系统状态栏，边缘滑动临时呼出；关闭后常驻显示。</p>
      {notice !== null && <p className="dsh-dev-warn">{notice}</p>}
    </div>
  )
}
