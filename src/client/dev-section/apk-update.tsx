/**
 * 设置页「检查更新」行（0.14.6，用户指令「更新不应该是只更新快照，应该是下载 apk 然后更新」）。
 *
 * ## 为什么需要这一行（缺陷现场）
 *
 * 壳侧下载+校验+安装的**能力一直都在**（UpdateChecker.download 带镜像链与进度回调、
 * updatesDir 零新映射、verifySha256、invokeInstaller、canInstall/requestInstallPermission），
 * 但状态机与入口**长在引导页渲染器里**：GuidePageRenderer 把状态存在私有字段
 * （apkPending / apkReadyToInstall / apkBusy），推进逻辑与文案全在该文件内，触发入口只有
 * buildGuideView 造出的那个按钮；而健康态走 showWeb() 把引导页藏起来。
 * => 于是健康状态下**没有任何更新入口**，这既是用户报障的代码级成因，也与 notify 面
 *    「能力在、入口无」同形。
 *
 * 0.14.6 壳侧把状态机提为单一真源（ApkUpdateState + ApkUpdateController），引导页按钮与本行
 * **读同一份状态**，因此两入口不会互相打架（不会出现「引导页下载到 50%、设置页显示未开始」）。
 *
 * ## 通道与收敛方式
 *
 * 走桥（window.androidBridge.apkUpdate），不走 /api 路由 —— 真源在 Android 侧（Activity 作用域），
 * 引擎侧插件读不到；与 notify-settings.tsx 的定例同构，故 scripts/api-route-auth-policy.json 无需登记。
 *
 * **同步桥不能回 Promise**（@JavascriptInterface 限制），所以用「发起 + 轮询读 status」两段式：
 *   - 发 check / install 只表达**受理**（ok=true 不等于更新成功）；
 *   - 真实进展一律以 `status` 的读回为准。
 * **不使用 page 回调**（onApkUpdateResult / onApkUpdateProgress）：window.__dshBridge 有
 * `if(window.__dshBridge){return}` 的幂等守卫且是**整体赋值**，挂回调存在「被整体跳过」或
 * 「整体覆盖掉 onDirectoryPicked / onPermissionRequired」的风险。轮询读 status 完全不依赖它。
 *
 * ## 纪律
 *  - 只在「进行中」态轮询（checking / downloading），终态立即停止 —— 不做常驻定时器；
 *  - 失败原因**原样展示**壳侧 reason（它已是成句中文且按 8 类归因），不翻译、不截断、不覆盖；
 *  - 桥缺席（桌面宿主）**不得冒充 idle** —— 显示「读不到」，避免把「不可用」渲染成合法空态；
 *  - 全程无自动请求：只有用户显式点击才发 check / install。
 */
import { useCallback, useEffect, useState } from 'react'
import { useShellState } from '../mobile/use-shell-state.ts'
import { noticeDataAttrs, type Notice } from '../user-copy.ts'
import type {} from '../android-bridge.ts'

/** 壳侧 apkUpdate 返回的状态快照。字段名与 ApkUpdateState.snapshotJson 逐字对应。 */
interface ApkUpdateStatus {
  /** 这次调用是否被**受理**（不表示更新成功）。 */
  ok?: boolean
  /** idle / checking / up-to-date / available / downloading / installing / need-permission / failed */
  state?: string
  /** up-to-date 时的当前版本（"v0.14.6"）。 */
  version?: string
  /** available/installing 时的新版 tag。 */
  tag?: string
  /** 新版资产名（本机 ABI 的那个包）——「将装哪个包」的如实信息。 */
  name?: string
  /** 当前版本（裸版本号）。 */
  current?: string
  /** 新版体积（字节）。 */
  sizeBytes?: number
  /** downloading 时的百分比 0..100。 */
  percent?: number
  /** installing 时：是否**复用**了上次已下好的包（没重复拉 169MB）。 */
  reused?: boolean
  /** 失败原因：壳侧给的**用户可读中文**，原样展示。 */
  reason?: string
  /** 失败归类（壳侧闭集：8 类检查失败 + DOWNLOAD_FAILED / ARTIFACT_REJECTED / INSTALLER_UNAVAILABLE）。 */
  kind?: string
  /** 是否处于「可 start」态（已发现新版）。 */
  canStart?: boolean
  /** 受理结果码（accepted / busy / no-pending）。 */
  code?: string
}

/** 进行中态：需要轮询。其余（含终态）一律停止轮询。 */
const BUSY_STATES = new Set(['checking', 'downloading'])

/** 字节格式化（与设置页其它面同款口径，见 runtime-cache.tsx）。 */
function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

/**
 * 读壳侧状态（真源）。
 * @returns 解析后的快照；**桥缺席或返回不可解析时为 null**（调用方据此显示「读不到」，不得冒充 idle）。
 */
