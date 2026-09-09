/**
 * General-settings additions for the Android shell (issue #59): the upstream
 * Settings → General section lost the Android-only immersive status-bar toggle.
 * The shell bridge exists (androidBridge.setImmersiveMode, persisted by
 * MainActivity) and the row registers at the upstream settings.general.item
 * extension point (auto projected into the General section nav), mirroring
 * DevSection.
 *
 * 0.13.3 (D6 收益省略): the font-size slider (WebView textZoom, 50–200%)
 * retired — upstream ui-theme now ships a native fontSize field (12–17px
 * content font size) rendered in the Appearance section with persistence.
 * The shell's setTextZoom bridge and persistence were removed with it.
 * The immersive toggle reads localStorage (dsh.android.immersive, written by
 * the patched index.html immersive script) for its initial state.
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls in the settings.section owner share (erased at build time, types only).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Single source of truth for the bridge types (incl. the Window.androidBridge global).
import type {} from '../android-bridge.ts'

/** Full section props: the settings shell supplies only `close`. */
export type GeneralSettingsProps = PropsRuntime<'settings.general.item'>

const IMMERSIVE_KEY = 'dsh.android.immersive'

/** Read the persisted immersive flag with the same default the shell uses (true). */
function readImmersive(): boolean {
  try {
    return localStorage.getItem(IMMERSIVE_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Render the Android general-settings rows (immersive toggle).
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function GeneralSettings(_props: GeneralSettingsProps) {
  const [immersive, setImmersive] = useState<boolean>(readImmersive)

  useEffect(() => {
    setImmersive(readImmersive())
  }, [])

  const toggleImmersive = useCallback((enabled: boolean) => {
    setImmersive(enabled)
    try {
      localStorage.setItem(IMMERSIVE_KEY, enabled ? '1' : '0')
    } catch {
      /* storage unavailable: still push to the shell */
    }
    try {
      window.androidBridge?.setImmersiveMode?.(enabled)
    } catch {
      /* bridge absent: desktop fallback no-op */
    }
  }, [])

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
    </div>
  )
}
