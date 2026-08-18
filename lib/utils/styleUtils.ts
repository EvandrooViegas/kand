/**
 * Style and visual utilities for canvas editor
 */

/**
 * Build gradient CSS from node configuration
 */
export function buildGradientCssClient(node: any): string {
  const stops = (node.stops || [
    { color: '#6366f1', position: 0, alpha: 100 },
    { color: '#ec4899', position: 100, alpha: 100 },
  ])
    .slice()
    .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
    .map((s: any) => {
      const a = (typeof s.alpha === 'number' ? s.alpha : 100) / 100
      const hex = s.color || '#000000'
      const r = parseInt(hex.slice(1, 3), 16) || 0
      const g = parseInt(hex.slice(3, 5), 16) || 0
      const b = parseInt(hex.slice(5, 7), 16) || 0
      return `rgba(${r},${g},${b},${a}) ${s.position || 0}%`
    })
    .join(', ')

  if (node.gradientType === 'radial') {
    return `radial-gradient(circle at center, ${stops})`
  }

  const angle = typeof node.angle === 'number' ? node.angle : 90
  return `linear-gradient(${angle}deg, ${stops})`
}

/**
 * Build filter CSS string from filter object
 */
export function buildFilterCss(filters: any): string {
  const f = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    blur: 0,
    sepia: 0,
    hueRotate: 0,
    opacity: 100,
    ...(filters || {}),
  }

  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) hue-rotate(${f.hueRotate}deg) blur(${f.blur}px) opacity(${f.opacity}%)`
}

/**
 * Validate hex color format
 */
export function isValidHex(hex: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)
}

/**
 * Default filter values
 */
export const DEFAULT_FILTERS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  blur: 0,
  sepia: 0,
  hueRotate: 0,
  opacity: 100,
}

/**
 * Gradient presets for quick selection
 */
export const GRADIENT_PRESETS = [
  {
    name: 'Sunset',
    stops: [
      { color: '#ff7e5f', position: 0, alpha: 100 },
      { color: '#feb47b', position: 100, alpha: 100 },
    ],
    angle: 135,
  },
  {
    name: 'Purple Haze',
    stops: [
      { color: '#667eea', position: 0, alpha: 100 },
      { color: '#764ba2', position: 100, alpha: 100 },
    ],
    angle: 135,
  },
  {
    name: 'Ocean',
    stops: [
      { color: '#2193b0', position: 0, alpha: 100 },
      { color: '#6dd5ed', position: 100, alpha: 100 },
    ],
    angle: 135,
  },
  {
    name: 'Pink Bloom',
    stops: [
      { color: '#ec4899', position: 0, alpha: 100 },
      { color: '#8b5cf6', position: 100, alpha: 100 },
    ],
    angle: 90,
  },
  {
    name: 'Forest',
    stops: [
      { color: '#134e5e', position: 0, alpha: 100 },
      { color: '#71b280', position: 100, alpha: 100 },
    ],
    angle: 135,
  },
  {
    name: 'Fire',
    stops: [
      { color: '#f12711', position: 0, alpha: 100 },
      { color: '#f5af19', position: 100, alpha: 100 },
    ],
    angle: 45,
  },
  {
    name: 'Glass',
    stops: [
      { color: '#ffffff', position: 0, alpha: 80 },
      { color: '#ffffff', position: 100, alpha: 0 },
    ],
    angle: 180,
  },
  {
    name: 'Fade Out',
    stops: [
      { color: '#000000', position: 0, alpha: 0 },
      { color: '#000000', position: 100, alpha: 80 },
    ],
    angle: 180,
  },
]
