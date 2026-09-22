/**
 * 通知设置行（0.14.1 块J FIX-4 的页面半）。
 *
 * 背景（J-1「FIX-4 名义落地、实际不可达」）：壳侧 `NotifyCenter.settingsSnapshot` /
 * `applySetting` / `onSuppressForegroundChanged` 三个入口在 `app/src/main` 全仓**零外部调用点**
 * （只有定义处互调），`AndroidBridge.kt` 的 35 个 `@JavascriptInterface` 无一涉及 notify/suppress，
 * 本目录亦 0 命中——能力在、入口无，与它要修的缺陷同形复发。本组件补上页面侧入口。
 *
 * 通道选择：桥方法（`window.androidBridge.getNotifySetting` / `setNotifySetting`）而不是 `/api` 路由。
 * 理由是**真源位置**：这些设置落在 Android 侧 `SharedPreferences("dsh-notify")`，引擎侧插件进程
 * 读不到它；桥是同一宿主内的唯一可达通道，与 `setImmersiveMode` / `setDevLogEnabled` /
 * `setOverlayEnabled` / `setVdisplayScale` 等既有设置面完全同构。因此不新增 `/api` 路由，
 * `scripts/api-route-auth-policy.json` 无需登记（该门禁只约束 `/api` 注册）。
 *
 * 数据面纪律（与 `GeneralSettings` / `DevSection` 同款）：
 *  - 全部状态经 `useShellState` 订阅（挂载读 + 可见/回前台重读），不在 `useState` 初值器里裸读桥；
 *  - **写后回读**：`setNotifySetting` 的返回带 `applied`，只有 `applied=true` 才展示为新值，
 *    否则保留壳侧回读值并如实显示失败原因（拒绝乐观置位）。
 */
import { useCallback, useState } from 'react'
import { useShellState } from '../mobile/use-shell-state.ts'
import type {} from '../android-bridge.ts'

/** 通知设置快照（壳侧 `NotifyCenter.settingsSnapshot` 的 JSON 形态）。 */
interface NotifySnapshot {
  ok?: boolean
  /** 前台也投递系统通知时为空；true = 前台抑制开启（工作汇报延后到后台补投）。 */
  suppressForeground?: boolean
  /** 本版默认值（false = 前台真发）。展示它让「当前值 vs 默认值」可区分。 */
  suppressForegroundDefault?: boolean
  /** 五类分类开关：report / question / approval / todo / silent。 */
  categories?: Record<string, boolean>
  /** 写入口附带的判定字段。 */
  applied?: boolean
  reason?: string
  key?: string
}

/**
 * 分类展示名 + **关掉会怎样**（与 `NotifyCenter.Face` 的五类一一对应；顺序即 UI 顺序）。
 *
 * 为什么每行必须带后果（0.14.1 批 4 / P0-5）：旧界面是五个纯标签开关，一行解释都没有。
 * 而关掉「提问 / 授权请求」的实际后果远重于其它三类——引擎侧 `ask_user_question` 与授权请求
 * **没有超时**，用户以为「少点打扰」，实际是任务永久挂起（现象是「AI 不动了」）。
 * 壳侧已把这类的关闭语义改成「不弹窗、不响铃，但仍投递到通知栏可作答」；文案必须如实说明这一点，
 * 否则用户仍在按旧语义做决定。
 */
const CATEGORY_LABELS: ReadonlyArray<readonly [string, string, string]> = [
  ['report', '工作汇报', '关闭后不再提醒；任务本身不受影响'],
  ['question', '提问', '关闭 = 不弹窗、不响铃；提问仍会出现在通知栏、可直接作答（AI 在等你的回答）'],
  ['approval', '授权请求', '关闭 = 不弹窗、不响铃；仍需你在通知栏或应用内批准，工具不会自动放行'],
  ['todo', '待办进度', '关闭后不再显示步骤进度；任务本身不受影响'],
  ['silent', '后台动态', '关闭后不再显示看门狗与引擎状态；只影响提示，不影响引擎'],
]

