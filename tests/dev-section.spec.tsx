// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DevSection } from '../src/client/dev-section/DevSection.tsx'

// React 18 concurrent 渲染：render 与 unmount 需 act 包裹（否则 DOM 未 flush）。
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Bridge = {
  restartEngine?: () => void
  shutdownToGuide?: () => void
  reloadWebUI?: () => void
  openConsole?: () => void
  getDevLogEnabled?: () => boolean
  setDevLogEnabled?: (enabled: boolean) => void
  hasAllFilesAccess?: () => boolean
}

let root: Root | undefined
let host: HTMLElement | undefined

async function render(bridge: Bridge): Promise<HTMLElement> {
  window.androidBridge = bridge
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<DevSection close={() => {}} />)
  })
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
})

describe('DevSection（开发者选项设置页）', () => {
  it('渲染操作按钮（重启/关闭/刷新/控制台）与日志开关', async () => {
    const el = await render({})
    const texts = [...el.querySelectorAll('button')].map(b => b.textContent)
    expect(texts).toContain('重启')
    expect(texts).toContain('关闭')
    expect(texts).toContain('刷新界面')
    expect(texts).toContain('打开控制台')
    expect(el.querySelector('input[type=checkbox]')).not.toBeNull()
  })

  it('重启：点击后先弹二次确认，确认后才调桥并短暂禁用按钮', async () => {
    vi.useFakeTimers()
    const restartEngine = vi.fn()
    const el = await render({ restartEngine })
    const btn = [...el.querySelectorAll('button')].find(b => b.textContent === '重启')!
    await act(async () => { btn.click() })
    expect(restartEngine).not.toHaveBeenCalled()
    const confirmBtn = [...el.querySelectorAll('.dsh-dev-modal button')].find(b => b.textContent === '重启')!
    await act(async () => { confirmBtn.click() })
    expect(restartEngine).toHaveBeenCalledOnce()
    expect(btn.hasAttribute('disabled')).toBe(true)
    await act(async () => { vi.advanceTimersByTime(2100) })
    expect(btn.hasAttribute('disabled')).toBe(false)
    vi.useRealTimers()
  })

  it('关闭：点击后弹二次确认，取消不调桥，确认调 shutdownToGuide', async () => {
    const shutdownToGuide = vi.fn()
    const el = await render({ shutdownToGuide })
    const btn = [...el.querySelectorAll('button')].find(b => b.textContent === '关闭')!
    await act(async () => { btn.click() })
    const cancel = [...el.querySelectorAll('.dsh-dev-modal button')].find(b => b.textContent === '取消')!
    await act(async () => { cancel.click() })
    expect(shutdownToGuide).not.toHaveBeenCalled()
    await act(async () => { btn.click() })
    const confirmBtn = [...el.querySelectorAll('.dsh-dev-modal button')].find(b => b.textContent === '关闭')!
    await act(async () => { confirmBtn.click() })
    expect(shutdownToGuide).toHaveBeenCalledOnce()
  })

  it('点击刷新界面 / 打开控制台调用对应桥方法', async () => {
    const reloadWebUI = vi.fn()
    const openConsole = vi.fn()
    const el = await render({ reloadWebUI, openConsole })
    const texts = [...el.querySelectorAll('button')]
    texts.find(b => b.textContent === '刷新界面')!.click()
    texts.find(b => b.textContent === '打开控制台')!.click()
    expect(reloadWebUI).toHaveBeenCalledOnce()
    expect(openConsole).toHaveBeenCalledOnce()
  })

  it('日志开关初始值来自桥（默认关）', async () => {
    const el = await render({ getDevLogEnabled: () => false })
    expect((el.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false)
  })

  it('切换日志开关写桥并更新状态', async () => {
    const setDevLogEnabled = vi.fn()
    const el = await render({ getDevLogEnabled: () => false, setDevLogEnabled })
    const input = el.querySelector('input[type=checkbox]') as HTMLInputElement
    input.click()
    expect(setDevLogEnabled).toHaveBeenCalledWith(true)
    expect(input.checked).toBe(true)
  })

  it('未授予所有文件访问时提示私有目录', async () => {
    const el = await render({ hasAllFilesAccess: () => false })
    const hints = [...el.querySelectorAll('p')].map(p => p.textContent)
    expect(hints.some(h => h?.includes('应用私有目录'))).toBe(true)
  })

  it('已授权时提示公共目录路径', async () => {
    const el = await render({ hasAllFilesAccess: () => true })
    const hints = [...el.querySelectorAll('p')].map(p => p.textContent)
    expect(hints.some(h => h?.includes('Documents/dshdata/log'))).toBe(true)
  })

  it('桥缺失时安全降级（不抛异常，默认关）', async () => {
    const el = await render({})
    expect((el.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false)
    const btn = [...el.querySelectorAll('button')].find(b => b.textContent === '重启')!
    await act(async () => { btn.click() })
    const confirmBtn = [...el.querySelectorAll('.dsh-dev-modal button')].find(b => b.textContent === '重启')!
    await act(async () => { confirmBtn.click() })
    expect(() => { confirmBtn.click() }).not.toThrow()
  })
})