function readStatus(): ApkUpdateStatus | null {
  try {
    const raw = window.androidBridge?.apkUpdate?.('status')
    if (typeof raw !== 'string' || raw === '') return null
    const parsed = JSON.parse(raw) as ApkUpdateStatus
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/**
 * 发起一次动作（check / install）。同步桥只回「受理与否」，故返回解析后的快照用于即时反馈。
 * @param action - 壳侧闭集动作名。
 * @returns 解析后的快照；桥缺席或异常时为 null。
 */
function invoke(action: 'check' | 'install'): ApkUpdateStatus | null {
  try {
    const raw = window.androidBridge?.apkUpdate?.(action)
    if (typeof raw !== 'string' || raw === '') return null
    const parsed = JSON.parse(raw) as ApkUpdateStatus
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/**
 * 「检查更新」设置行。
 * @returns 该设置分区内的一个功能块。
 */
export function ApkUpdateRow() {
  const [raw, refresh] = useShellState<ApkUpdateStatus | null>(readStatus)
  const [message, setMessage] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)

  const status = raw ?? null
  const state = typeof status?.state === 'string' ? status.state : ''

  /** 进行中：轮询读回真源。终态不挂定时器（要求：不做常驻轮询）。 */
  const polling = BUSY_STATES.has(state)
  useEffect(() => {
    if (!polling) return
    const timer = window.setInterval(() => { refresh() }, 2000)
    return () => { window.clearInterval(timer) }
  }, [polling, refresh])

  /** 动作按钮：按当前态决定发 check 还是 install（与引导页「同一按钮二次确认」同语义）。 */
  const act = useCallback((): void => {
    const current = readStatus()
    const currentState = typeof current?.state === 'string' ? current.state : ''
    // 已发现新版 -> 下载并安装；否则（含 failed/idle/up-to-date）-> 检查。
    const action: 'check' | 'install' = currentState === 'available' || current?.canStart === true ? 'install' : 'check'
    setMessage(null)
    const accepted = invoke(action)
    if (accepted === null) {
      setMessage({ text: '更新通道不可用（仅安卓应用内有此能力）——请确认在本机应用内操作' })
      return
    }
    // ok 只表达受理；真正的进展由轮询读回。busy 时壳侧会回 ok:false + code:busy，如实说。
    if (accepted.ok !== true) {
      setMessage({ text: accepted.code === 'busy' ? '上一次更新动作仍在进行中，请稍候（进度见下方）' : '这次请求未被受理——' + (accepted.reason ?? '可稍后重试') })
    }
    setBusy(true)
    refresh()
    window.setTimeout(() => { setBusy(false) }, 300)
  }, [refresh])

  /** 主行文案与按钮（八态；终态停止轮询）。 */
  let label = '检查更新'
  let disabled = false
  let text = '运行时与安装包状态未检查'
  switch (state) {
    case 'checking':
      label = '检查中…'; disabled = true; text = '正在查询最新版本…'
      break
    case 'up-to-date':
      label = '重新检查'; text = 'APK 已是最新 ' + (status?.version ?? '')
      break
    case 'available':
      label = '下载并安装 ' + (status?.tag ?? '')
      text = '发现新版 ' + (status?.tag ?? '') + (status?.current === undefined ? '' : '（当前 v' + status.current + '，' + fmtBytes(status?.sizeBytes ?? 0) + '）')
        + '——资产 ' + (status?.name ?? '') + '，再点即开始下载并安装'
      break
    case 'downloading':
      label = '下载中 ' + String(status?.percent ?? 0) + '%'; disabled = true
      text = '正在从镜像链下载 ' + (status?.name ?? '') + (status?.sizeBytes === undefined ? '' : '（' + fmtBytes(status.sizeBytes) + '）') + '——请保持应用在前台'
      break
    case 'installing':
      label = '重新检查'
      text = '已拉起系统安装器——安装完成后重新打开应用即生效'
        + (status?.reused === true ? '（本次复用了上次已下载并校验通过的安装包，未重复下载）' : '')
      break
    case 'need-permission':
      label = '授权后继续安装'; text = '需要「安装未知应用」权限（壳侧已打开授权页）——开启后返回应用即可续继安装'
      break
    case 'failed':
      label = '重试'; text = status?.reason ?? '更新未完成（壳侧未给出原因，可复制日志反馈）'
      break
    default:
      // idle 或读不到：区分「合法空闲」与「通道不可用」，绝不把后者渲染成前者。
      if (status === null) {
        // 措辞纪律：不得在同一行里同时出现「读不到」与「已是最新」——那会让 PASS/失败
        // 判读自相矛盾（本行实测被自己的用例拦下）。这里只说清「无法判断」，不引任何终态词。
        text = '更新状态：读不到——无法判断是否有新版本（应用内的更新通道不可用或返回异常）'
        label = '检查更新'
      }
      break
  }

  return (
    <div className="dsh-dev-cache" data-plugin="dev-apk-update">
      <div className="dsh-dev-row" data-apk-state={status === null ? 'unavailable' : state}>
        <span>{text}</span>
        <button
          type="button"
          className={state === 'failed' ? 'dsh-dev-btn dsh-dev-danger' : 'dsh-dev-btn'}
          disabled={busy || disabled}
          onClick={act}
        >{label}</button>
      </div>

      {message !== null && (
        <p className="dsh-dev-hint" {...noticeDataAttrs(message)}>{message.text}</p>
      )}

      {/* 精简（0.14.7-B D5）：保留「更新的是什么、怎么校验、何时发起」「权限缺失怎么办」
          这些用户真要拿来做决定的信息；去掉与本行按钮状态逐字重复的流程复述。 */}
      <p className="dsh-dev-hint">
        更新的是应用安装包（APK）：从 GitHub 发布页按本机 ABI 选包，下载走镜像链并校验体积与 sha256，
        再拉起系统安装器。全程只在你点击时发起，不自动检查或下载；缺「安装未知应用」权限会先打开授权页。
        安装包落在 Documents/dshdata/updates。
      </p>
    </div>
  )
}
