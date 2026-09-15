/**
 * External-open attachment-draft consumer.
 *
 * The queue returns opaque file metadata only. The trusted shell bridge supplies the temporary
 * workspace cwd (never a source-file path); the normal client Session controller creates a blank
 * locally addressable Session there before the source is claimed and attached through the existing
 * composer/upload flow.
 */

export interface IncomingDraftItem {
  entryId: string
  sessionId?: string
  state: 'received' | 'session-created'
  name: string
  bytes: number
}

interface ClaimReply {
  ok: boolean
  ticket?: string
  name?: string
}

interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  blob(): Promise<Blob>
}

export type IncomingDraftFetch = (input: string, init?: RequestInit) => Promise<FetchResponse>

/** Narrow facade over existing session and conversation services. */
export interface IncomingDraftRuntime {
  refreshSessions(): Promise<void>
  createSession(cwd: string): Promise<string>
  openSession(sessionId: string): void
  sessionScope(sessionId: string): unknown | undefined
  attachGenericFile(sessionId: string, file: File): boolean
  notify(scope: unknown, text: string): void
}

function itemOf(value: unknown): IncomingDraftItem | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const item = value as Partial<IncomingDraftItem>
  if (typeof item.entryId !== 'string' || item.entryId === '') return undefined
  if (item.sessionId !== undefined && (typeof item.sessionId !== 'string' || item.sessionId === '')) return undefined
  if (item.state !== 'received' && item.state !== 'session-created') return undefined
  if (typeof item.name !== 'string' || item.name === '') return undefined
  if (typeof item.bytes !== 'number' || !Number.isFinite(item.bytes) || item.bytes < 0) return undefined
  return item as IncomingDraftItem
}

function claimOf(value: unknown): ClaimReply | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const claim = value as ClaimReply
  return claim.ok === true && typeof claim.ticket === 'string' && claim.ticket !== '' && typeof claim.name === 'string' && claim.name !== ''
    ? claim
    : undefined
}

function waitTurn(): Promise<void> {
  return new Promise(resolve => { window.setTimeout(resolve, 100) })
}

/** Drives one process-local external attachment flow. */
export class IncomingDraftConsumer {
  private busy = false
  private readonly hydrating = new Set<string>()
  private readonly createdSessions = new Map<string, string>()
  /** review C10：逐条目的载入尝试计数与终止标记——无 sessionId 的补建必须**有限次**。 */
  private readonly attempts = new Map<string, number>()
  private readonly exhausted = new Set<string>()
  private static readonly MAX_HYDRATE_ATTEMPTS = 5

  /** @param fetchImpl authenticated same-origin fetch. @param runtime session/conversation bridge. */
  constructor(
    private readonly fetchImpl: IncomingDraftFetch,
    private readonly runtime: IncomingDraftRuntime,
  ) {}

