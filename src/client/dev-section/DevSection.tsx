/**
 * Developer-options settings page (Android shell facilities): restart / shut down (both with a
 * custom confirm) / refresh UI / open console / dev debug-log toggle. Registered at the upstream
 * settings.section extension point (auto-projected by ui-settings-general's nav, zero upstream
 * changes). Bridge calls go through window.androidBridge (injected by MainActivity's
 * addJavascriptInterface).
 *
 * Restart and shut down draw a custom frontend confirm because WebView's window.confirm is
 * unreliable under the shell's auto-approving onJsAlert; "Shut down" stops the engine and falls
 * back to the init screen (shell shutdownToGuide bridge).
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls in the settings.section owner share (erased at build time, types only).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Single source of truth for the bridge types (incl. the Window.androidBridge global).
import type {} from '../android-bridge.ts'

/** Full section props: the settings shell supplies only `close`. */
export type DevSectionProps = PropsRuntime<'settings.section'>

const CONFIRM_TEXT: Record<'restart' | 'close', { title: string; desc: string; ok: string }> = {
  restart: {
    title: '重启 DeepSeek Harness？',
    desc: '将终止并自动重新启动本地引擎与页面（约数秒）。未发送的内容会保留在输入框。',
    ok: '重启',
  },
  close: {
    title: '关闭并回退到初始化界面？',
    desc: '将停止本地引擎并退出到初始化界面；引擎不会自动重启，需手动再次启动。',
    ok: '关闭',
  },
}

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
  const [confirm, setConfirm] = useState<'restart' | 'close' | null>(null)

  useEffect(() => {
    try {
      setAllFiles(window.androidBridge?.hasAllFilesAccess?.() ?? false)
    } catch {
      setAllFiles(false)
    }
  }, [])

  const askRestart = useCallback(() => setConfirm('restart'), [])
  const askClose = useCallback(() => setConfirm('close'), [])
  const cancelConfirm = useCallback(() => setConfirm(null), [])

  const doRestart = useCallback(() => {
    setConfirm(null)
    setRestarting(true)
    try {
      window.androidBridge?.restartEngine?.()
    } catch {
      /* bridge absent: nothing to do */
    }
    window.setTimeout(() => setRestarting(false), 2000)
  }, [])

  const doClose = useCallback(() => {
    setConfirm(null)
    try {
      window.androidBridge?.shutdownToGuide?.()
    } catch {
      /* bridge absent: nothing to do */
    }
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

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') cancelConfirm()
    },
    [cancelConfirm],
  )

  const logPathHint = allFiles === false
    ? '未授予「所有文件访问」：日志将写入应用私有目录，授权后自动切换公共目录。'
    : '开启后按天写入 Documents/dshdata/log/dsh-<日期>.log。'

  return (
    <div data-plugin="dev-section" onKeyDown={onKeyDown}>
      <p className="dsh-dev-note">
        Android 壳调试设施：控制台为快照内嵌 Termux bash；日志默认关闭。
      </p>

      <div className="dsh-dev-row">
        <button type="button" className="dsh-dev-btn" onClick={askRestart} disabled={restarting}>
          {restarting ? '重启中…' : '重启'}
        </button>
        <button type="button" className="dsh-dev-btn dsh-dev-danger" onClick={askClose}>关闭</button>
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

      {confirm !== null && (
        <div
          className="dsh-dev-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={CONFIRM_TEXT[confirm].title}
          onClick={cancelConfirm}
        >
          <div
            className="dsh-dev-modal"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="dsh-dev-modal-title">{CONFIRM_TEXT[confirm].title}</p>
            <p className="dsh-dev-modal-desc">{CONFIRM_TEXT[confirm].desc}</p>
            <div className="dsh-dev-modal-actions">
              <button
                type="button"
                className="dsh-dev-btn"
                autoFocus
                onClick={cancelConfirm}
              >取消</button>
              <button
                type="button"
                className={confirm === 'close' ? 'dsh-dev-btn dsh-dev-danger' : 'dsh-dev-btn'}
                onClick={confirm === 'restart' ? doRestart : doClose}
              >{CONFIRM_TEXT[confirm].ok}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
