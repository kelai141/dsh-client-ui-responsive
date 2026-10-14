// @vitest-environment jsdom
// 0.14.6 客户端半：设置页「检查更新」行。
//
// 用户指令：「更新不应该是只更新快照，应该是下载 apk 然后更新」。
// 壳侧能力一直齐备，但状态机长在引导页渲染器里、健康态 showWeb() 把引导页藏起来
// => 健康状态没有任何更新入口。本行补上入口，且与引导页按钮读同一份真源状态。
//
// 本套用例守四件事：
//  1) 八态渲染与按钮语义（含 available 二次确认、need-permission 文案）；
//  2) **失败原因原样展示**（不翻译/不截断/不覆盖）——壳侧 reason 已是成句中文；
//  3) **读不到 ≠ idle**：桥缺席时不得显示成「已是最新/未检查」这类合法空态；
//  4) **只在进行中态轮询**：终态立即停止（不做常驻定时器）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApkUpdateRow } from '../src/client/dev-section/apk-update.tsx'

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

/** 假桥：记录每次 action，并按「当前应为的状态」回 JSON。 */
function makeBridge(states: string[], opts: { absent?: boolean } = {}) {
  const calls: string[] = []
  let index = 0
  const bridge = {
    apkUpdate: vi.fn((action: string) => {
      calls.push(action)
      if (action === 'status') {
        const state = states[Math.min(index, states.length - 1)] ?? 'idle'
        return JSON.stringify({ ok: true, state })
      }
      index += 1
      const state = states[Math.min(index, states.length - 1)] ?? 'idle'
      return JSON.stringify({ ok: true, state, code: 'accepted' })
    }),
  }
  return { calls, bridge, opts }
}

async function render(): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root!.render(<ApkUpdateRow />) })
  return host
}

/** 主行（含按钮）的文本。 */
function rowText(el: HTMLElement): string {
  return el.querySelector('.dsh-dev-row')?.textContent ?? ''
}
function button(el: HTMLElement): HTMLButtonElement {
  return el.querySelector('.dsh-dev-row button') as HTMLButtonElement
}

beforeEach(() => {
  Object.defineProperty(window, 'androidBridge', { value: undefined, configurable: true, writable: true })
})
afterEach(async () => {
  if (root !== undefined) await act(async () => { root!.unmount() })
  root = undefined
  host?.remove()
  host = undefined
  vi.useRealTimers()
})

/** 装一个按 state 直接回值的桥（最简：所有 status 都回同一态）。 */
function bridgeWith(state: string, extra: Record<string, unknown> = {}) {
  const calls: string[] = []
  Object.defineProperty(window, 'androidBridge', {
    value: { apkUpdate: (action: string) => { calls.push(action); return JSON.stringify({ ok: true, state, ...extra }) } },
    configurable: true, writable: true,
  })
  return calls
}

