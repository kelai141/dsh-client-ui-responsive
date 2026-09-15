// @vitest-environment jsdom
// 「手机控制」设置分区（0.14.0）：屏幕范围 / 虚拟屏档位 / 浮窗开关 / 强制销毁三连点。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PhoneControlSection } from '../src/client/dev-section/phone-control.tsx'

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Scope = 'virtual-only' | 'real-only' | 'all'

let root: Root | undefined
let host: HTMLElement | undefined

async function render(bridge: Record<string, unknown>): Promise<HTMLElement> {
  window.androidBridge = bridge as never
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root!.render(<PhoneControlSection {...({ close: () => {} } as never)} />) })
  return host
}

beforeEach(() => {
  delete window.androidBridge
})

afterEach(async () => {
  if (root !== undefined) {
    await act(async () => { root!.unmount() })
    root = undefined
  }
  host?.remove()
  host = undefined
  delete window.androidBridge
  vi.restoreAllMocks()
})

describe('PhoneControlSection（手机控制设置页）', () => {
  it('开放屏幕范围：壳值优先，切换后写壳桥并回读', async () => {
    const state: { scope: Scope } = { scope: 'virtual-only' }
    const setScreenScope = vi.fn((scope: Scope) => { state.scope = scope })
    const getScreenScope = vi.fn(() => state.scope)
    const el = await render({ getScreenScope, setScreenScope })
    const select = el.querySelector('select[aria-label="开放屏幕范围"]') as HTMLSelectElement
    expect(select, '开放屏幕范围选择器必须在场').toBeTruthy()
    expect(select.value).toBe('virtual-only')
    await act(async () => {
      select.value = 'all'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(setScreenScope).toHaveBeenCalledWith('all')
    expect(getScreenScope).toHaveBeenCalled()
  })

  it('开放屏幕范围：壳桥缺失时回落安全默认 virtual-only', async () => {
    const el = await render({})
    const select = el.querySelector('select[aria-label="开放屏幕范围"]') as HTMLSelectElement
    expect(select.value).toBe('virtual-only')
  })

  it('虚拟屏档位：读壳值并写壳桥（0.5 / 0.75 / 1）', async () => {
    let scale = 0.5
    const getVdisplayScale = vi.fn(() => scale)
    const setVdisplayScale = vi.fn((value: number) => { scale = value })
    const el = await render({ getVdisplayScale, setVdisplayScale })
    const select = el.querySelector('select[aria-label="虚拟屏分辨率档位"]') as HTMLSelectElement
    expect(select.value).toBe('0.5')
    await act(async () => {
      select.value = '1'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(setVdisplayScale).toHaveBeenCalledWith(1)
    expect((el.querySelector('select[aria-label="虚拟屏分辨率档位"]') as HTMLSelectElement).value).toBe('1')
  })

  it('退后台自动浮窗：默认开，关闭写壳桥并回读', async () => {
    let enabled = true
    const getVdisplayFloatEnabled = vi.fn(() => enabled)
    const setVdisplayFloatEnabled = vi.fn((next: boolean) => { enabled = next })
    const el = await render({ getVdisplayFloatEnabled, setVdisplayFloatEnabled })
    const toggle = el.querySelector('input[aria-label="退后台自动浮窗"]') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    await act(async () => { toggle.click() })
    expect(setVdisplayFloatEnabled).toHaveBeenCalledWith(false)
    expect((el.querySelector('input[aria-label="退后台自动浮窗"]') as HTMLInputElement).checked).toBe(false)
  })

  it('强制销毁：前两次点击只确认，第三次才调用壳桥', async () => {
    const forceDestroyVdisplay = vi.fn(() => JSON.stringify({ ok: true, code: 'vdisplay-destroyed' }))
    const el = await render({ forceDestroyVdisplay })
    const button = [...el.querySelectorAll('button')].find((item) => item.textContent?.includes('强制销毁虚拟屏'))
    expect(button, '强制销毁按钮必须在场').toBeTruthy()
    await act(async () => { button!.click() })
    expect(forceDestroyVdisplay).not.toHaveBeenCalled()
    expect(button!.textContent).toContain('1/3')
    await act(async () => { button!.click() })
    expect(forceDestroyVdisplay).not.toHaveBeenCalled()
    expect(button!.textContent).toContain('2/3')
    await act(async () => { button!.click() })
    expect(forceDestroyVdisplay).toHaveBeenCalledTimes(1)
    expect(el.textContent).toContain('已强制销毁全部虚拟屏')
  })
})
