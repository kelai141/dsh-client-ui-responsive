/**
 * 开发者选项「补齐模型能力」行（0.14.6 功能 A6 的客户端半）。
 *
 * 存在的理由：A7 之后补给只在**保存**时发生（唯一触发器是 settings/document-updated 事件），
 * 因此「用户早就在用的模型、当时缺能力」不会被自动补上——那需要一个显式触发点。A6 要求
 * 「复用现有设置区域，尽量不新增显眼独立按钮」，故这一行直接落在既有的开发者选项里，
 * 与「清除运行时缓存」同一排样式与同一道宿主鉴权门。
 *
 * 纪律：
 *  1. 只调受鉴权的宿主路由 POST `/api/android/model-capability/fill`，带
 *     `credentials: 'same-origin'`（浏览器面凭据 = same-origin 会话 cookie，与
 *     RuntimeCacheRow 同款）。不新增任何模型可见工具（用户裁定 7：仅用户平面）。
 *  2. 结果如实呈现：宿主返回的逐路由 wrote/changes 原样上屏，「没有可补的字段」与
 *     「补齐失败」必须分得开，不得粉饰成「已补齐」。
 *  3. 这是**手动**动作，不做任何轮询、不在挂载时自动触发（A7）。
 */
import { useCallback, useState } from 'react'
import { describeHttpFailure, noticeDataAttrs, type Notice } from '../user-copy.ts'

/** 宿主逐路由结果。 */
interface FillRouteResult {
  route?: string
  /** 该路由本轮是否真的写入了字段。 */
  wrote?: boolean
  /** 未写入时的稳定原因码。 */
  reason?: string
  /** 写入明细（人话，宿主已渲染）。 */
  changes?: string[]
}

/** 宿主载荷。 */
interface FillReport {
  ok?: boolean
  routes?: number
  wrote?: number
  details?: FillRouteResult[]
}

/**
 * 「补齐非内置提供商模型能力」设置行。
 * @returns 该设置分区内的一个功能块。
 */
export function ModelCapabilityRow() {
  const [report, setReport] = useState<FillReport | null>(null)
  const [message, setMessage] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/android/model-capability/fill', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        setMessage({ text: describeHttpFailure('补齐模型能力', response.status), http: response.status })
        return
      }
      const payload = (await response.json().catch(() => null)) as FillReport | null
      if (payload === null) {
        setMessage({ text: '补齐结果无法解析（响应不是预期的数据）——请重试；仍失败可复制日志反馈' })
        return
      }
      setReport(payload)
    } catch {
      setMessage({ text: '补齐请求失败（仅安卓应用内有此能力）——请确认在本机应用内操作' })
    } finally {
      setBusy(false)
    }
  }, [])

  const details = report !== null && Array.isArray(report.details) ? report.details : []
  const wroteCount = typeof report?.wrote === 'number' ? report.wrote : 0
  // 「确实无可补」与「有可补但没写进去」是两回事，主行必须分开说。
  // 旧实现只看 wrote>0，于是「xiaomimimo — 未写入（mutate-rejected）」这种**实际什么都没补上**
  // 的情况也显示成「没有需要补齐的字段」，会让用户以为功能正常（Lead 2026-10-11 裁定：误导性文案）。
  //
  // 注意不能用 details.length - wroteCount：'no-change'（该模型能力已齐全，无可补）是**良性**结果，
  // 不是失败。判据必须是「wrote=false 且原因不是 no-change」——只有这些才是真的没写进去，
  // 把它们说成「未能写入」才既如实又不误报。
  const benignReason = 'no-change'
  const failedCount = details.filter((item) => item.wrote !== true && item.reason !== benignReason).length

  return (
    <div data-plugin="dev-model-capability">
      <div className="dsh-dev-row">
        <span>
          {report === null
            ? '模型能力（非内置提供商）：按需补齐'
            : wroteCount > 0
              ? '模型能力：已补齐 ' + String(wroteCount) + ' 个提供商'
              : failedCount > 0
                // 有路由要补却没写进去：不得暗示成功，也不得吞掉失败（详见下方明细）。
                ? '模型能力：有 ' + String(failedCount) + ' 项未能写入（详见下方）'
                // 真值但无事可做：这不是失败，也要与「读不到」分开。
                : '模型能力：没有需要补齐的字段'}
        </span>
        <button
          type="button"
          className="dsh-dev-btn"
          disabled={busy}
          onClick={() => { void run() }}
        >{busy ? '补齐中…' : '补齐'}</button>
      </div>

      <p className="dsh-dev-hint">
        只对「添加自定义供应商」里手填的提供商生效。按模型 id 在引擎自带厂商目录里查，只补缺失字段
        （思考档位、输入模态、上下文长度、最大输出），不覆盖你已填的值；查不到或存在多个同名候选时
        一律不写，避免写出与真实网关不符的档位。失败原因在下方如实列出。
      </p>

      {message !== null && (
        <p className="dsh-dev-hint" {...noticeDataAttrs(message)}>{message.text}</p>
      )}

      {details.length > 0 && (
        <ul className="dsh-dev-cache-list">
          {details.map((item, index) => (
            <li key={item.route ?? String(index)}>
              {item.route ?? '（未命名路由）'} — {item.wrote === true
                ? '已写入：' + (Array.isArray(item.changes) ? item.changes.join('；') : '')
                : '未写入（' + (item.reason ?? '无原因记录') + '）'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
