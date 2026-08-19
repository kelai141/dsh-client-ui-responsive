// @vitest-environment jsdom
// EnterGuard 单测（Review 2026-08-18 T1 补测）：四道守卫（IME/命令菜单/
// Shift+Enter/桌面视口）+ 移动视口拦截 + execCommand 降级，此前零测试。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EnterGuard } from '../src/client/enter-guard.ts'
import { MOBILE_BREAKPOINT } from '../src/client/columns.ts'

/** 以指定视口宽度运行一个用例（jsdom innerWidth 可写）。 */
function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

/** 构造位于 composer textarea 内的 Enter keydown 并 dispatch（capture 监听在 document）。 */
function fireEnter(target: HTMLElement, opts: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...opts })
  target.dispatchEvent(event)
  return event
}

let host: HTMLElement
let guard: EnterGuard

beforeEach(() => {
  setViewport(MOBILE_BREAKPOINT - 1) // 默认移动视口
  host = document.createElement('div')
  host.innerHTML = '<div data-composer-card><textarea></textarea></div>'
  document.body.appendChild(host)
  // jsdom 无 execCommand 实现：stub 为可观察 spy。
  document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand
  guard = new EnterGuard()
  guard.attach()
})

afterEach(() => {
  guard.detach()
  host.remove()
  vi.restoreAllMocks()
  setViewport(1024)
})

describe('EnterGuard 拦截路径（移动视口）', () => {
  it('composer textarea 内普通 Enter：拦截并插入换行', () => {
    const textarea = host.querySelector('textarea')!
    textarea.focus()
    const event = fireEnter(textarea)
    expect(event.defaultPrevented).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, '\n')
  })

  it('execCommand 抛异常时降级：仍拦截（不发送），不向外抛', () => {
    document.execCommand = vi.fn(() => { throw new Error('unsupported') }) as unknown as typeof document.execCommand
    const textarea = host.querySelector('textarea')!
    textarea.focus()
    expect(() => fireEnter(textarea)).not.toThrow()
  })
})

describe('EnterGuard 四道守卫（不拦截）', () => {
  it('桌面/宽视口：行为完全不变', () => {
    setViewport(MOBILE_BREAKPOINT)
    const textarea = host.querySelector('textarea')!
    const event = fireEnter(textarea)
    expect(event.defaultPrevented).toBe(false)
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('Shift+Enter：上游原生换行，不拦截', () => {
    const textarea = host.querySelector('textarea')!
    const event = fireEnter(textarea, { shiftKey: true })
    expect(event.defaultPrevented).toBe(false)
  })

  it('IME 组合（isComposing / keyCode 229）：不拦截', () => {
    const textarea = host.querySelector('textarea')!
    const composed = fireEnter(textarea, { isComposing: true })
    expect(composed.defaultPrevented).toBe(false)
    const legacy = fireEnter(textarea, { keyCode: 229 })
    expect(legacy.defaultPrevented).toBe(false)
  })

  it('命令菜单打开（[role=listbox] 存在）：Enter 选择候选，不拦截', () => {
    const menu = document.createElement('div')
    menu.setAttribute('role', 'listbox')
    document.body.appendChild(menu)
    const textarea = host.querySelector('textarea')!
    const event = fireEnter(textarea)
    expect(event.defaultPrevented).toBe(false)
    menu.remove()
  })

  it('composer 之外的 Enter 处理（QueueDock 等）不受影响', () => {
    const outside = document.createElement('textarea')
    document.body.appendChild(outside)
    const event = fireEnter(outside)
    expect(event.defaultPrevented).toBe(false)
    outside.remove()
  })
})

describe('EnterGuard 生命周期', () => {
  it('detach 后不再拦截', () => {
    guard.detach()
    const textarea = host.querySelector('textarea')!
    const event = fireEnter(textarea)
    expect(event.defaultPrevented).toBe(false)
  })
})