/**
 * 自检结果（壳侧 `NotifyCenter.selfCheck` 的 JSON 形态）。
 *
 * 为什么必须有这块 UI：`selfCheck` 与两个系统设置深链在页面侧**零调用点**——系统把渠道降级、
 * 或用户误关掉通知时，应用看得见、用户看不见，「系统已降级，应用无法调回」这句永远到不了眼前。
 */
interface NotifySelfCheck {
  ok?: boolean
  channels?: ReadonlyArray<{
    category?: string
    label?: string
    channelId?: string
    importance?: number
    enabled?: boolean
  }>
  degraded?: ReadonlyArray<string>
}

/** 读自检；桥缺席/不可解析返回 null（页面显示「不可用」，不伪造）。 */
function readSelfCheck(): NotifySelfCheck | null {
  try {
    const raw = window.androidBridge?.notifySelfCheck?.()
    if (raw === undefined || raw === '') return null
    const value = JSON.parse(raw) as NotifySelfCheck
    if (value === null || typeof value !== 'object') return null
    if (value.ok === false) return null
    return value
  } catch {
    return null
  }
}

/** 解析桥返回；不可解析/桥缺席一律返回 null（调用方据此显示「不可用」，不伪造状态）。 */
function parseSnapshot(raw: string | undefined): NotifySnapshot | null {
  if (raw === undefined || raw === '') return null
  try {
    const value = JSON.parse(raw) as unknown
    if (value === null || typeof value !== 'object') return null
    const snapshot = value as NotifySnapshot
    // `{ok:false}` = 壳侧明确拒绝（未绑定上下文等）：当作不可用，而不是当作「全部默认值」。
    if (snapshot.ok === false) return null
    return snapshot
  } catch {
    return null
  }
}

/** 读壳侧真源（每次调用现读；桥缺席返回 undefined）。 */
function readSettings(): string | undefined {
  try {
    return window.androidBridge?.getNotifySetting?.('')
  } catch {
    return undefined
  }
}

/**
 * 「通知」设置块：前台抑制开关 + 五类分类开关。
 * @returns 该设置分区内的一个功能块；桥不可用时只显示一行不可用说明。
 */
