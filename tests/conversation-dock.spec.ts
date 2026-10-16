// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { SidebarReorder, REORDER_ATTR } from '../src/client/mobile/sidebar-reorder.ts'
import { ConversationDropZone, conversationAddress, conversationId } from '../src/client/mobile/conversation-dock.tsx'

function touch(type: string, target: HTMLElement, x: number, y = 100, multiple = false) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const point = { identifier: 1, clientX: x, clientY: y }
  Object.defineProperties(e, { touches: { value: type === 'touchend' ? [] : multiple ? [point, { ...point, identifier: 2 }] : [point] }, changedTouches: { value: [point] } })
  target.dispatchEvent(e)
}
let drag: SidebarReorder
let zone: ConversationDropZone
let open: ReturnType<typeof vi.fn>
function row(child = false) {
  const el = document.createElement('div')
  if (child) { el.setAttribute('role', 'treeitem'); el.innerHTML = '<button class="subagent_sidebarButton_x">侧开</button>' }
  else { el.dataset.rowKey = 'session:session/a'; el.draggable = true }
  document.body.append(el)
  return el
}
beforeEach(() => {
  vi.useFakeTimers()
  open = vi.fn()
  zone = new ConversationDropZone(open)
  drag = new SidebarReorder(zone)
  Object.defineProperty(document, 'elementFromPoint', { value: () => document.body, configurable: true })
  drag.attach()
})
afterEach(() => { drag.detach(); zone.detach(); document.body.innerHTML = ''; vi.useRealTimers() })
describe('conversation docking', () => {
  it('keeps resource identities unambiguous', () => {
    expect(conversationId(conversationAddress('a/b?中文'))).toBe('a/b?中文')
    expect(conversationId('invalid')).toBeUndefined()
    expect(conversationId('dsh-resource://conversation/session/%xx')).toBeUndefined()
  })
  it('opens once after settling reorder and removes the target (also in landscape)', () => {
    const source = row()
    const events: string[] = []
    source.addEventListener('drop', () => { events.push('cancel-order'); source.remove() })
    open.mockImplementation(() => { expect(document.documentElement.hasAttribute(REORDER_ATTR)).toBe(false); events.push('open') })
    touch('touchstart', source, 80); vi.advanceTimersByTime(400)
    expect(document.querySelector('.dsh-conversation-drop-zone')).not.toBeNull()
    touch('touchmove', source, innerWidth - 8)
    touch('touchend', source, innerWidth - 8)
    touch('touchend', source, innerWidth - 8)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('session/a')
    expect(events).toEqual(['cancel-order', 'open'])
    expect(document.querySelector('.dsh-conversation-drop-zone:not([data-leaving])')).toBeNull()
  })
  it('uses the subagent row action without navigating the main conversation', () => {
    const source = row(true)
    const aside = vi.fn()
    source.querySelector('button')!.addEventListener('click', aside)
    const main = vi.fn(); source.addEventListener('click', main)
    source.querySelector('button')!.addEventListener('click', e => e.stopPropagation())
    touch('touchstart', source, 80); vi.advanceTimersByTime(400)
    touch('touchend', source, innerWidth - 8)
    expect(aside).toHaveBeenCalledTimes(1); expect(main).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled()
  })
  it('ignores title marquee scroll but cancels real ancestor scrolling', () => {
    const source = row(); const title = document.createElement('span'); source.append(title)
    touch('touchstart', title, 80); title.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(400)
    expect(document.documentElement.hasAttribute(REORDER_ATTR)).toBe(true)
    touch('touchend', source, innerWidth - 8)
    expect(open).toHaveBeenCalledTimes(1)
    touch('touchstart', source, 80); document.body.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(400)
    expect(document.documentElement.hasAttribute(REORDER_ATTR)).toBe(false)
  })
  it('does not claim workspace rows even though they are draggable treeitems', () => {
    const source = row(true); source.dataset.rowKey = 'workspace:project'; source.draggable = true; source.innerHTML = '项目'
    touch('touchstart', source, 80); vi.advanceTimersByTime(400)
    expect(document.documentElement.hasAttribute(REORDER_ATTR)).toBe(false)
    touch('touchend', source, innerWidth - 8)
    expect(open).not.toHaveBeenCalled()
  })
  it('does not open a source removed while dragging', () => {
    const source = row(); touch('touchstart', source, 80); vi.advanceTimersByTime(400)
    source.remove(); touch('touchend', document.body, innerWidth - 8)
    expect(open).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute(REORDER_ATTR)).toBe(false)
  })
  it.each(['touchcancel', 'multitouch', 'outside', 'detach'])('cancels %s without opening', mode => {
    const source = row()
    touch('touchstart', source, 80); vi.advanceTimersByTime(400)
    if (mode === 'detach') drag.detach()
    else if (mode === 'multitouch') touch('touchmove', source, innerWidth - 8, 100, true)
    else touch(mode === 'outside' ? 'touchend' : 'touchcancel', source, 10)
    expect(open).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute(REORDER_ATTR)).toBe(false)
    expect(document.querySelector('.dsh-conversation-drop-zone:not([data-leaving])')).toBeNull()
  })
})
