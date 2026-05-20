// lib/styleParser.js

// Parse an inline style string like "color=#ff0000|font-size=24px|textDecoration=underline"
export function resolveCanvasClass(canvasClasses = {}, className = '') {
  if (!className) return null
  if (canvasClasses[className]) return { key: className, style: canvasClasses[className] }
  const withDot = className.startsWith('.') ? className : `.${className}`
  if (canvasClasses[withDot]) return { key: withDot, style: canvasClasses[withDot] }
  const withoutDot = className.startsWith('.') ? className.slice(1) : className
  if (canvasClasses[withoutDot]) return { key: withoutDot, style: canvasClasses[withoutDot] }
  return null
}

function parseInlineStyleString(str) {
  const style = {}
  str.split('|').forEach(part => {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) return
    const prop = part.slice(0, eqIdx).trim()
    const val = part.slice(eqIdx + 1).trim()
    // Convert kebab-case to camelCase
    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    style[camelProp] = val
  })
  return style
}

// Finds the next <%kind: or <%inline: opening tag after currentIndex
function findNextOpenTag(text, currentIndex) {
  const kindIdx = text.indexOf('<%kind:', currentIndex)
  const inlineIdx = text.indexOf('<%inline:', currentIndex)
  if (kindIdx === -1 && inlineIdx === -1) return null
  if (kindIdx === -1) return { idx: inlineIdx, type: 'inline', prefixLen: 9 }
  if (inlineIdx === -1) return { idx: kindIdx, type: 'kind', prefixLen: 7 }
  return kindIdx <= inlineIdx
    ? { idx: kindIdx, type: 'kind', prefixLen: 7 }
    : { idx: inlineIdx, type: 'inline', prefixLen: 9 }
}

// Recursively parses text containing <%kind:.classname:content%> and <%inline:prop=val|...:content%>
// Returns an array of token objects/strings.
export function parseStyledText(text, canvasClasses = {}) {
  if (!text) return []

  const tokens = []
  let currentIndex = 0

  while (currentIndex < text.length) {
    const next = findNextOpenTag(text, currentIndex)
    if (!next) {
      tokens.push(text.slice(currentIndex))
      break
    }

    const openIdx = next.idx
    const tagType = next.type
    const prefixLen = next.prefixLen

    if (openIdx > currentIndex) {
      tokens.push(text.slice(currentIndex, openIdx))
    }

    // Find the separator colon that ends the class name / style string
    // prefixLen already covers the full prefix (e.g. '<%kind:' = 7 chars),
    // so the class name / style string starts at openIdx + prefixLen.
    const separatorIdx = text.indexOf(':', openIdx + prefixLen)
    if (separatorIdx === -1) {
      tokens.push(text.slice(openIdx))
      break
    }

    const tagValue = text.slice(openIdx + prefixLen, separatorIdx)

    // Now find the matching closing %> using balanced counting for nested <%kind: or <%inline:
    let balance = 1
    let contentStartIdx = separatorIdx + 1
    let searchIdx = contentStartIdx
    let matchIdx = -1

    while (searchIdx < text.length) {
      const nextOpen = findNextOpenTag(text, searchIdx)
      const nextClose = text.indexOf('%>', searchIdx)

      if (nextClose === -1) break

      if (nextOpen !== null && nextOpen.idx < nextClose) {
        balance++
        searchIdx = nextOpen.idx + nextOpen.prefixLen
      } else {
        balance--
        if (balance === 0) {
          matchIdx = nextClose
          break
        }
        searchIdx = nextClose + 2
      }
    }

    if (matchIdx === -1) {
      tokens.push(text.slice(openIdx))
      break
    }

    const innerContent = text.slice(contentStartIdx, matchIdx)
    const parsedInner = parseStyledText(innerContent, canvasClasses)

    if (tagType === 'kind') {
      const className = tagValue
      const cls = resolveCanvasClass(canvasClasses, className)?.style || {}
      const elementStyle = {
        ...(cls.color ? { color: cls.color } : {}),
        ...(cls.background || cls.backgroundColor ? { backgroundColor: cls.background || cls.backgroundColor } : {}),
        ...(cls.textDecoration ? { textDecoration: cls.textDecoration } : {}),
        ...(cls.letterSpacing ? { letterSpacing: `${cls.letterSpacing}px` } : {}),
        ...(cls.textShadow && cls.textShadow.enabled ? { textShadow: `${cls.textShadow.offsetX || 0}px ${cls.textShadow.offsetY || 0}px ${cls.textShadow.blur || 0}px ${cls.textShadow.color || '#000'}` } : {}),
        ...(cls.fontWeight ? { fontWeight: cls.fontWeight } : {}),
        ...(cls.fontStyle ? { fontStyle: cls.fontStyle } : {}),
        ...(cls.textTransform ? { textTransform: cls.textTransform } : {}),
        ...((cls.paddingX || cls.paddingY) ? { padding: `${cls.paddingY || 0}px ${cls.paddingX || 0}px` } : {}),
        ...(cls.borderRadius ? { borderRadius: `${cls.borderRadius}px` } : {}),
        ...(cls.boxShadow && cls.boxShadow.enabled ? { boxShadow: `${cls.boxShadow.offsetX || 0}px ${cls.boxShadow.offsetY || 0}px ${cls.boxShadow.blur || 0}px ${cls.boxShadow.color || '#000'}` } : {}),
      }
      tokens.push({ type: 'styled', className, style: elementStyle, children: parsedInner })
    } else {
      // inline type — tagValue is the style string
      const elementStyle = parseInlineStyleString(tagValue)
      tokens.push({ type: 'styled', style: elementStyle, children: parsedInner })
    }

    currentIndex = matchIdx + 2
  }

  return tokens
}

// Convert AST to React/Satori elements
export function renderStyledText(tokens, ReactCreateElement = null) {
  return tokens.map((token, i) => {
    if (typeof token === 'string') return token
    
    if (ReactCreateElement) {
      return ReactCreateElement('span', { key: i, style: token.style }, renderStyledText(token.children, ReactCreateElement))
    } else {
      return {
        type: 'span',
        props: {
          style: { ...token.style },
          children: renderStyledText(token.children, null)
        }
      }
    }
  })
}

// Extract URL and merged filters from nested class tags for images
export function parseImageTags(urlStr, canvasClasses = {}) {
  if (typeof urlStr !== 'string') return { url: urlStr, filters: null }
  
  let currentStr = urlStr
  const filters = {
    brightness: 100, contrast: 100, saturate: 100, grayscale: 0, 
    blur: 0, sepia: 0, hueRotate: 0, opacity: 100
  }
  let modified = false

  while (currentStr && currentStr.startsWith('<%kind:')) {
    const classEndIdx = currentStr.indexOf(':')
    if (classEndIdx === -1) break
    
    const colon2Idx = currentStr.indexOf(':', classEndIdx + 1)
    if (colon2Idx === -1) break

    const className = currentStr.slice(7, colon2Idx)
    const cls = resolveCanvasClass(canvasClasses, className)?.style || {}
    
    if (cls.filters) {
      modified = true
      Object.keys(cls.filters).forEach(k => {
        filters[k] = cls.filters[k]
      })
    }

    const endTagIdx = currentStr.lastIndexOf('%>')
    if (endTagIdx !== -1) {
      currentStr = currentStr.slice(colon2Idx + 1, endTagIdx)
    } else {
      break
    }
  }

  return {
    url: currentStr,
    filters: modified ? filters : null
  }
}
