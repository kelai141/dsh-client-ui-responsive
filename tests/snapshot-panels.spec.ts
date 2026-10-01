// @vitest-environment jsdom
/** Source-derived fixtures only: these do not measure WebView paint or native overlay ordering. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SnapshotPanelsObserver } from '../src/client/snapshot-panels-observer.ts'
import { SNAPSHOT_PANELS_CSS } from '../src/client/snapshot-panels.css.ts'

const RAISED = 'dsh-mobile-snapshot-header-raised'

/** Resolve a vendored-fixed copy from cwd upward; jsdom makes import.meta.url non-file. */
function vendorPath(...segments: string[]): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 4; depth++) {
    const candidate = join(dir, 'vendor', ...segments)
    if (existsSync(candidate)) return candidate
    dir = join(dir, '..')
  }
  throw new Error('vendor copy not found: ' + join('vendor', ...segments))
}
const observers: SnapshotPanelsObserver[] = []

afterEach(() => {
  for (const observer of observers.splice(0)) observer.detach()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function attach(Observer: typeof SnapshotPanelsObserver = SnapshotPanelsObserver): SnapshotPanelsObserver {
  const observer = new Observer()
  observer.attach()
  observers.push(observer)
  return observer
}

/** ConversationMainPanel + ConversationHeader hooks, without guessing hashed module classes. */
function mountConversation(): { root: HTMLElement; header: HTMLElement; seat: HTMLElement; code: HTMLElement } {
  const root = document.createElement('div')
  root.setAttribute('data-phase', 'active')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.innerHTML = '<header data-window-drag style="display:grid;flex:none">' +
    '<div data-conversation-header-leading><button>navigation</button></div>' +
    '<div style="container-type:inline-size"><div data-test-seat></div></div>' +
    '</header><main><pre style="position:relative;z-index:6"><code>content</code></pre></main>'
  document.body.append(root)
  return { root, header: root.querySelector('header')!, seat: root.querySelector('[data-test-seat]')!, code: root.querySelector('pre')! }
}

/** SnapshotPanel lib/client.js:603–724; rows exist even while loading or empty. */
function mountSnapshot(seat: HTMLElement, title = 'unrelated localized title'): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'u_overlay'
  overlay.setAttribute('data-undo-panel', 'true')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999'
  overlay.innerHTML = '<div class="u_panel"><div class="u_head"><span class="u_title"></span></div>' +
    '<div class="u_toolbar"><button class="u_save"></button></div>' +
    '<div class="u_tbody"><div class="u_empty"></div></div><div class="u_foot"></div></div>'
  overlay.querySelector('.u_title')!.textContent = title
  seat.append(overlay)
  return overlay
}

/** Let ownership mutations and the observer's own class mutation settle; no paint assertion. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('snapshot source ownership', () => {
  it('pins exact vendor hooks and the non-portal header mounting path', () => {
    // 不用 new URL(..., import.meta.url)：本文件跑在 jsdom 环境下，import.meta.url 是 http: 协议，
    // fileURLToPath 会抛 TypeError: The URL must be of scheme file（首次进打包门禁时实测）。
    // 改从 cwd 逐级上溯找 vendor/：协调仓布局（cwd=包目录）与 APK 自包含布局都能命中。
    const vendor = readFileSync(vendorPath('dsh-undo-savepoint', 'lib', 'client.js'), 'utf8')
    expect(vendor).toContain('overlay: "u_overlay", panel: "u_panel"')
    expect(vendor).toContain('"data-undo-panel": true')
    expect(vendor).toContain('"data-undo-msg-panel": true')
    expect(vendor).toContain('name: "conversation.session.header.actions"')
    expect(vendor).toContain('(SnapshotPanel, { t: props.t, onClose: () => setPanelOpen(false) })')
    expect(vendor).not.toContain('createPortal')
  })

  it('uses one bounded class selector with no old-WebView or global code-block dependency', () => {
    const css = SNAPSHOT_PANELS_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toContain('div[data-phase] > header[data-window-drag].' + RAISED)
    expect(css).toContain('z-index: 16;')
    expect(css).not.toContain(':has(')
    expect(css).not.toContain('@media')
    expect(css).not.toMatch(/\b(pre|code|iframe|body|html)\b/)
    expect(css).not.toMatch(/(position|transform|isolation|pointer-events|overflow)\s*:/)
    expect(css.match(/\{/g)).toHaveLength(1)
  })
})

describe('SnapshotPanelsObserver header promotion', () => {
  it('raises an already mounted owned header without changing DOM, inline styles, or code paint', () => {
    const { header, seat, code } = mountConversation()
    const overlay = mountSnapshot(seat)
    header.classList.add('other-owner')
    const headerStyle = header.getAttribute('style')
    const overlayStyle = overlay.getAttribute('style')
    const codeStyle = code.getAttribute('style')
    const observer = attach()
    expect(header.classList.contains(RAISED)).toBe(true)
    expect(overlay.parentElement).toBe(seat)
    expect(header.getAttribute('style')).toBe(headerStyle)
    expect(overlay.getAttribute('style')).toBe(overlayStyle)
    expect(code.getAttribute('style')).toBe(codeStyle)
    observer.detach()
    expect(header.classList.contains(RAISED)).toBe(false)
    expect(header.classList.contains('other-owner')).toBe(true)
    expect(header.getAttribute('style')).toBe(headerStyle)
  })

  it('opens, closes, and reopens without depending on CSS.supports or translated labels', async () => {
    vi.stubGlobal('CSS', undefined)
    const { header, seat } = mountConversation()
    attach()
    const first = mountSnapshot(seat, 'Snapshot Manager')
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
    first.remove()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
    mountSnapshot(seat, '快照管理')
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
  })

  it('releases disjoint headers independently when one manager closes', async () => {
    const left = mountConversation()
    const right = mountConversation()
    const first = mountSnapshot(left.seat)
    mountSnapshot(right.seat)
    attach()
    expect(left.header.classList.contains(RAISED)).toBe(true)
    expect(right.header.classList.contains(RAISED)).toBe(true)
    first.remove()
    await settle()
    expect(left.header.classList.contains(RAISED)).toBe(false)
    expect(right.header.classList.contains(RAISED)).toBe(true)
  })

  it('retains a shared header while any of its managers remains', async () => {
    const { header, seat } = mountConversation()
    const first = mountSnapshot(seat)
    const second = mountSnapshot(seat)
    attach()
    first.remove()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
    second.remove()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
  })

  it('tracks an externally moved manager without itself moving any React-owned node', async () => {
    const left = mountConversation()
    const right = mountConversation()
    const overlay = mountSnapshot(left.seat)
    attach()
    right.seat.append(overlay)
    await settle()
    expect(left.header.classList.contains(RAISED)).toBe(false)
    expect(right.header.classList.contains(RAISED)).toBe(true)
    expect(overlay.parentElement).toBe(right.seat)
  })

  it('shares leases across overlapping instances and a module reload', async () => {
    const { header, seat } = mountConversation()
    mountSnapshot(seat)
    const old = attach()
    vi.resetModules()
    const { SnapshotPanelsObserver: Reloaded } = await import('../src/client/snapshot-panels-observer.ts')
    const current = attach(Reloaded)
    old.detach()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
    current.detach()
    expect(header.classList.contains(RAISED)).toBe(false)
  })

  it('does not remove a class already present before acquisition', () => {
    const { header, seat } = mountConversation()
    header.classList.add(RAISED, 'other-owner')
    mountSnapshot(seat)
    const first = attach()
    const second = attach()
    first.detach()
    second.detach()
    expect(header.classList.contains(RAISED)).toBe(true)
    expect(header.classList.contains('other-owner')).toBe(true)
  })

  it('attaches/detaches idempotently, releases detached headers, and can attach again', async () => {
    const { root, header, seat } = mountConversation()
    mountSnapshot(seat)
    const observer = attach()
    observer.attach()
    root.remove()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
    document.body.append(root)
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
    observer.detach()
    observer.detach()
    expect(header.classList.contains(RAISED)).toBe(false)
    observer.attach()
    expect(header.classList.contains(RAISED)).toBe(true)
  })

  it('retracts the class when panel ownership or direct rows disappear', async () => {
    const { header, seat } = mountConversation()
    const overlay = mountSnapshot(seat)
    attach()
    overlay.removeAttribute('data-undo-panel')
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
    overlay.setAttribute('data-undo-panel', 'true')
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
    overlay.querySelector('.u_toolbar')!.remove()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
  })

  it('retracts and restores promotion when the source-owned header seat is reclassified', async () => {
    const { header, seat } = mountConversation()
    mountSnapshot(seat)
    const leading = header.querySelector('[data-conversation-header-leading]')!
    attach()
    leading.removeAttribute('data-conversation-header-leading')
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
    leading.setAttribute('data-conversation-header-leading', '')
    await settle()
    expect(header.classList.contains(RAISED)).toBe(true)
  })

  it('ignores localized text, the message panel, class substrings, and unowned body surfaces', () => {
    const { header, seat, code } = mountConversation()
    code.textContent = '<div class="u_overlay" data-undo-panel>Snapshot Manager 快照管理</div>'
    const message = mountSnapshot(seat)
    message.removeAttribute('data-undo-panel')
    message.setAttribute('data-undo-msg-panel', 'true')
    const hashedGuess = mountSnapshot(seat)
    hashedGuess.className = 'u_overlay_not-the-vendor-class'
    mountSnapshot(document.body)
    attach()
    expect(header.classList.contains(RAISED)).toBe(false)
    expect(document.querySelectorAll('.' + RAISED)).toHaveLength(0)
  })

  it('leaves separate shell/right-panel/browser surfaces and their styles untouched', () => {
    const main = mountConversation()
    mountSnapshot(main.seat)
    const shell = document.createElement('div')
    shell.setAttribute('data-shell-overlay', '')
    shell.style.cssText = 'position:absolute;z-index:20;pointer-events:none'
    const right = document.createElement('div')
    right.setAttribute('data-sidebar-right-panel', 'fullscreen')
    right.style.cssText = 'position:fixed;z-index:40'
    const iframe = document.createElement('iframe')
    right.append(iframe)
    document.body.append(shell, right)
    const shellConversation = mountConversation()
    shell.append(shellConversation.root)
    mountSnapshot(shellConversation.seat)
    const rightConversation = mountConversation()
    right.append(rightConversation.root)
    mountSnapshot(rightConversation.seat)
    const shellStyle = shell.getAttribute('style')
    const rightStyle = right.getAttribute('style')
    attach()
    expect(main.header.classList.contains(RAISED)).toBe(true)
    expect(shellConversation.header.classList.contains(RAISED)).toBe(false)
    expect(rightConversation.header.classList.contains(RAISED)).toBe(false)
    expect(shell.getAttribute('style')).toBe(shellStyle)
    expect(right.getAttribute('style')).toBe(rightStyle)
    expect(iframe.parentElement).toBe(right)
    expect(iframe.className).toBe('')
  })

  it('disconnects before queued mutations can reacquire a disposed class', async () => {
    const { header, seat } = mountConversation()
    const observer = attach()
    mountSnapshot(seat)
    observer.detach()
    await settle()
    expect(header.classList.contains(RAISED)).toBe(false)
  })
})
