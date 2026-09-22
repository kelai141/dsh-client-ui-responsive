// @vitest-environment jsdom
// 「手机控制」设置分区：屏幕范围 / 虚拟屏档位 / 浮窗开关 / 强制销毁三连点（0.14.0）；
// Shizuku 引导重做（0.14.1 用户定例）：状态源 + 两入口 + 教程外链 + 无障碍受限设置解锁。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  PhoneControlSection,
  settleLinkCall,
  settleUnlockCall,
  shizukuStateLabel,
  shizukuStepHint,
} from '../src/client/dev-section/phone-control.tsx'
import { describeCallReason } from '../src/client/user-copy.ts'
import { DEV_SECTION_CSS } from '../src/client/dev-section/dev-section.css.ts'

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

async function unmount(): Promise<void> {
  if (root !== undefined) {
    await act(async () => { root!.unmount() })
    root = undefined
  }
  host?.remove()
  host = undefined
}

/** 壳侧 shizukuStatus() 的样本（字段名与 ShizukuTransport.status 一致）。 */
function shizukuJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ok: true,
    installed: true,
    running: true,
    granted: true,
    bound: true,
    binding: false,
    code: 'shizuku-ready',
    guidance: 'Shizuku shell UserService 已就绪（uid=2000）。',
    ...over,
  })
}

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
  const found = [...el.querySelectorAll('button')].find((item) => item.textContent === text)
  expect(found, '按钮「' + text + '」必须在场').toBeTruthy()
  return found as HTMLButtonElement
}

function detailLine(el: HTMLElement, marker: string): string {
  const found = [...el.querySelectorAll('.dsh-screen-control-detail')]
    .map((node) => node.textContent ?? '')
    .find((text) => text.includes(marker))
  expect(found, '明细行「' + marker + '」必须在场').toBeTruthy()
  return found as string
}

beforeEach(() => {
  delete window.androidBridge
})

