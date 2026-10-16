/** Conversation docking reuses the product's resource, Session and dock lifetimes. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime, PropsRenderSlots, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const ID = '@dsh-android/conversation-dock'
const PREFIX = 'dsh-resource://conversation/session/'

interface ChatResource { readonly reference: SessionReference }

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { conversationDock: unknown }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { conversation: ChatResource }
  interface SlotMap {
    'android.dock.conversation': { kind: 'single'; scope: 'session' }
  }
}

export function conversationAddress(id: string): string { return PREFIX + encodeURIComponent(id) }
export function conversationId(address: string): SessionId | undefined {
  if (!address.startsWith(PREFIX)) return undefined
  try {
    const id = decodeURIComponent(address.slice(PREFIX.length))
    return id ? id as SessionId : undefined
  } catch { return undefined }
}
function ChatViews(props: ConversationViewsProps) {
  return props.renderSlot('conversation.session', { view: 'chat' })
}
function ChatContent({ useSession, useConversation, renderFactorySlot }: PropsRuntime<'android.dock.conversation'> & PropsRenderFactories) {
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const active = conversation.activeTargets.size > 0 || !session.blank || session.running
  const settling = (session.openState === 'loading' && !active)
    || (session.subagent?.address.mode === 'continuable' && session.subagent.parentAvailable === undefined)
  const hero = !active && session.openState === 'open'
  return renderFactorySlot('conversation.content', {
    variant: 'embedded', phase: settling ? 'settling' : hero ? 'hero' : 'active', hero,
  }, { slots: { views: ChatViews } })
}
function ChatTab({ useResource, useTabInfo, SessionProvider, renderSlot }: PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'android.dock.conversation'>) {
  const { tab } = useTabInfo()
  const resource = useResource<'conversation'>(tab.contentId)
  return <div data-sidebar-chat="" style={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
    {resource.value === undefined ? <div role="status">{resource.status === 'failed' ? '对话加载失败，请关闭标签后重试' : '正在加载对话…'}</div>
      : <SessionProvider session={resource.value.reference}>{renderSlot('android.dock.conversation', {})}</SessionProvider>}
  </div>
}

export function registerConversationDock(ctx: Context): void {
  const provider: ResourceProvider<'conversation'> = {
    protocol: 'conversation',
    async *open(address, { signal }) {
      const id = conversationId(address)
      if (id === undefined) throw new Error('Invalid conversation address')
      if (signal.aborted) return
      const reference = ctx.sessions.retain(id, { source: 'conversationDock', signal })
      try {
        yield { ok: true, value: { reference } }
        if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      } finally { reference.release() }
    },
  }
  ctx.effect(() => ctx.resources.register(provider), 'ui-responsive: conversation resource')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID, kind: 'conversation', patterns: [PREFIX + '**'], priority: 'extension',
    canOpen: address => conversationId(address) !== undefined,
    title: address => {
      const id = conversationId(address)
      return (id === undefined ? undefined : ctx.sessions.list.getSnapshot().byId[id]?.title) ?? '对话'
    },
  }), 'ui-responsive: conversation tab')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: ID,
    children: { 'android.dock.conversation': { kind: 'single', scope: 'session' } },
  }, ChatTab)), 'ui-responsive: conversation body')
  ctx.effect(() => ctx.slots.inject('android.dock.conversation', () => ctx.slots.register({
    name: 'android.dock.conversation',
  }, ChatContent)), 'ui-responsive: embedded conversation')
}

/** The existing subagent row's own action holds its exact direct-parent route. */
export function subagentAside(row: HTMLElement): HTMLButtonElement | null {
  if (!row.matches('[role="treeitem"]')) return null
  return row.querySelector<HTMLButtonElement>('button[class*="sidebarButton"]')
}

