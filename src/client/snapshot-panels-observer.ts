/**
 * Raise the conversation header while its vendored snapshot manager is open (#288).
 *
 * vendor/dsh-undo-savepoint/lib/client.js renders SnapshotPanel in
 * conversation.session.header.actions, not a body portal. Its exact hooks are
 * div.u_overlay[data-undo-panel] > div.u_panel and the panel's direct u_* rows.
 * ConversationHeader publishes data-window-drag and a direct leading seat;
 * ConversationMainPanel renders that header as a flex item under div[data-phase].
 * Raising this header puts its titleRow container context above transcript paint
 * without moving React nodes, changing code blocks, or raising the frame itself.
 * The deployed stacking chain/paint order has not been measured; this is the
 * source-backed header path, not a claim about every possible overlay ancestor.
 */

const OVERLAY_SELECTOR = 'div.u_overlay[data-undo-panel]'
const CANDIDATE_SELECTOR = 'div[data-undo-panel]'
const HEADER_SELECTOR = 'header[data-window-drag]'
const RAISED_CLASS = 'dsh-mobile-snapshot-header-raised'
const LEASES_KEY = Symbol.for('dsh-client-ui-responsive.snapshot-panels.header-leases')

type HeaderLease = { users: number; added: boolean }
type HeaderLeases = WeakMap<HTMLElement, HeaderLease>

/** Share class ownership across overlapping instances, including module reloads. */
function headerLeases(document: Document): HeaderLeases {
  const existing = Reflect.get(document, LEASES_KEY) as HeaderLeases | undefined
  if (existing !== undefined) return existing
  const leases: HeaderLeases = new WeakMap()
  Reflect.set(document, LEASES_KEY, leases)
  return leases
}

/** Match direct vendor-owned children without requiring :has() or CSS-module guesses. */
function hasChild(parent: Element, selector: string): boolean {
  return Array.from(parent.children).some(child => child.matches(selector))
}

/** Distinguish SnapshotPanel from MessagePanel, settings, and text/code lookalikes. */
function snapshotHeader(overlay: HTMLElement): HTMLElement | null {
  const panel = Array.from(overlay.children).find(child => child.matches('div.u_panel'))
  if (panel === undefined || !['u_head', 'u_toolbar', 'u_tbody', 'u_foot']
    .every(row => hasChild(panel, 'div.' + row))) return null

  // These are separate upstream overlay/right-panel seats, not conversation chrome.
  if (overlay.closest('[data-shell-overlay], [data-sidebar-right-panel]') !== null) return null
  const header = overlay.closest<HTMLElement>(HEADER_SELECTOR)
  if (header === null || !header.parentElement?.matches('div[data-phase]')
    || !hasChild(header, 'div[data-conversation-header-leading]')) return null
  return header
}

/** Own only the temporary header class; the companion stylesheet owns its paint level. */
export class SnapshotPanelsObserver {
  private observer: MutationObserver | null = null
  private readonly headers = new Set<HTMLElement>()
  private readonly leases: HeaderLeases

  /** @param document - The document containing the conversation headers. */
  constructor(private readonly document: Document = globalThis.document) {
    this.leases = headerLeases(document)
  }

  /** Observe existing and newly mounted snapshot managers; repeated attachment is harmless. */
  attach(): void {
    if (this.observer !== null || this.document.defaultView === null) return
    this.observer = new this.document.defaultView.MutationObserver(records => {
      if (this.observer !== null && records.some(record => this.relevant(record))) this.sync()
    })
    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-undo-panel', 'data-phase', 'data-window-drag',
        'data-conversation-header-leading', 'data-shell-overlay', 'data-sidebar-right-panel'],
    })
    this.sync()
  }

  /** Stop observation and release only classes this observer leased, including detached headers. */
  detach(): void {
    this.observer?.disconnect()
    this.observer = null
    for (const header of this.headers) this.release(header)
    this.headers.clear()
  }

  private sync(): void {
    const next = new Set<HTMLElement>()
    for (const overlay of this.document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)) {
      const header = snapshotHeader(overlay)
      if (header !== null) next.add(header)
    }
    for (const header of this.headers) {
      if (!next.has(header)) this.release(header)
    }
    for (const header of next) {
      if (!this.headers.has(header)) {
        const lease = this.leases.get(header)
        if (lease !== undefined) lease.users += 1
        else this.leases.set(header, { users: 1, added: !header.classList.contains(RAISED_CLASS) })
      }
      if (!header.classList.contains(RAISED_CLASS)) {
        const lease = this.leases.get(header)
        if (lease !== undefined) lease.added = true
        header.classList.add(RAISED_CLASS)
      }
    }
    this.headers.clear()
    for (const header of next) this.headers.add(header)
  }

  private release(header: HTMLElement): void {
    const lease = this.leases.get(header)
    if (lease === undefined || --lease.users > 0) return
    if (lease.added) header.classList.remove(RAISED_CLASS)
    this.leases.delete(header)
  }

  private relevant(record: MutationRecord): boolean {
    const target = record.target
    if (target.nodeType === 1) {
      const element = target as Element
      // Includes ownership-hook removal and reclassification of an already tracked header.
      for (const header of this.headers) {
        if (header.contains(element) || element.contains(header)) return true
      }
      if (element.closest(CANDIDATE_SELECTOR) !== null) return true
      const header = element.closest(HEADER_SELECTOR)
      if (header !== null && header.querySelector(CANDIDATE_SELECTOR) !== null) return true
      if (record.type === 'attributes' && element.querySelector(CANDIDATE_SELECTOR) !== null) return true
    }
    return [...record.addedNodes, ...record.removedNodes].some(node => {
      if (node.nodeType !== 1) return false
      const element = node as Element
      return element.matches(CANDIDATE_SELECTOR) || element.querySelector(CANDIDATE_SELECTOR) !== null
    })
  }
}
