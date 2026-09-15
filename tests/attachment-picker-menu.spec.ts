// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttachmentPickerMenuEnhancer } from '../src/client/mobile/attachment-picker-menu.ts'

let enhancer: AttachmentPickerMenuEnhancer
let paperclip: HTMLButtonElement
let input: HTMLInputElement

function mountComposer(language = 'zh-CN'): void {
  document.documentElement.lang = language
  const card = document.createElement('div')
  card.setAttribute('data-composer-card', '')
  const tools = document.createElement('div')
  const plus = document.createElement('button')
  plus.type = 'button'
  plus.textContent = 'plus'
  paperclip = document.createElement('button')
  paperclip.type = 'button'
  paperclip.textContent = 'paperclip'
  paperclip.getBoundingClientRect = () => ({ left: 20, top: 400, right: 52, bottom: 432, width: 32, height: 32, x: 20, y: 400, toJSON: () => ({}) })
  input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  tools.append(plus, paperclip, input)
  card.append(tools)
  document.body.append(card)
}

beforeEach(() => {
  mountComposer()
  enhancer = new AttachmentPickerMenuEnhancer()
  enhancer.attach()
})

afterEach(() => {
  enhancer.detach()
  document.body.innerHTML = ''
  document.documentElement.lang = ''
  vi.restoreAllMocks()
})

describe('AttachmentPickerMenuEnhancer', () => {
  it('claims the paperclip click before upstream direct picker behavior', () => {
    const upstream = vi.fn()
    paperclip.addEventListener('click', upstream)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    paperclip.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(upstream).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dsh-attachment-picker-menu]')).not.toBeNull()
    expect(paperclip.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows two localized choices with menu semantics', () => {
    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const menu = document.querySelector<HTMLElement>('[data-dsh-attachment-picker-menu]')!
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(2)
    expect(menu.textContent).toContain('上传附件')
    expect(menu.textContent).toContain('上传图片')
  })

  it('selects generic files through the original input and restores its accept attribute', () => {
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.querySelector<HTMLElement>('[data-dsh-attachment-picker-item="file"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(input.getAttribute('accept')).toBe('*/*')
    input.dispatchEvent(new Event('change'))
    expect(input.hasAttribute('accept')).toBe(false)
    expect(document.querySelector('[data-dsh-attachment-picker-menu]')).toBeNull()
  })

  it('does not restore accept during the synchronous WebView focus caused by input.click', () => {
    const click = vi.spyOn(input, 'click').mockImplementation(() => {
      window.dispatchEvent(new Event('focus'))
    })
    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.querySelector<HTMLElement>('[data-dsh-attachment-picker-item="image"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(input.getAttribute('accept')).toBe('image/*')
    input.dispatchEvent(new Event('change'))
    expect(input.hasAttribute('accept')).toBe(false)
  })

  it('selects images through the original input and restores a pre-existing accept filter', () => {
    input.setAttribute('accept', '.txt')
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.querySelector<HTMLElement>('[data-dsh-attachment-picker-item="image"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(input.getAttribute('accept')).toBe('image/*')
    input.dispatchEvent(new Event('change'))
    expect(input.getAttribute('accept')).toBe('.txt')
  })

  it('closes on outside pointerdown and on Escape', () => {
    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(document.querySelector('[data-dsh-attachment-picker-menu]')).toBeNull()

    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(document.querySelector('[data-dsh-attachment-picker-menu]')).toBeNull()
    expect(paperclip.getAttribute('aria-expanded')).toBeNull()
  })

  it('uses English copy when the document language is English', () => {
    enhancer.detach()
    document.body.innerHTML = ''
    mountComposer('en-US')
    enhancer = new AttachmentPickerMenuEnhancer()
    enhancer.attach()
    paperclip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(document.querySelector('[data-dsh-attachment-picker-menu]')?.textContent).toContain('Upload attachment')
    expect(document.querySelector('[data-dsh-attachment-picker-menu]')?.textContent).toContain('Upload image')
  })
})
