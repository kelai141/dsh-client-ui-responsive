// @vitest-environment node
// 布局 store 单测（Review 2026-08-18 T1 补测）：直接驱动 stores.ts 导出的
// layoutActions 纯 draft 变换（immer 语义 = 就地改 draft），不依赖 runtime
// 的模块加载器。三态 toggle 语义（wide/narrow/mobile）与断点穿越重置逻辑。
import { describe, it, expect, vi } from 'vitest'

// runtime 的 client bundle 顶层执行 window.__ModuleLoader__.load（浏览器
// 加载器形态），vitest 无法提供；本测试只驱动 stores.ts 的 layoutActions
// 纯 draft 变换，defineStore 仅需存在（createLayoutStore 不在本测试范围）。
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  defineStore: (decl: unknown) => ({ create: () => decl }),
}))

import { layoutActions } from '../src/client/stores.ts'
import { SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX, DETAILS_DEFAULT, DETAILS_MIN, DETAILS_MAX } from '../src/client/columns.ts'

type LayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  mobile: boolean
  drawerOpen: boolean
}

/** 每次调用前从初始状态 clone 一个 fresh draft（immer produce 语义）。 */
function freshDraft(): LayoutState {
  return { sidebar: SIDEBAR_DEFAULT, details: 0, narrow: false, narrowExpanded: false, mobile: false, drawerOpen: false }
}

describe('layoutActions 初始状态', () => {
  it('初始：sidebar=默认宽、details 关闭、非窄屏、非移动、抽屉关', () => {
    const s = freshDraft()
    expect(s.sidebar).toBe(SIDEBAR_DEFAULT)
    expect(s.details).toBe(0)
    expect(s.narrow).toBe(false)
    expect(s.narrowExpanded).toBe(false)
    expect(s.mobile).toBe(false)
    expect(s.drawerOpen).toBe(false)
  })
})

describe('面板宽度写入', () => {
  it('setSidebar 钳入契约区间', () => {
    const d = freshDraft()
    layoutActions.setSidebar(d, 100)
    expect(d.sidebar).toBe(SIDEBAR_MIN)
    layoutActions.setSidebar(d, 9999)
    expect(d.sidebar).toBe(SIDEBAR_MAX)
    layoutActions.setSidebar(d, 300)
    expect(d.sidebar).toBe(300)
  })

  it('setDetails 钳入区间且不跨开关线（0 → 被钳到 min，关闭只能走 closeDetails）', () => {
    const d = freshDraft()
    layoutActions.setDetails(d, 0)
    expect(d.details).toBe(DETAILS_MIN)
    layoutActions.setDetails(d, 9999)
    expect(d.details).toBe(DETAILS_MAX)
  })
})

describe('toggleSidebar 三态语义', () => {
  it('宽屏：翻转宽度偏好（关 ↔ 默认宽）', () => {
    const d = freshDraft()
    layoutActions.toggleSidebar(d)
    expect(d.sidebar).toBe(0)
    layoutActions.toggleSidebar(d)
    expect(d.sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('窄屏：只翻转 narrowExpanded 覆盖，宽度偏好不被重写', () => {
    const d = freshDraft()
    layoutActions.setNarrow(d, true)
    layoutActions.toggleSidebar(d)
    expect(d.narrowExpanded).toBe(true)
    expect(d.sidebar).toBe(SIDEBAR_DEFAULT) // 偏好保留
    layoutActions.toggleSidebar(d)
    expect(d.narrowExpanded).toBe(false)
  })

  it('移动形态：翻转抽屉开关，不碰宽度偏好', () => {
    const d = freshDraft()
    layoutActions.setMobile(d, true)
    layoutActions.toggleSidebar(d)
    expect(d.drawerOpen).toBe(true)
    expect(d.sidebar).toBe(SIDEBAR_DEFAULT)
    layoutActions.toggleSidebar(d)
    expect(d.drawerOpen).toBe(false)
  })
})

describe('断点穿越', () => {
  it('进入窄屏重置 narrowExpanded（默认回到自动折叠）', () => {
    const d = freshDraft()
    layoutActions.setNarrow(d, true)
    layoutActions.toggleSidebar(d) // 展开覆盖
    expect(d.narrowExpanded).toBe(true)
    layoutActions.setNarrow(d, false) // 离开窄屏
    layoutActions.setNarrow(d, true) // 再次进入
    expect(d.narrowExpanded).toBe(false)
  })

  it('进入移动形态关闭抽屉；离开保留状态', () => {
    const d = freshDraft()
    layoutActions.setMobile(d, true)
    layoutActions.toggleSidebar(d) // 抽屉开
    expect(d.drawerOpen).toBe(true)
    layoutActions.setMobile(d, false)
    expect(d.drawerOpen).toBe(true) // 离开保留（宽形态不用）
    layoutActions.setMobile(d, true)
    expect(d.drawerOpen).toBe(false) // 再进入即关
  })
})

describe('details 开关', () => {
  it('openDetails：关闭时打开到默认宽；已打开不重复写', () => {
    const d = freshDraft()
    layoutActions.openDetails(d)
    expect(d.details).toBe(DETAILS_DEFAULT)
    layoutActions.setDetails(d, 400)
    layoutActions.openDetails(d) // 已开：no-op
    expect(d.details).toBe(400)
  })

  it('closeDetails：关闭面板（写 0）', () => {
    const d = freshDraft()
    layoutActions.openDetails(d)
    layoutActions.closeDetails(d)
    expect(d.details).toBe(0)
  })
})