export function NotifySettingsRow() {
  const [raw, refresh] = useShellState<string | undefined>(readSettings, { pollMs: 0 })
  const [message, setMessage] = useState<string | null>(null)
  // 自检按需拉取（用户点「通知自检」才读）：它是诊断面，不该在每次渲染都问壳侧。
  const [selfCheck, setSelfCheck] = useState<NotifySelfCheck | null>(null)
  const [selfCheckTried, setSelfCheckTried] = useState(false)

  const snapshot = parseSnapshot(raw)

  /** 写一项并**按返回读回**（applied=false 即未生效，不乐观置位）。 */
  const write = useCallback((key: string, value: boolean): void => {
    let reply: NotifySnapshot | null = null
    try {
      reply = parseSnapshot(window.androidBridge?.setNotifySetting?.(key, value))
    } catch {
      reply = null
    }
    if (reply === null) {
      setMessage('写入失败：桥不可用（仅安卓宿主可用）')
      refresh()
      return
    }
    if (reply.applied !== true) {
      // 壳侧如实回了 applied=false（未知 key / 读回不一致）：显示真因，不改展示值。
      setMessage('未生效（' + (reply.reason ?? 'unknown') + '）：' + key)
      refresh()
      return
    }
    setMessage(null)
    // 展示值只认壳侧回读：refresh() 重新从真源读，而不是把入参写进本地 state。
    refresh()
  }, [refresh])

  if (snapshot === null) {
    return (
      <div className="dsh-dev-notify" data-plugin="dev-notify-settings">
        <p className="dsh-dev-hint">通知设置不可用（桥未装配或壳侧上下文未绑定）。</p>
      </div>
    )
  }

  const suppress = snapshot.suppressForeground === true
  const isDefault = suppress === (snapshot.suppressForegroundDefault === true)
  const categories = snapshot.categories ?? {}

  return (
    <div className="dsh-dev-notify" data-plugin="dev-notify-settings">
      <label className="dsh-dev-row dsh-dev-switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="前台抑制通知"
          checked={suppress}
          onChange={(event) => { write('suppressForeground', event.target.checked) }}
        />
        <span>应用在前台时不弹工作汇报（改为延后，回后台补投）</span>
      </label>
      <p className="dsh-dev-hint">
        当前：{suppress ? '前台抑制开启（工作汇报延后）' : '前台照常推送'}
        {isDefault ? '；等于本版默认值' : '；已偏离本版默认值'}
      </p>
      <p className="dsh-dev-hint">
        关闭抑制（默认）即「前台也发系统通知」；开启后命中的工作汇报进入待投队列，
        回到后台或再次关闭抑制时补投（队列有 TTL 与容量上限）。提问与授权请求永不受此项影响。
      </p>

      <div className="dsh-dev-notify-cats">
        {CATEGORY_LABELS.map(([key, label, consequence]) => (
          <div key={key} className="dsh-dev-notify-cat">
            <label className="dsh-dev-row dsh-dev-switch">
              <input
                type="checkbox"
                role="switch"
                aria-label={label}
                checked={categories[key] === true}
                onChange={(event) => { write('cat.' + key, event.target.checked) }}
              />
              <span>{label}</span>
            </label>
            <p className="dsh-dev-hint">{consequence}</p>
          </div>
        ))}
      </div>
      <div className="dsh-dev-row dsh-dev-split">
        <button
          type="button"
          className="dsh-dev-btn"
          onClick={() => {
            setSelfCheckTried(true)
            setSelfCheck(readSelfCheck())
          }}
        >
          通知自检
        </button>
        <button
          type="button"
          className="dsh-dev-btn"
          onClick={() => {
            let ok = false
            try {
              ok = window.androidBridge?.openNotifyAppSettings?.() === true
            } catch {
              ok = false
            }
            if (!ok) setMessage('该系统没有「应用通知设置」页——请在系统设置里手动找到本应用的通知项')
          }}
        >
          系统通知设置
        </button>
      </div>
      {selfCheckTried && selfCheck === null && (
        <p className="dsh-dev-warn">自检不可用（桥未装配或壳侧上下文未绑定）。</p>
      )}
      {selfCheck !== null && (
        <div className="dsh-dev-notify-check">
          {(selfCheck.degraded ?? []).length > 0 ? (
            <p className="dsh-dev-warn">
              系统已降级以下通知：「{(selfCheck.degraded ?? []).join('、')}」——
              应用无法调回，需在系统设置里恢复（可从右侧按钮进入）。
            </p>
          ) : (
            <p className="dsh-dev-hint">系统通知状态正常（未被降级）。</p>
          )}
          {(selfCheck.channels ?? []).map((c) => (
            <div key={String(c.channelId ?? c.category)} className="dsh-dev-row dsh-dev-check-row">
              <span>
                {(c.label ?? c.category ?? '未知渠道')}
                {'：'}
                {c.enabled === false ? '系统已关闭' : '已开启'}
                {typeof c.importance === 'number' ? '（重要性 ' + c.importance + '）' : ''}
              </span>
              <button
                type="button"
                className="dsh-dev-link"
                onClick={() => {
                  const channelId = String(c.channelId ?? '')
                  let ok = false
                  try {
                    ok = channelId !== '' && window.androidBridge?.openNotifyChannelSettings?.(channelId) === true
                  } catch {
                    ok = false
                  }
                  if (!ok) setMessage('无法打开该渠道的系统设置页——请在系统设置里手动查找')
                }}
              >
                打开该渠道设置
              </button>
            </div>
          ))}
        </div>
      )}
      {message !== null && <p className="dsh-dev-warn">{message}</p>}
    </div>
  )
}