  /** Fetch eligible queue metadata and hydrate each blank-session attachment once. */
  async poll(): Promise<void> {
    if (this.busy) return
    this.busy = true
    document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'fetching')
    try {
      const response = await this.fetchImpl('/api/android/file-incoming', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json().catch(() => null) as { items?: unknown[] } | null
      if (!Array.isArray(payload?.items)) return
      document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'items:' + String(payload.items.length))
      for (const raw of payload.items) {
        const item = itemOf(raw)
        if (item !== undefined) await this.hydrate(item)
      }
    } catch (error) {
      console.warn('[dsh-mobile] incoming draft queue retry deferred:', String(error))
    } finally {
      this.busy = false
    }
  }

  /**
   * review C10：尝试次数封顶。旧实现每次轮询无条件重试；createSession 失败时每次都会新建
   * workspace/session（用户侧表现：反复多出临时会话）。封顶后停止自动补建并提示一次，
   * 用户重新分享文件即可得到新条目（进程内新记录不受影响）。
   */
  private exhaustedFor(item: IncomingDraftItem): boolean {
    const attempts = (this.attempts.get(item.entryId) ?? 0) + 1
    this.attempts.set(item.entryId, attempts)
    if (attempts <= IncomingDraftConsumer.MAX_HYDRATE_ATTEMPTS) return false
    document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'exhausted')
    if (!this.exhausted.has(item.entryId)) {
      this.exhausted.add(item.entryId)
      console.warn('[dsh-mobile] incoming draft hydration exhausted; a fresh share is required:', item.name)
      const sessionId = item.sessionId ?? this.createdSessions.get(item.entryId)
      const scope = sessionId === undefined ? undefined : this.runtime.sessionScope(sessionId)
      if (scope !== undefined) {
        this.runtime.notify(scope, '外部附件草稿多次载入失败，已停止自动重试；请重新使用系统打开方式分享文件。')
      }
    }
    return true
  }

  private async hydrate(item: IncomingDraftItem): Promise<void> {
    if (this.hydrating.has(item.entryId)) return
    if (this.exhaustedFor(item)) return
    this.hydrating.add(item.entryId)
    document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'hydrate:' + item.state)
    try {
      const locallyCreated = this.createdSessions.get(item.entryId)
      let sessionId = item.sessionId ?? locallyCreated
      if (sessionId !== undefined) {
        document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'session-refresh')
        try {
          // Only a server-created legacy id needs catalog refresh. A Session returned by the
          // standard client creator is already local; refreshing it can stall behind an unrelated
          // list request before its attachment handoff.
          if (item.sessionId !== undefined) await this.runtime.refreshSessions()
        } catch {
          sessionId = undefined
        }
        if (sessionId !== undefined) {
          try { this.runtime.openSession(sessionId) } catch { /* navigation may lag an addressable Session */ }
          document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'session-opened')
        }
      }
      if (sessionId === undefined) {
        const cwd = window.androidBridge?.incomingWorkspacePath?.() ?? ''
        if (cwd === '') return
        try {
          document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'session-create-call')
          sessionId = await this.runtime.createSession(cwd)
          this.createdSessions.set(item.entryId, sessionId)
          try { this.runtime.openSession(sessionId) } catch { /* attachment handoff is Session-addressed */ }
          document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'session-opened')
        } catch (error) {
          console.warn('[dsh-mobile] incoming session creation deferred:', String(error))
          return
        }
      }
      // J1 admits through the same InputHub shell that owns the rendered composer. The Session
      // controller resolves before that UI scope can be bound on cold WebView startup, so retain
      // the queue record and wait through the bounded binding window rather than losing the draft.
      let scope = this.runtime.sessionScope(sessionId)
      for (let attempt = 0; scope === undefined && attempt < 100; attempt += 1) {
        await waitTurn()
        scope = this.runtime.sessionScope(sessionId)
      }
      if (scope === undefined) return
      let ticket = ''
      try {
        document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'claim')
        const claimResponse = await this.fetchImpl('/api/android/file-incoming/claim', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entryId: item.entryId, sessionId }),
        })
        const claim = claimResponse.ok ? claimOf(await claimResponse.json().catch(() => null)) : undefined
        document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'claim:' + String(claimResponse.status))
        if (claim === undefined) return
        ticket = claim.ticket as string
        const content = await this.fetchImpl('/api/android/file-incoming/content?ticket=' + encodeURIComponent(ticket), {
          credentials: 'same-origin', cache: 'no-store',
        })
        if (!content.ok) throw new Error('incoming content HTTP ' + content.status)
        const file = new File([await content.blob()], claim.name as string, { type: 'application/octet-stream' })
        const attached = this.runtime.attachGenericFile(sessionId, file)
        document.documentElement.setAttribute('data-dsh-incoming-draft-poll', 'attached:' + String(attached))
        await this.finish(ticket, attached ? 'draft-ready' : 'removed')
        ticket = ''
        if (!attached) this.runtime.notify(scope, '外部附件草稿当前无法加入编辑框，请重新使用系统打开方式。')
      } catch {
        if (ticket !== '') await this.finish(ticket, 'removed')
        this.runtime.notify(scope, '外部附件草稿载入失败；文件没有自动发送，请重新使用系统打开方式。')
      }
    } finally {
      this.hydrating.delete(item.entryId)
    }
  }

  private async finish(ticket: string, outcome: 'draft-ready' | 'removed'): Promise<void> {
    try {
      await this.fetchImpl('/api/android/file-incoming/complete', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket, outcome }),
      })
    } catch {
      // The draft is browser-owned; an acknowledgement failure cannot recreate or send it.
    }
  }
}
