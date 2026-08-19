// @vitest-environment node
// CSS 字符串健全性校验（Review 2026-08-18）：mobile-settings.css.ts 曾以
// 未闭合选择器块（{7 / }5）入库并注入 <style>，该规则永远不生效且无任何
// 构建期/测试期手段捕获。本测试对 src/**/*.css.ts 的模板字符串做括号平衡
// 断言，防止同类错误再次漏网。
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** 收集 src 下所有 *.css.ts 文件路径。 */
function collectCssTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectCssTs(full))
    else if (entry.name.endsWith('.css.ts')) out.push(full)
  }
  return out
}

describe('CSS 注入字符串健全性', () => {
  const files = collectCssTs(join(root, 'src'))
  it('存在 css.ts 文件（防测试自身静默空跑）', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const rel = relative(root, file)
    it(`${rel} 的花括号平衡`, () => {
      const source = readFileSync(file, 'utf8')
      // 提取模板字符串体：css.ts 的 CSS 在反引号内；逐字符扫描找最外层模板串。
      const bodies: string[] = []
      for (const match of source.matchAll(/`([^`]*)`/g)) bodies.push(match[1])
      expect(bodies.length).toBeGreaterThan(0)
      for (const body of bodies) {
        const open = (body.match(/\{/g) ?? []).length
        const close = (body.match(/\}/g) ?? []).length
        expect(open, `${rel} CSS 模板花括号不平衡（{ ${open} / } ${close}）`).toBe(close)
      }
    })
  }
})
