/**
 * 开发者选项设置页（Android 壳设施）：重启引擎 / 刷新界面 / 打开控制台 /
 * 开发者调试日志开关。注册在上游官方 settings.section 扩展点
 * （ui-settings-general 的 nav 自动投影，零上游改动）。
 * 桥调用走 window.androidBridge（MainActivity addJavascriptInterface 注入）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：拉入 settings.section owner share（构建期擦除，仅类型）。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// 桥类型单一事实源（含 Window.androidBridge 全局声明）。
import type {} from '../android-bridge.ts'

/** Full section props: the settings shell supplies only `close`. */
export type DevSectionProps = PropsRuntime<'settings.section'>

/**
 * Render the developer-options section content column.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function DevSection(_props: DevSectionProps) {
  const [devLog, setDevLog] = useState<boolean>(() => {
    try {
      return window.androidBridge?.getDevLogEnabled?.() ?? false
    } catch {
      return false
    }
  })
  const [restarting, setRestarting] = useState(false)
  const [allFiles, setAllFiles] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setAllFiles(window.androidBridge?.hasAllFilesAccess?.() ?? false)
    } catch {
      setAllFiles(false)
    }
  }, [])

  const restart = useCallback(() => {
    setRestarting(true)
    try {
      window.androidBridge?.restartEngine?.()
    } catch {
      /* bridge absent: nothing to do */
    }
    window.setTimeout(() => setRestarting(false), 1500)
  }, [])

  const reload = useCallback(() => {
    try {
      window.androidBridge?.reloadWebUI?.()
    } catch {
      /* bridge absent: nothing to do */
    }
  }, [])

  const openConsole = useCallback(() => {
    try {
      window.androidBridge?.openConsole?.()
    } catch {
      /* bridge absent: nothing to do */
    }
  }, [])

  const toggleLog = useCallback((enabled: boolean) => {
    setDevLog(enabled)
    try {
      window.androidBridge?.setDevLogEnabled?.(enabled)
    } catch {
      /* bridge absent: nothing to do */
    }
  }, [])

  const logPathHint = allFiles === false
    ? '未授予「所有文件访问」：日志将写入应用私有目录，授权后自动切换公共目录。'
    : '开启后按天写入 Documents/dshdata/log/dsh-<日期>.log。'

  return (
    <div data-plugin="dev-section">
      <p className="dsh-dev-note">
        Android 壳调试设施：控制台为快照内嵌 Termux bash；日志默认关闭。
      </p>
      <div className="dsh-dev-row">
        <button type="button" className="dsh-dev-btn" onClick={restart} disabled={restarting}>
          {restarting ? '重启中…' : '重启引擎'}
        </button>
        <button type="button" className="dsh-dev-btn" onClick={reload}>刷新界面</button>
        <button type="button" className="dsh-dev-btn" onClick={openConsole}>打开控制台</button>
      </div>
      <label className="dsh-dev-row dsh-dev-switch">
        <input
          type="checkbox"
          checked={devLog}
          onChange={(e) => toggleLog(e.target.checked)}
        />
        <span>开发者调试日志</span>
      </label>
      <p className="dsh-dev-hint">{logPathHint}</p>
      <p className="dsh-dev-warn">日志包含命令与模型内容，仅用于排查，请及时清理。</p>
    </div>
  )
}
