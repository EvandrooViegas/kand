/**
 * Canvas and node utilities
 */

import { parseStyledText } from '@/lib/styleParser'

/**
 * Generate descriptive label for a layer
 */
export function nodeLayerLabel(n: any): string {
  if (n.dynamic_key) return `{${n.dynamic_key}}`
  if (n.type === 'text') {
    return plainTextFromStyled(n.text || '') || 'Empty text'
  }
  if (n.type === 'image') return 'Image'
  if (n.type === 'gradient') return 'Gradient'
  return n.shape === 'ellipse' ? 'Circle' : 'Rectangle'
}

/**
 * Extract plain text from styled text (removes all formatting)
 */
export function plainTextFromStyled(text: string = ''): string {
  const walk = (tokens: any[]): string[] => {
    return tokens.map((t) => {
      if (typeof t === 'string') return t
      if (t?.children?.length) return walk(t.children).join('')
      return ''
    })
  }

  return walk(parseStyledText(text || '', {}))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Font metadata configuration
 */
export const FONT_META: Record<string, any> = {
  'Inter': { weights: [400, 700], italic: false },
  'Roboto': { weights: [300, 400, 500, 700, 900], italic: true },
  'Poppins': { weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  'Oswald': { weights: [300, 400, 500, 600, 700], italic: false },
  'Montserrat': { weights: [400, 500, 600, 700, 800, 900], italic: true },
  'Playfair Display': { weights: [400, 500, 600, 700, 800, 900], italic: true },
  'Bebas Neue': { weights: [400], italic: false },
  'Dancing Script': { weights: [400, 500, 600, 700], italic: false },
  'Pacifico': { weights: [400], italic: false },
  'Lobster': { weights: [400], italic: false },
  'Raleway': { weights: [400, 500, 600, 700, 800, 900], italic: true },
  'Lato': { weights: [300, 400, 700, 900], italic: true },
  'Open Sans': { weights: [400, 500, 600, 700, 800], italic: true },
}

/**
 * Font weight display labels
 */
export const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}

/**
 * Get canvas class style from classes object
 */
export function getCanvasClassStyle(
  classes: Record<string, any> = {},
  className: string = ''
): any {
  if (!className) return {}
  // Assume resolveCanvasClass is available globally or imported
  // For now, return empty object
  return {}
}

/**
 * Normalize class tag name with dot prefix
 */
export function normalizeClassTagName(
  classes: Record<string, any> = {},
  className: string = ''
): string {
  if (!className) return ''
  // Ensure class name has dot prefix for consistency
  return className.startsWith('.') ? className : `.${className}`
}
