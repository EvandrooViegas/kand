/**
 * Text editing utilities for rich text support in canvas
 */

import { parseStyledText, resolveCanvasClass } from '@/lib/styleParser'

/**
 * Convert styled text tokens to HTML
 */
export function tagsToHtml(text: string = '', classes: Record<string, any> = {}): string {
  const tokens = parseStyledText(text || '', classes)

  const toHtml = (arr: any[]): string => {
    return arr
      .map((t) => {
        if (typeof t === 'string') {
          return t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        }
        if (t.className) {
          const cleanName = t.className.startsWith('.') ? t.className.slice(1) : t.className
          return `<span class="${cleanName}">${toHtml(t.children)}</span>`
        }
        // Inline style token
        const styleStr = Object.entries(t.style || {})
          .map(([k, v]) => {
            const css = k.replace(/([A-Z])/g, '-$1').toLowerCase()
            return `${css}:${v}`
          })
          .join(';')
        return `<span style="${styleStr}">${toHtml(t.children)}</span>`
      })
      .join('')
  }

  return toHtml(tokens)
}

/**
 * Convert HTML back to styled text tags
 */
export function htmlToTags(html: string, classes: Record<string, any> = {}): string {
  const temp = document.createElement('div')
  temp.innerHTML = html

  const normalizeClassTagName = (className: string): string => {
    if (!className) return ''
    const resolved = resolveCanvasClass(classes, className)
    if (resolved?.key) return resolved.key.startsWith('.') ? resolved.key : `.${resolved.key}`
    return className.startsWith('.') ? className : `.${className}`
  }

  const walk = (n: Node): string => {
    let str = ''
    for (const child of n.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        str += child.textContent
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const elem = child as HTMLElement

        if (elem.tagName === 'SPAN' && elem.className && !elem.style.cssText) {
          const cls = normalizeClassTagName(elem.className)
          str += `<%kind:${cls}:${walk(child)}%>`
        } else if (elem.tagName === 'SPAN' && elem.style.cssText) {
          // Inline-styled span
          const styleParts: string[] = []
          if (elem.style.color) styleParts.push(`color=${elem.style.color}`)
          if (elem.style.fontSize) styleParts.push(`font-size=${elem.style.fontSize}`)
          if (elem.style.textDecoration && elem.style.textDecoration !== 'none') {
            styleParts.push(`textDecoration=${elem.style.textDecoration}`)
          }
          if (elem.style.fontWeight) styleParts.push(`fontWeight=${elem.style.fontWeight}`)
          if (elem.style.fontStyle) styleParts.push(`fontStyle=${elem.style.fontStyle}`)
          if (elem.style.backgroundColor) styleParts.push(`backgroundColor=${elem.style.backgroundColor}`)
          if (elem.style.letterSpacing) styleParts.push(`letterSpacing=${elem.style.letterSpacing}`)

          if (styleParts.length > 0) {
            str += `<%inline:${styleParts.join('|')}:${walk(child)}%>`
          } else {
            str += walk(child)
          }
        } else if (elem.tagName === 'FONT') {
          // execCommand 'foreColor' creates <font color="...">
          const parts: string[] = []
          if ((elem as any).color) parts.push(`color=${(elem as any).color}`)
          const inner = walk(child)
          str += parts.length > 0 ? `<%inline:${parts.join('|')}:${inner}%>` : inner
        } else if (elem.tagName === 'U') {
          str += `<%inline:textDecoration=underline:${walk(child)}%>`
        } else if (elem.tagName === 'B' || elem.tagName === 'STRONG') {
          str += `<%inline:fontWeight=bold:${walk(child)}%>`
        } else if (elem.tagName === 'I' || elem.tagName === 'EM') {
          str += `<%inline:fontStyle=italic:${walk(child)}%>`
        } else if (elem.tagName === 'BR') {
          str += '\n'
        } else if (elem.tagName === 'DIV' || elem.tagName === 'P') {
          const childStr = walk(child)
          str += childStr ? '\n' + childStr : '\n'
        } else {
          str += walk(child)
        }
      }
    }
    return str
  }

  return walk(temp).replace(/\n\n/g, '\n')
}

/**
 * Text format state
 */
export interface TextFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  align: 'left' | 'center' | 'right'
}

/**
 * Get current selection text format
 */
export function getSelectionFormat(): Partial<TextFormat> {
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    align: document.queryCommandState('justifyCenter')
      ? 'center'
      : document.queryCommandState('justifyRight')
      ? 'right'
      : 'left',
  }
}

/**
 * Selection rectangle for floating toolbar
 */
export interface SelectionRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Get selection rect from range
 */
export function getSelectionRect(range: Range): SelectionRect | null {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0) return null
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}
