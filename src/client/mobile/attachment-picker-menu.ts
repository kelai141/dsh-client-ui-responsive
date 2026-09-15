/**
 * Composer attachment-source chooser.
 *
 * The upstream InputBar owns exactly one hidden multiple-file input and its existing addFiles/upload
 * admission path. This enhancer intercepts only the immediately preceding paperclip button, presents
 * a small upward menu, temporarily sets the same input's accept filter, and clicks it in the menu
 * item's user gesture. No second bridge, input, upload state, or attachment rail is introduced.
 */
const MENU_ATTR = 'data-dsh-attachment-picker-menu'
const ITEM_ATTR = 'data-dsh-attachment-picker-item'
const PAPERCLIP_ATTR = 'data-dsh-attachment-picker-trigger'

type PickerKind = 'file' | 'image'

interface PickerCopy {
  file: string
  image: string
}

function copyForDocument(): PickerCopy {
  const language = (document.documentElement.lang || navigator.language || '').toLowerCase()
  return language.startsWith('zh')
    ? { file: '上传附件', image: '上传图片' }
    : { file: 'Upload attachment', image: 'Upload image' }
}

function paperclipInput(button: HTMLButtonElement): HTMLInputElement | null {
  const direct = button.nextElementSibling
  if (direct instanceof HTMLInputElement && direct.type === 'file' && direct.multiple) return direct
  // Tooltip normally clones its anchor without a wrapper. Keep a narrow wrapper fallback for older
  // renderers without accidentally claiming the neighbouring command-plus button.
  const wrapperNext = button.parentElement?.nextElementSibling
  return wrapperNext instanceof HTMLInputElement && wrapperNext.type === 'file' && wrapperNext.multiple
    ? wrapperNext
    : null
}

function pickerTrigger(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null
  const button = target.closest<HTMLButtonElement>('[data-composer-card] button')
  if (button === null || button.disabled) return null
  return paperclipInput(button) === null ? null : button
}

function icon(kind: PickerKind): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('width', '17')
  svg.setAttribute('height', '17')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', kind === 'file'
    ? 'M5 2.75h6l4 4v10.5H5zM11 2.75v4h4M7.25 11h5.5M7.25 14h5.5'
    : 'M3.25 4.25h13.5v11.5H3.25zM5.5 13l3-3 2.25 2.25 1.5-1.5 2.5 2.5M7.25 7.75h.01')
  svg.appendChild(path)
  return svg
}

/** Owns the short-lived menu and delegates every selected file to InputBar's existing input. */
export class AttachmentPickerMenuEnhancer {
  private menu: HTMLElement | null = null
  private trigger: HTMLButtonElement | null = null
  private restoreActivePicker: (() => void) | null = null

  private readonly onClickCapture = (event: MouseEvent): void => {
    const button = pickerTrigger(event.target)
    if (button === null) return
    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
    this.open(button)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.menu === null || !(event.target instanceof Node)) return
    if (this.menu.contains(event.target) || this.trigger?.contains(event.target) === true) return
    this.close()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.menu === null) return
    event.preventDefault()
    this.close(true)
  }

  private readonly onViewportChange = (): void => {
    if (this.trigger === null || this.menu === null) return
    this.place(this.trigger, this.menu)
  }

  attach(): void {
    document.addEventListener('click', this.onClickCapture, true)
    document.addEventListener('pointerdown', this.onPointerDown, true)
    document.addEventListener('keydown', this.onKeyDown, true)
    window.addEventListener('resize', this.onViewportChange)
    window.addEventListener('scroll', this.onViewportChange, true)
  }

  detach(): void {
    document.removeEventListener('click', this.onClickCapture, true)
    document.removeEventListener('pointerdown', this.onPointerDown, true)
    document.removeEventListener('keydown', this.onKeyDown, true)
    window.removeEventListener('resize', this.onViewportChange)
    window.removeEventListener('scroll', this.onViewportChange, true)
    this.restoreActivePicker?.()
    this.close()
  }

  private open(button: HTMLButtonElement): void {
    if (this.trigger === button && this.menu !== null) {
      this.close(true)
      return
    }
    this.close()
    const copy = copyForDocument()
    const menu = document.createElement('div')
    menu.setAttribute(MENU_ATTR, '')
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', copy.file + ' / ' + copy.image)
    for (const [kind, label] of [['file', copy.file], ['image', copy.image]] as const) {
      const item = document.createElement('button')
      item.type = 'button'
      item.setAttribute(ITEM_ATTR, kind)
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-label', label)
      item.append(icon(kind))
      const text = document.createElement('span')
      text.textContent = label
      item.append(text)
      item.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.choose(button, kind)
      })
      menu.append(item)
    }
    document.body.append(menu)
    button.setAttribute(PAPERCLIP_ATTR, '')
    button.setAttribute('aria-expanded', 'true')
    this.menu = menu
    this.trigger = button
    this.place(button, menu)
  }

  private place(button: HTMLButtonElement, menu: HTMLElement): void {
    const rect = button.getBoundingClientRect()
    const width = Math.min(264, Math.max(180, window.innerWidth - 24))
    const left = Math.min(Math.max(rect.left, 12), Math.max(12, window.innerWidth - width - 12))
    menu.style.setProperty('width', width + 'px')
    menu.style.setProperty('left', left + 'px')
    menu.style.setProperty('bottom', Math.max(12, window.innerHeight - rect.top + 8) + 'px')
  }

  private choose(button: HTMLButtonElement, kind: PickerKind): void {
    const input = paperclipInput(button)
    if (input === null || input.disabled || !input.isConnected) {
      this.close()
      return
    }
    this.restoreActivePicker?.()
    const hadAccept = input.hasAttribute('accept')
    const originalAccept = input.getAttribute('accept')
    let restored = false
    let pickerBackgrounded = document.visibilityState === 'hidden'
    let fallbackTimer: number | undefined
    const restore = (): void => {
      if (restored) return
      restored = true
      input.removeEventListener('change', restore)
      input.removeEventListener('cancel', restore)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
      if (this.restoreActivePicker === restore) this.restoreActivePicker = null
      if (hadAccept) input.setAttribute('accept', originalAccept ?? '')
      else input.removeAttribute('accept')
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        pickerBackgrounded = true
        return
      }
      if (pickerBackgrounded) window.setTimeout(restore, 0)
    }
    function onWindowFocus(): void {
      // WebView may focus the input synchronously. Only restore after the app actually backgrounded
      // for the SAF Activity; restoring before onShowFileChooser reads params loses image/*.
      if (pickerBackgrounded) window.setTimeout(restore, 0)
    }
    input.setAttribute('accept', kind === 'image' ? 'image/*' : '*/*')
    input.addEventListener('change', restore, { once: true })
    input.addEventListener('cancel', restore, { once: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onWindowFocus)
    this.restoreActivePicker = restore
    // A cancelled old DocumentsUI picker may emit neither change nor cancel. The timeout is only a
    // cleanup fallback; it never runs before Android has read the current accept filter.
    fallbackTimer = window.setTimeout(restore, 120_000)
    try {
      // Keep this direct user-gesture stack intact. Some older Android WebViews reject a file-input
      // click if the menu is removed before the native chooser request is dispatched.
      input.click()
    } finally {
      this.close()
    }
  }

  private close(focus = false): void {
    const trigger = this.trigger
    this.menu?.remove()
    this.menu = null
    this.trigger = null
    if (trigger !== null) {
      trigger.removeAttribute(PAPERCLIP_ATTR)
      trigger.removeAttribute('aria-expanded')
      if (focus) trigger.focus({ preventScroll: true })
    }
  }
}
