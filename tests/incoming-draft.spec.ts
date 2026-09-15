// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { IncomingDraftConsumer, type IncomingDraftFetch } from '../src/client/mobile/incoming-draft.ts'

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob(['payload'], { type: 'image/png' }),
  }
}

describe('IncomingDraftConsumer', () => {
  it('hydrates one server-created blank session with a generic file draft and no text prompt', async () => {
    const scope = {}
    const events: string[] = []
    const fetchImpl = vi.fn<IncomingDraftFetch>()
      .mockResolvedValueOnce(json({ items: [{
        entryId: 'opaque-entry', sessionId: 'session-abcdef12-1', state: 'session-created', name: 'picture.png', bytes: 7,
      }] }))
      .mockResolvedValueOnce(json({ ok: true, ticket: 'ticket-1', name: 'picture.png' }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ ok: true, state: 'draft-ready' }))
    const attachGenericFile = vi.fn(() => true)
    const notify = vi.fn()
    const consumer = new IncomingDraftConsumer(fetchImpl, {
      refreshSessions: async () => { events.push('refresh') },
      createSession: async () => 'session-created-unused',
      openSession: (sessionId) => { events.push('open:' + sessionId) },
      sessionScope: () => scope,
      attachGenericFile,
      notify,
    })

    await consumer.poll()

    expect(events).toEqual(['refresh', 'open:session-abcdef12-1'])
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('/api/android/file-incoming/claim')
    expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).toContain('opaque-entry')
    expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).not.toContain('path')
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('/api/android/file-incoming/content?ticket=ticket-1')
    expect(attachGenericFile).toHaveBeenCalledTimes(1)
    const file = attachGenericFile.mock.calls[0]?.[1]
    expect(file?.name).toBe('picture.png')
    expect(file?.type).toBe('application/octet-stream')
    expect(String(fetchImpl.mock.calls[3]?.[1]?.body)).toContain('draft-ready')
    expect(notify).not.toHaveBeenCalled()
  })

  it('waits for the target UI scope before admitting the Session-addressed composer draft', async () => {
    const fetchImpl = vi.fn<IncomingDraftFetch>()
      .mockResolvedValueOnce(json({ items: [{
        entryId: 'opaque-entry', sessionId: 'session-abcdef12-2', state: 'session-created', name: 'notes.txt', bytes: 3,
      }] }))
      .mockResolvedValueOnce(json({ ok: true, ticket: 'ticket-2', name: 'notes.txt' }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ ok: true, state: 'draft-ready' }))
    const openSession = vi.fn()
    const attachGenericFile = vi.fn(() => true)
    const scope = {}
    let scopeReads = 0
    const consumer = new IncomingDraftConsumer(fetchImpl, {
      refreshSessions: async () => {},
      createSession: async () => 'session-created-unused',
      openSession,
      sessionScope: () => ++scopeReads > 1 ? scope : undefined,
      attachGenericFile,
      notify: vi.fn(),
    })

    await consumer.poll()

    expect(openSession).toHaveBeenCalledWith('session-abcdef12-2')
    expect(scopeReads).toBeGreaterThan(1)
    expect(attachGenericFile).toHaveBeenCalledWith('session-abcdef12-2', expect.any(File))
    expect(String(fetchImpl.mock.calls[3]?.[1]?.body)).toContain('draft-ready')
  })

  it('uses the trusted incoming-workspace bridge to create a locally addressable blank Session', async () => {
    const previous = window.androidBridge
    window.androidBridge = { incomingWorkspacePath: () => '/data/user/0/example/incoming' }
    try {
      const scope = {}
      const fetchImpl = vi.fn<IncomingDraftFetch>()
        .mockResolvedValueOnce(json({ items: [{ entryId: 'received', state: 'received', name: 'report.pdf', bytes: 2 }] }))
        .mockResolvedValueOnce(json({ ok: true, ticket: 'ticket-received', name: 'report.pdf' }))
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json({ ok: true, state: 'draft-ready' }))
      const createSession = vi.fn(async () => 'session-created-0004')
      const refreshSessions = vi.fn(async () => {})
      const consumer = new IncomingDraftConsumer(fetchImpl, {
        refreshSessions,
        createSession,
        openSession: () => { throw new Error('navigation projection not ready') },
        sessionScope: () => scope,
        attachGenericFile: () => true,
        notify: vi.fn(),
      })

      await consumer.poll()

      expect(createSession).toHaveBeenCalledWith('/data/user/0/example/incoming')
      expect(refreshSessions).not.toHaveBeenCalled()
      expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).toContain('session-created-0004')
    } finally {
      window.androidBridge = previous
    }
  })

  it('releases the ticket as removed when the composer refuses the draft', async () => {
    const scope = {}
    const fetchImpl = vi.fn<IncomingDraftFetch>()
      .mockResolvedValueOnce(json({ items: [{
        entryId: 'opaque-entry', sessionId: 'session-abcdef12-3', state: 'session-created', name: 'notes.txt', bytes: 3,
      }] }))
      .mockResolvedValueOnce(json({ ok: true, ticket: 'ticket-3', name: 'notes.txt' }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ ok: true, state: 'removed' }))
    const notify = vi.fn()
    const consumer = new IncomingDraftConsumer(fetchImpl, {
      refreshSessions: async () => {},
      createSession: async () => 'session-created-unused',
      openSession: vi.fn(),
      sessionScope: () => scope,
      attachGenericFile: () => false,
      notify,
    })

    await consumer.poll()

    expect(String(fetchImpl.mock.calls[3]?.[1]?.body)).toContain('removed')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  // review C10：无 sessionId 的补建必须有限次——旧实现每次轮询都重试，claim 持续失败时会
  // 反复新建 workspace/session。封顶后停止自动补建，并通过已建会话的 scope 提示一次。
  it('caps repeated hydration attempts and notifies once instead of looping forever', async () => {
    const previous = window.androidBridge
    window.androidBridge = { incomingWorkspacePath: () => '/data/user/0/example/incoming' }
    try {
      const scope = {}
      const fetchImpl = vi.fn<IncomingDraftFetch>(async (input: string) => {
        if (input === '/api/android/file-incoming') {
          return json({ items: [{ entryId: 'stuck', state: 'received', name: 'stuck.bin', bytes: 1 }] })
        }
        // claim/content/complete 永远失败：会话已建但草稿拿不到。
        return json({ ok: false, error: 'incoming entry not found' }, 404)
      })
      const createSession = vi.fn(async () => 'session-created-9999')
      const notify = vi.fn()
      const consumer = new IncomingDraftConsumer(fetchImpl, {
        refreshSessions: async () => {},
        createSession,
        openSession: vi.fn(),
        sessionScope: () => scope,
        attachGenericFile: () => true,
        notify,
      })

      for (let i = 0; i < 8; i += 1) await consumer.poll()

      expect(createSession).toHaveBeenCalledTimes(1)
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify.mock.calls[0]?.[1]).toContain('停止自动重试')
      expect(document.documentElement.getAttribute('data-dsh-incoming-draft-poll')).toBe('exhausted')
    } finally {
      window.androidBridge = previous
    }
  })
})