afterEach(async () => {
  await unmount()
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

  it('虚拟屏浮窗：默认开，关闭写壳桥并回读', async () => {
    let enabled = true
    const getVdisplayFloatEnabled = vi.fn(() => enabled)
    const setVdisplayFloatEnabled = vi.fn((next: boolean) => { enabled = next })
    const el = await render({ getVdisplayFloatEnabled, setVdisplayFloatEnabled })
    const toggle = el.querySelector('input[aria-label="虚拟屏浮窗（退后台自动显示）"]') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    await act(async () => { toggle.click() })
    expect(setVdisplayFloatEnabled).toHaveBeenCalledWith(false)
    expect((el.querySelector('input[aria-label="虚拟屏浮窗（退后台自动显示）"]') as HTMLInputElement).checked).toBe(false)
  })

  // P5-6：与开发者选项里的「悬浮球」去混淆——两处都叫「浮」，必须各说各是什么，
  // 且其中一处要点名另一处，否则用户在两个设置页之间对不上号。
  it('P5-6：浮窗命名必须点名「悬浮球」以示区分', async () => {
    const el = await render({})
    const text = el.textContent ?? ''
    expect(text).toContain('虚拟屏浮窗')
    expect(text, '必须点名开发者选项里的「悬浮球」是另一个东西').toContain('悬浮球')
    expect(text, '必须说清它显示的是什么').toContain('虚拟屏画面')
  })

  it('强制销毁：前两次点击只确认，第三次才调用壳桥', async () => {
    const forceDestroyVdisplay = vi.fn(() => JSON.stringify({ ok: true, code: 'vdisplay-destroyed' }))
    const el = await render({ forceDestroyVdisplay })
    const button = buttonByText(el, '强制销毁虚拟屏')
    await act(async () => { button.click() })
    expect(forceDestroyVdisplay).not.toHaveBeenCalled()
    expect(button.textContent).toContain('1/3')
    await act(async () => { button.click() })
    expect(forceDestroyVdisplay).not.toHaveBeenCalled()
    expect(button.textContent).toContain('2/3')
    await act(async () => { button.click() })
    expect(forceDestroyVdisplay).toHaveBeenCalledTimes(1)
    expect(el.textContent).toContain('已强制销毁全部虚拟屏')
  })

  // P5-5：破坏性按钮必须与同页普通按钮**看得出区别**，且进入确认态后必须能退出。
  // 反证：把 className 的 danger 分支删掉、或删掉「取消」按钮，本组用例即判红。
  it('P5-5：确认态必须带危险样式，未进入确认态不得带', async () => {
    const el = await render({ forceDestroyVdisplay: () => JSON.stringify({ ok: true }) })
    const button = buttonByText(el, '强制销毁虚拟屏')
    expect(button.className, '未确认时是普通按钮').not.toContain('dsh-dev-danger')
    expect(button.getAttribute('data-armed')).toBe('false')
    await act(async () => { button.click() })
    expect(button.className, '进入确认态必须换成危险样式').toContain('dsh-dev-danger')
    expect(button.getAttribute('data-armed')).toBe('true')
    expect(button.getAttribute('data-stage')).toBe('1')
  })

  it('P5-5：确认态必须给取消途径，取消后不得调用壳桥', async () => {
    const forceDestroyVdisplay = vi.fn(() => JSON.stringify({ ok: true }))
    const el = await render({ forceDestroyVdisplay })
    const button = buttonByText(el, '强制销毁虚拟屏')
    await act(async () => { button.click() })
    const cancel = buttonByText(el, '取消')
    await act(async () => { cancel.click() })
    expect(forceDestroyVdisplay, '取消后一次都不该调用').not.toHaveBeenCalled()
    expect(button.className, '取消后回到普通样式').not.toContain('dsh-dev-danger')
    expect(button.textContent).toBe('强制销毁虚拟屏')
    // 取消是真的撤臂：再点一下只回到 1/3，而不是直接执行。
    await act(async () => { button.click() })
    expect(forceDestroyVdisplay).not.toHaveBeenCalled()
    expect(button.textContent).toContain('1/3')
  })

  // ── Shizuku 区块：状态源（0.14.1 缺陷本体）────────────────────

  it('Shizuku 状态读的是 shizukuStatus()，不是 vdisplayStatus()', async () => {
    const shizukuStatus = vi.fn(() => shizukuJson())
    const vdisplayStatus = vi.fn(() => JSON.stringify({
      ok: true, state: 'active', code: 'vdisplay-active', guidance: '虚拟屏幕 1 已激活（Android displayId=1）。', displayId: 1,
    }))
    const el = await render({ shizukuStatus, vdisplayStatus })
    expect(shizukuStatus).toHaveBeenCalled()
    expect(el.textContent).toContain('通道就绪')
    // 虚拟屏状态归页头那枚胶囊（data-state 是状态源），Shizuku 行不得出现虚拟屏的状态码。
    const chip = el.querySelector('.dsh-screen-control-state') as HTMLElement
    expect(chip.dataset.state).toBe('active')
    expect(chip.textContent).toBe('已激活')
    expect(detailLine(el, 'Shizuku 特权通道'), 'Shizuku 行不得出现虚拟屏的状态码').not.toContain('vdisplay-active')
    // displayId 是诊断信息：进 data 属性，不再由页面自己拼一行「Android displayId = N」上屏
    // （0.14.1 UI 审查：内部标识不上用户面）。壳侧 guidance 里自带的 displayId 属另一处文案，
    // 未在本次改动范围内。
    expect((el.querySelector('.dsh-screen-control-card') as HTMLElement).dataset.displayId).toBe('1')
    expect(el.textContent).not.toContain('Android displayId =')
  })

  it('虚拟屏 guidance 与 Shizuku guidance 相同时只显示一次（设备实测到过逐字重复）', async () => {
    const same = '未检测到 Shizuku；虚拟屏需要用户安装、启动并授权 Shizuku。'
    const el = await render({
      shizukuStatus: () => shizukuJson({ installed: false, running: false, granted: false, bound: false, guidance: same }),
      vdisplayStatus: () => JSON.stringify({ ok: false, state: 'blocked', code: 'shizuku-absent', guidance: same }),
    })
    const hits = el.textContent!.split(same).length - 1
    expect(hits, '同一句话不得在页面上出现两次').toBe(1)
  })

  it('反证：只提供 vdisplayStatus 时 Shizuku 区报「状态不可读」，不冒充未安装/就绪', async () => {
    const vdisplayStatus = vi.fn(() => JSON.stringify({
      ok: true, state: 'ready', code: 'vdisplay-ready', guidance: 'Shizuku 已授权且 shell UserService 已就绪；可创建虚拟屏幕 1。',
    }))
    const el = await render({ vdisplayStatus })
    expect(detailLine(el, 'Shizuku 特权通道')).toContain('状态不可读')
    expect(el.textContent).not.toContain('通道就绪')
    expect(buttonByText(el, '打开 Shizuku').disabled).toBe(true)
  })

  // ── Shizuku 区块：两个入口（用户定例：左下载右跳转，未装不可跳）──

  it('未安装时「打开 Shizuku」不可点；已安装时可点并拉起 Shizuku', async () => {
    const absent = await render({
      shizukuStatus: () => shizukuJson({ installed: false, running: false, granted: false, bound: false, code: 'shizuku-absent' }),
    })
    expect(absent.textContent).toContain('未安装')
    expect(buttonByText(absent, '打开 Shizuku').disabled).toBe(true)
    await unmount()

    const openShizukuManager = vi.fn(() => JSON.stringify({ ok: true }))
    const installed = await render({
      shizukuStatus: () => shizukuJson({ running: false, granted: false, bound: false, code: 'shizuku-not-running' }),
      openShizukuManager,
    })
    const jump = buttonByText(installed, '打开 Shizuku')
    expect(jump.disabled).toBe(false)
    await act(async () => { jump.click() })
    expect(openShizukuManager).toHaveBeenCalledTimes(1)
    expect(installed.textContent).toContain('已打开 Shizuku')
  })

  it('「下载 Shizuku」走外链通道 key=shizuku-download（两入口共用一条通道）', async () => {
    const openExternalLink = vi.fn(() => JSON.stringify({ ok: true }))
    const el = await render({ shizukuStatus: () => shizukuJson(), openExternalLink })
    await act(async () => { buttonByText(el, '下载 Shizuku').click() })
    expect(openExternalLink).toHaveBeenCalledWith('shizuku-download')
    expect(el.textContent).toContain('已打开 Shizuku 发布页')
  })

  it('「点击查看教程」是外链 key=shizuku-tutorial，且样式为蓝字下划线', async () => {
    const openExternalLink = vi.fn(() => JSON.stringify({ ok: true }))
    const el = await render({ shizukuStatus: () => shizukuJson(), openExternalLink })
    const link = buttonByText(el, '点击查看教程')
    expect(link.className).toContain('dsh-dev-link')
    await act(async () => { link.click() })
    expect(openExternalLink).toHaveBeenCalledWith('shizuku-tutorial')
    expect(el.textContent).toContain('已用浏览器打开视频教程')
    // 样式契约：用户定例「标蓝 + 下划线」，CSS 在 dev-section.css.ts 里——断其在场。
    expect(DEV_SECTION_CSS).toMatch(/\.dsh-dev-link\s*\{[^}]*text-decoration:\s*underline/)
    expect(DEV_SECTION_CSS).toMatch(/\.dsh-dev-link\s*\{[^}]*color:\s*#4d6bfe/i)
    // 两个并列按钮必须等宽平分（用户定例：并列半行宽）。
    expect(DEV_SECTION_CSS).toMatch(/\.dsh-dev-split\s*>\s*\.dsh-dev-btn\s*\{[^}]*flex:\s*1 1 0/)
  })

  it('外链失败给人话与下一步，不把机器码抛给用户', async () => {
    const openExternalLink = vi.fn(() => JSON.stringify({ ok: false, reason: 'no-handler' }))
    const el = await render({ shizukuStatus: () => shizukuJson(), openExternalLink })
    await act(async () => { buttonByText(el, '下载 Shizuku').click() })
    expect(el.textContent).toContain('设备上没有能打开它的应用')
    expect(el.textContent, '机器码不得上屏').not.toContain('no-handler')
    expect(el.textContent).not.toContain('no-handler')
  })

  // ── 无障碍：受限设置解锁入口（0.14.1 把无调用点的能力接上）────

  it('Android 13+ 未开启且受限设置生效时，出现「解锁受限设置」并显示结果', async () => {
    const a11yStatus = vi.fn(() => JSON.stringify({
      enabled: false,
      label: 'DSH 设备控制',
      restrictedSettingsApplies: true,
      hint: '未开启：到 系统设置 → 无障碍 → 已下载的服务 里开启「DSH 设备控制」',
    }))
    const unlockRestrictedSettings = vi.fn(() => JSON.stringify({ ok: true, message: '已解锁受限设置（Shizuku 特权 shell）' }))
    const el = await render({ a11yStatus, unlockRestrictedSettings })
    expect(el.textContent).toContain('未开启（推荐开启）')
    expect(el.textContent).toContain('受限设置')
    const unlock = buttonByText(el, '解锁受限设置')
    await act(async () => { unlock.click() })
    expect(unlockRestrictedSettings).toHaveBeenCalledTimes(1)
    expect(el.textContent).toContain('已解锁受限设置')
  })

  it('无障碍已开启时不显示解锁按钮（不给用户一个不必要的特权动作）', async () => {
    const a11yStatus = vi.fn(() => JSON.stringify({ enabled: true, restrictedSettingsApplies: true, hint: '无障碍服务已开启' }))
    const el = await render({ a11yStatus })
    expect(el.textContent).toContain('已开启（语义读取/点击/输入）')
    expect([...el.querySelectorAll('button')].some((item) => item.textContent === '解锁受限设置')).toBe(false)
  })

  it('无障碍状态读不到时如实报「状态不可读」，不冒充「未开启」', async () => {
    const el = await render({})
    const detail = detailLine(el, '无障碍通道')
    expect(detail).toContain('状态不可读')
    expect(detail).not.toContain('未开启')
  })
})

describe('手机控制纯函数（文案口径）', () => {
  const ready = {
    readable: true, installed: true, running: true, granted: true, bound: true, binding: false, guidance: '',
  }

  it('shizukuStateLabel 走真实推进顺序，各态互不相同', () => {
    expect(shizukuStateLabel({ ...ready, readable: false })).toBe('状态不可读')
    expect(shizukuStateLabel({ ...ready, installed: false })).toBe('未安装')
    expect(shizukuStateLabel({ ...ready, running: false })).toBe('已安装，Shizuku 未启动')
    expect(shizukuStateLabel({ ...ready, granted: false })).toBe('已启动，尚未授权')
    expect(shizukuStateLabel({ ...ready, bound: false, binding: true })).toBe('已授权，通道建立中')
    expect(shizukuStateLabel({ ...ready, bound: false, binding: false })).toBe('已授权，通道未建立')
    expect(shizukuStateLabel(ready)).toBe('通道就绪')
  })

  it('每一态都给出「下一步做什么」，没有只报状态的死句', () => {
    for (const state of [
      { ...ready, readable: false },
      { ...ready, installed: false },
      { ...ready, running: false },
      { ...ready, granted: false },
      { ...ready, bound: false },
      ready,
    ]) {
      expect(shizukuStepHint(state).length).toBeGreaterThan(8)
    }
  })

  it('失败原因一律经唯一真源翻成人话（P3-1）', () => {
    // 本文件原有的局部表 LINK_REASON_LABEL 已删除——断言改指向唯一真源，避免又长出第二张表。
    expect(describeCallReason('unknown-key')).toContain('没有在本版登记')
    expect(describeCallReason('not-installed')).toContain('下载 Shizuku')
  })

  it('未知原因不得原样带出机器码（旧断言把缺陷当契约，已按 P3-1 反向）', () => {
    const text = describeCallReason('something-new')
    expect(text).not.toContain('something-new')
    expect(text.length).toBeGreaterThan(8)
  })

  it('settleLinkCall / settleUnlockCall：只有 ok 才算成功，失败必带原因', () => {
    expect(settleLinkCall(JSON.stringify({ ok: true }), '成功', '失败')).toEqual({ ok: true, text: '成功' })
    const refused = settleLinkCall(JSON.stringify({ ok: false, reason: 'insecure-url' }), '成功', '打开失败')
    expect(refused.ok).toBe(false)
    expect(refused.text).toContain('https')
    // 桥缺席（undefined）不得当成成功——静默成功正是本轮在清的缺陷形态。
    expect(settleLinkCall(undefined, '成功', '打开失败').ok).toBe(false)
    expect(settleUnlockCall(JSON.stringify({ ok: true, message: '已解锁' }))).toEqual({ ok: true, text: '已解锁' })
    expect(settleUnlockCall(JSON.stringify({ ok: false, message: '解锁失败（权限不足）' })).text).toContain('权限不足')
  })
})
