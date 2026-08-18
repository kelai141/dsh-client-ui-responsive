/**
 * Android 壳桥类型（window.androidBridge）：MainActivity addJavascriptInterface
 * 注入的全部方法。单一事实源——theme-bridge 与 dev-section 共用此声明；
 * 全部方法可选（桌面/非壳宿主降级安全）。
 */
export interface AndroidShellBridge {
  /** H1：同步查询系统深色（厂商 WebView matchMedia 卡 light 的兜底）。 */
  getSystemDark?: () => boolean
  /** 重启引擎服务进程（kill + watchdog 拉起）。 */
  restartEngine?: () => void
  /** 关闭 harness：停止引擎并回退到初始化（启动/测试）界面（不自动重启）。 */
  shutdownToGuide?: () => void
  /** 刷新 Web UI（重载引擎页面）。 */
  reloadWebUI?: () => void
  /** 打开内置控制台（快照 bash 交互终端）。 */
  openConsole?: () => void
  /** 开发者调试日志开关状态（默认关）。 */
  getDevLogEnabled?: () => boolean
  /** 设置开发者调试日志开关；开启后按天写入 dshdata/log/。 */
  setDevLogEnabled?: (enabled: boolean) => void
  /** 是否已授予「所有文件访问」（外部工作区/公共日志前提）。 */
  hasAllFilesAccess?: () => boolean
}

declare global {
  interface Window {
    /** 壳 APK 注入的 JS 桥（MainActivity）。 */
    androidBridge?: AndroidShellBridge
  }
}