describe('设置页「检查更新」行', () => {
  it('idle：主行说「未检查」，按钮是「检查更新」', async () => {
    bridgeWith('idle')
    const el = await render()
    expect(rowText(el)).toContain('未检查')
    expect(button(el).textContent).toBe('检查更新')
    expect(button(el).disabled).toBe(false)
  })

  it('checking：按钮禁用且说「检查中…」（进行中态）', async () => {
    bridgeWith('checking')
    const el = await render()
    expect(button(el).textContent).toBe('检查中…')
    expect(button(el).disabled).toBe(true)
  })

  it('up-to-date：显示壳侧给的版本，按钮变「重新检查」', async () => {
    bridgeWith('up-to-date', { version: 'v0.14.6' })
    const el = await render()
    expect(rowText(el)).toContain('APK 已是最新 v0.14.6')
    expect(button(el).textContent).toBe('重新检查')
  })

  it('available：按钮是二次确认的「下载并安装」，并如实给出资产名与体积', async () => {
    bridgeWith('available', { tag: 'v0.14.7', name: 'dsh-mobile-apk-v0.14.7-x86_64.apk', current: '0.14.6', sizeBytes: 169 * 1024 * 1024 })
    const el = await render()
    expect(button(el).textContent).toBe('下载并安装 v0.14.7')
    // 用户要知道「将装哪个包」与「多大」——资产名是本机 ABI 的那个。
    expect(rowText(el)).toContain('dsh-mobile-apk-v0.14.7-x86_64.apk')
    expect(rowText(el)).toContain('169.0 MB')
    expect(rowText(el)).toContain('当前 v0.14.6')
  })

  it('downloading：按钮禁用并显示真实百分比', async () => {
    bridgeWith('downloading', { percent: 42, name: 'x.apk', sizeBytes: 1024 })
    const el = await render()
    expect(button(el).textContent).toBe('下载中 42%')
    expect(button(el).disabled).toBe(true)
  })

  it('installing：说清「装完需重开应用」；复用缓存时如实说明', async () => {
    bridgeWith('installing', { reused: true })
    const el = await render()
    expect(rowText(el)).toContain('重新打开应用')
    expect(rowText(el)).toContain('复用了上次已下载')
  })

  it('need-permission：按钮是「授权后继续安装」而不是让它再点下载', async () => {
    bridgeWith('need-permission')
    const el = await render()
    expect(button(el).textContent).toBe('授权后继续安装')
  })

  it('failed：原因**原样**展示，不翻译不截断（壳侧 reason 已是成句中文）', async () => {
    const reason = '检查失败：更新接口限流（HTTP 403）——接口未认证时每小时只有 60 次查询，请稍后重试。这与本机架构无关，不代表没有适配版本'
    bridgeWith('failed', { reason })
    const el = await render()
    expect(rowText(el)).toContain(reason)
    expect(button(el).textContent).toBe('重试')
  })

  it('failed 但没有 reason：如实说未给原因，不编造', async () => {
    bridgeWith('failed')
    const el = await render()
    expect(rowText(el)).toContain('壳侧未给出原因')
  })

  it('**读不到 ≠ idle**：桥缺席时不得显示成合法空态或「已是最新」', async () => {
    // 不装桥（桌面宿主 / 旧壳）。
    const el = await render()
    expect(rowText(el)).toContain('读不到')
    expect(rowText(el)).not.toContain('已是最新')
    expect(el.querySelector('.dsh-dev-row')?.getAttribute('data-apk-state')).toBe('unavailable')
  })

  it('桥返回不可解析内容时同样按「读不到」处理（不抛、不冒充）', async () => {
    Object.defineProperty(window, 'androidBridge', {
      value: { apkUpdate: () => 'not-json' }, configurable: true, writable: true,
    })
    const el = await render()
    expect(rowText(el)).toContain('读不到')
  })

  it('available 态点按钮发的是 install（二次确认语义），不是再发 check', async () => {
    const calls = bridgeWith('available', { tag: 'v0.14.7', canStart: true })
    const el = await render()
    calls.length = 0
    await act(async () => { button(el).click() })
    expect(calls).toContain('install')
    expect(calls).not.toContain('check')
  })

  it('非 available 态点按钮发的是 check', async () => {
    const calls = bridgeWith('idle')
    const el = await render()
    calls.length = 0
    await act(async () => { button(el).click() })
    expect(calls).toContain('check')
    expect(calls).not.toContain('install')
  })

  it('壳侧回 busy 时如实说明「上一次仍在进行」，不假装受理', async () => {
    const calls: string[] = []
    Object.defineProperty(window, 'androidBridge', {
      value: {
        apkUpdate: (action: string) => {
          calls.push(action)
          if (action === 'status') return JSON.stringify({ ok: true, state: 'idle' })
          return JSON.stringify({ ok: false, state: 'checking', code: 'busy' })
        },
      },
      configurable: true, writable: true,
    })
    const el = await render()
    await act(async () => { button(el).click() })
    expect(el.textContent).toContain('仍在进行中')
  })

  it('**只在进行中态轮询**：idle/终态不挂定时器，downloading 才轮询', async () => {
    vi.useFakeTimers()
    // 终态：不应有定时器。
    bridgeWith('up-to-date', { version: 'v0.14.6' })
    let el = await render()
    const callsIdle = (window.androidBridge as { apkUpdate: () => string }).apkUpdate
    const idleSpy = vi.fn(callsIdle)
    Object.defineProperty(window, 'androidBridge', {
      value: { apkUpdate: idleSpy }, configurable: true, writable: true,
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(idleSpy.mock.calls.length).toBe(0)
    await act(async () => { root!.unmount() }); root = undefined; host?.remove(); host = undefined

    // 进行中：应每 2 秒读一次 status。
    bridgeWith('downloading', { percent: 10 })
    el = await render()
    const busySpy = vi.fn(() => JSON.stringify({ ok: true, state: 'downloading', percent: 10 }))
    Object.defineProperty(window, 'androidBridge', {
      value: { apkUpdate: busySpy }, configurable: true, writable: true,
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(4200) })
    // 2 秒一次 => 至少 2 次。
    expect(busySpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('说明段说清「只手动、不自动」与更新的是 APK', async () => {
    bridgeWith('idle')
    const el = await render()
    const hint = el.querySelector('.dsh-dev-hint')?.textContent ?? ''
    expect(hint).toContain('只在你点击时')
    expect(hint).toContain('APK')
  })
})