export class ConversationDropZone {
  private zone: HTMLDivElement | undefined
  private readonly leaving = new Map<HTMLDivElement, number>()
  constructor(private readonly open: (id: string) => void, private readonly current: () => string | undefined = () => undefined) {}
  accepts = (row: HTMLElement): boolean => row.matches('[data-row-key^="session:"]') || subagentAside(row) !== null || (row.matches('[role=treeitem][aria-current=true]') && this.current() !== undefined)
  preview = (active: boolean, over: boolean): void => {
    if (!active) {
      const old = this.zone
      this.zone = undefined
      if (old) {
        old.setAttribute('data-leaving', '')
        const timer = window.setTimeout(() => { old.remove(); this.leaving.delete(old) }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 160)
        this.leaving.set(old, timer)
      }
      return
    }
    if (!this.zone) {
      this.clearLeaving()
      this.zone = document.createElement('div')
      this.zone.className = 'dsh-conversation-drop-zone'
      this.zone.setAttribute('role', 'status')
      this.zone.textContent = '拖入侧开'
      document.body.append(this.zone)
    }
    this.zone.toggleAttribute('data-over', over)
    const label = over ? '松开侧开' : '拖入侧开'
    if (this.zone.textContent !== label) this.zone.textContent = label
  }
  detach(): void {
    this.zone?.remove()
    this.zone = undefined
    this.clearLeaving()
  }
  private clearLeaving(): void {
    for (const [node, timer] of this.leaving) { window.clearTimeout(timer); node.remove() }
    this.leaving.clear()
  }
  drop = (row: HTMLElement): void => {
    if (!row.isConnected) return
    this.capture(row)()
  }
  capture = (row: HTMLElement): (() => void) => {
    const key = row.getAttribute('data-row-key')
    const id = key?.startsWith('session:') ? key.slice('session:'.length) : undefined
    if (id) return () => this.open(id)
    else {
      const button = subagentAside(row)
      if (button) return () => button.click()
      else if (row.matches('[aria-current=true]')) {
        const current = this.current()
        return () => {
          if (current) this.open(current)
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        }
      }
    }
    return () => {}
  }
}
export const CONVERSATION_DOCK_CSS = `
.dsh-conversation-drop-zone {
  position: fixed; z-index: 2147483000; inset: max(12px, env(safe-area-inset-top)) 0 max(12px, env(safe-area-inset-bottom)) auto;
  width: 48px; box-sizing: border-box; border: 1px solid rgba(135,185,255,.5);
  border-radius: 8px 0 0 8px; background: rgba(103,160,255,.14);
  -webkit-backdrop-filter: blur(18px) saturate(135%); backdrop-filter: blur(18px) saturate(135%);
  box-shadow: -8px 0 28px rgba(94,158,255,.18), inset 1px 0 12px rgba(180,215,255,.12);
  color: var(--dsw-alias-text-primary, #b8d5ff); text-shadow: 0 0 10px rgba(117,167,255,.3); writing-mode: vertical-rl;
  display: flex; align-items: center; justify-content: center; font-size: 12px;
  pointer-events: none; animation: dsh-dock-arrive 180ms ease-out both;
  transition: width 160ms ease, background 160ms ease, box-shadow 160ms ease, opacity 160ms ease, transform 160ms ease;
}
.dsh-conversation-drop-zone[data-over] { width: 56px; background: rgba(103,160,255,.26);
  box-shadow: -10px 0 38px rgba(94,158,255,.35), inset 1px 0 16px rgba(205,228,255,.2); }
.dsh-conversation-drop-zone[data-leaving] { animation: none; opacity: 0; transform: translateX(14px); }
@keyframes dsh-dock-arrive { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
/* Frost lives only in the edge, never on the reading or composing surface. */
[data-sidebar-right-panel][data-sidebar-right-open]::after {
  content: ''; position: absolute; inset: 0 auto 0 0; width: 6px; z-index: 45;
  pointer-events: none; border-left: 1px solid rgba(117,167,255,.26);
  background: rgba(117,167,255,.045);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: -5px 0 20px rgba(94,158,255,.12), inset 1px 0 7px rgba(176,212,255,.1);
}
[data-sidebar-right-open] [data-dockkit-divider]::before {
  background: rgba(117,167,255,.24); box-shadow: 0 0 12px rgba(94,158,255,.16);
}
html[data-dsh-sidebar-reorder] [role=treeitem] { user-select: none; -webkit-user-select: none; }
/* Portrait preserves the dock tree and native tab actions. Only the active
   pane body occupies the full second row; both groups of tabs remain reachable. */
@media (orientation: portrait) {
  [data-sidebar-right-panel] [data-dockkit-split] {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr);
  }
  [data-sidebar-right-panel] [data-dockkit-split] > [data-dockkit-host='dock']:not([hidden]),
  [data-sidebar-right-panel] [data-dockkit-split] > [data-dockkit-host='dock']:not([hidden]) > section { display: contents; }
  [data-sidebar-right-panel] [data-dockkit-split] [class*='tabHostHeader'] { grid-row: 1; min-width: 0; pointer-events: auto; }
  [data-sidebar-right-panel] [data-dockkit-split] [data-dockkit-column='0'] > [class*='tabHostHeader'] { grid-column: 1; }
  [data-sidebar-right-panel] [data-dockkit-split] [data-dockkit-column='1'] > [class*='tabHostHeader'] { grid-column: 2; }
  [data-sidebar-right-panel] [data-dockkit-split] [class*='tabHostBody'] { grid-row: 2; grid-column: 1 / -1; min-height: 0; pointer-events: auto; }
  [data-sidebar-right-panel] [data-dockkit-split] section:not([data-dockkit-pane-active]) > [class*='tabHostBody'],
  [data-sidebar-right-panel] [data-dockkit-split] > [data-dockkit-divider] { display: none; }
}
@media (prefers-reduced-motion: reduce) { .dsh-conversation-drop-zone { transition: none; animation: none; } }
`
