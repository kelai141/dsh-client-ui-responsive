/** Reconcile native AI-created/closed tabs with the official Sidebar occurrence inventory. */
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarRightOpenTab } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { BROWSER_PENDING_ATTR } from './browser-auto-place.ts'
import { NativeBrowserSession } from './native-browser-adapter.ts'

/** All navigation callbacks are captured by the browser registration's injected services. */
export interface NativeBrowserPlacementOptions {
  readonly sessions: () => readonly SessionId[]
  readonly tabs: () => readonly SidebarRightOpenTab[]
  readonly mounted: () => SessionId | undefined
  readonly expanded: () => boolean
  readonly open: (session: SessionId) => void
  readonly close: (session: SessionId, tabId: TabId) => void
  readonly kind: string
  readonly legacyKind: string
}

/** One workspace per Session; HMR disposes attachments, never native workspace contents. */
export class NativeBrowserPlacement {
  private readonly workspaces = new Map<SessionId, NativeBrowserSession>()
  private readonly pending = new Map<SessionId, Map<string, TabId>>()
  private timer: number | undefined
  private disposed = false

  constructor(private readonly options: NativeBrowserPlacementOptions) {}

  /** @param session - owning Session. @returns stable native adapter for that Session. */
  for(session: SessionId): NativeBrowserSession {
    if (this.disposed) throw new Error('browser-placement-disposed')
    let workspace = this.workspaces.get(session)
    if (workspace === undefined) {
      workspace = new NativeBrowserSession(session)
      this.workspaces.set(session, workspace)
    }
    return workspace
  }

  /** Start discovery without expanding another Session or a collapsed column. */
  attach(): () => void {
    if (this.disposed || this.timer !== undefined) return () => {}
    this.tick()
    this.timer = window.setInterval(() => { this.tick() }, 1000)
    return () => { this.dispose() }
  }

  /** Hide attachments and stop discovery; explicit close remains a separate operation. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.timer !== undefined) window.clearInterval(this.timer)
    for (const workspace of this.workspaces.values()) workspace.dispose()
    this.workspaces.clear()
    this.pending.clear()
    document.documentElement.removeAttribute(BROWSER_PENDING_ATTR)
  }

  private tick(): void {
    if (this.disposed) return
    const mounted = this.options.mounted()
    const ids = new Set([...this.options.sessions(), ...this.options.tabs().map(tab => tab.sessionId), ...this.workspaces.keys()])
    if (mounted !== undefined) ids.add(mounted)
    let mountedPending = false
    for (const session of ids) {
      const workspace = this.for(session)
      try {
        const snapshot = workspace.refresh()
        if (!snapshot.ok || !snapshot.available || !snapshot.authoritativeTabs) continue
        let records = this.options.tabs().filter(tab => tab.sessionId === session
          && (tab.kind === this.options.kind || tab.kind === this.options.legacyKind))
        // A native close removes only the corresponding GUI occurrence, never the Session workspace.
        for (const record of records) {
          const nativeId = workspace.nativeTabId(record.tabId)
          if (nativeId !== undefined && !snapshot.tabs.some(tab => tab.tabId === nativeId)) this.options.close(session, record.tabId)
        }
        records = this.options.tabs().filter(tab => tab.sessionId === session
          && (tab.kind === this.options.kind || tab.kind === this.options.legacyKind))
        let pending = this.pending.get(session)
        if (pending === undefined) { pending = new Map(); this.pending.set(session, pending) }
        for (const native of snapshot.tabs) {
          if (records.some(record => workspace.nativeTabId(record.tabId) === native.tabId || record.tabId === native.uiTabId)) {
            pending.delete(native.tabId)
            continue
          }
          // Native authority may survive a cleared layout. Rebind only after the full inventory
          // confirms the previous occurrence is absent, never by selected/focused native tab.
          if (native.uiTabId !== undefined && this.options.tabs().some(tab => tab.sessionId === session && tab.tabId === native.uiTabId)) continue
          const queued = pending.get(native.tabId)
          const queuedRecord = queued === undefined ? undefined : records.find(record => record.tabId === queued)
          if (queuedRecord !== undefined) {
            if (workspace.claim(queuedRecord.tabId, native.tabId, native.uiTabId)) pending.delete(native.tabId)
            continue
          }
          const legacy = records.find(record => record.kind === this.options.legacyKind && workspace.nativeTabId(record.tabId) === undefined)
          if (legacy !== undefined) {
            if (!workspace.claim(legacy.tabId, native.tabId, native.uiTabId)) pending.set(native.tabId, legacy.tabId)
            continue
          }
          if (session !== mounted || !this.options.expanded()) {
            if (session === mounted) mountedPending = true
            continue
          }
          const before = new Set(this.options.tabs().map(tab => tab.tabId))
          this.options.open(session)
          const created = this.options.tabs().find(tab => tab.sessionId === session && tab.kind === this.options.kind && !before.has(tab.tabId))
          if (created !== undefined) {
            pending.set(native.tabId, created.tabId)
            if (workspace.claim(created.tabId, native.tabId, native.uiTabId)) pending.delete(native.tabId)
            records = this.options.tabs().filter(tab => tab.sessionId === session
              && (tab.kind === this.options.kind || tab.kind === this.options.legacyKind))
          }
        }
        for (const nativeId of pending.keys()) if (!snapshot.tabs.some(tab => tab.tabId === nativeId)) pending.delete(nativeId)
      } catch (_sidebarOperationRefused) {
        workspace.reportFailure('browser-sidebar-operation-refused')
        if (session === mounted) mountedPending = true
      }
    }
    if (mountedPending) document.documentElement.setAttribute(BROWSER_PENDING_ATTR, 'true')
    else document.documentElement.removeAttribute(BROWSER_PENDING_ATTR)
  }
}
