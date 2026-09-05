/**
 * Canvas Designer — Art-Direction Engine
 *
 * Pipeline: Content Planner → Copywriter → Asset Planner → Asset Resolver
 *           → Canvas Designer → Canvas JSON → Renderer
 *
 * Architecture:
 *   1. Ask Groq for high-level art direction decisions (mood, palette roles,
 *      composition per slide, image treatment, decoration intensity).
 *      Groq NEVER emits coordinates — only semantic decisions.
 *   2. A TypeScript design engine translates those decisions into valid KAND
 *      Canvas nodes, guaranteeing schema correctness and text readability.
 *
 * The design engine is built on:
 *   - Rich color palette generation (HSL-based complementary/neutral/accent derivation)
 *   - 14 named composition templates (each with asymmetric / layered variants)
 *   - A decoration library (glows, rings, geometric accents, dividers, badges,
 *     floating cards, patterns) applied conditionally based on mood and intensity
 *   - Contrast validation before every text node is emitted
 *   - Cascade layout validation to prevent text overflow / out-of-bounds nodes
 */

import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import Groq from 'groq-sdk'
import { corsify } from '@/lib/services/middleware'
import type { ResolvedAssetPlan, ResolvedSlot } from './assetResolverHandler'

// ─── Canvas constants ─────────────────────────────────────────────────────────

const W = 1080
const H = 1080
const PAD = 72          // standard margin
const PAD_SM = 56       // tight margin

// ─── Supported fonts ──────────────────────────────────────────────────────────

const SUPPORTED_FONTS = [
  'Inter', 'Roboto', 'Poppins', 'Oswald', 'Montserrat',
  'Playfair Display', 'Bebas Neue', 'Dancing Script', 'Pacifico',
  'Lobster', 'Raleway', 'Lato', 'Open Sans',
]

// font weight availability per font (subset that renders correctly via fontsource)
const FONT_WEIGHTS: Record<string, number[]> = {
  'Inter':           [400, 700],
  'Roboto':          [300, 400, 500, 700, 900],
  'Poppins':         [300, 400, 500, 600, 700, 800, 900],
  'Oswald':          [300, 400, 500, 600, 700],
  'Montserrat':      [400, 500, 600, 700, 800, 900],
  'Playfair Display':[400, 500, 600, 700, 800, 900],
  'Bebas Neue':      [400],
  'Dancing Script':  [400, 500, 600, 700],
  'Pacifico':        [400],
  'Lobster':         [400],
  'Raleway':         [400, 500, 600, 700, 800, 900],
  'Lato':            [300, 400, 700, 900],
  'Open Sans':       [400, 500, 600, 700, 800],
}

function nearestWeight(font: string, desired: number): number {
  const available = FONT_WEIGHTS[font] ?? [400, 700]
  return available.reduce((best, w) =>
    Math.abs(w - desired) < Math.abs(best - desired) ? w : best
  , available[0])
}

// ─── Composition variants ─────────────────────────────────────────────────────

type Composition =
  | 'full_bleed_image'          // image covers full canvas, text overlaid bottom
  | 'image_top_text_panel'      // image top 50%, colored text panel bottom
  | 'image_right_text_left'     // image right 55%, text left (asymmetric)
  | 'image_left_text_right'     // image left 45%, text right
  | 'magazine_split'            // diagonal/angled color split with text + image
  | 'editorial_large_type'      // giant headline, minimal decoration, no image
  | 'centered_card'             // centered white/surface card on colored bg
  | 'layered_depth'             // blurred full-bleed image + frosted card overlay
  | 'bold_number'               // oversized number/counter, text below
  | 'quote_pull'                // large styled quote with accent mark
  | 'minimal_typographic'       // clean typography, generous whitespace, accent line
  | 'mosaic_circle'             // large centered circle image, text below
  | 'corner_accent'             // image in rounded corner, text fills rest
  | 'gradient_hero'             // rich gradient background, centered text, no image

// ─── Mood → decoration mapping ────────────────────────────────────────────────

type Mood = 'editorial' | 'premium' | 'minimal' | 'bold' | 'modern' | 'technical'
          | 'luxury'    | 'organic' | 'playful'  | 'corporate'

// ─── Art direction decision types ────────────────────────────────────────────

interface SlidePalette {
  bg:          string   // canvas background
  surface:     string   // card / panel surface
  primary:     string   // main brand color
  accent:      string   // secondary pop color
  text:        string   // primary text
  mutedText:   string   // secondary / body text
  gradFrom:    string   // gradient start
  gradTo:      string   // gradient end
}

type ImageTreatment =
  | 'natural'     // no filters
  | 'darken'      // reduce brightness for text overlay
  | 'desaturate'  // b&w or muted
  | 'warm'        // warm tones
  | 'cool'        // cool/blue tones
  | 'high_contrast'
  | 'duotone'     // strong saturation shift

type DecorationIntensity = 'none' | 'subtle' | 'moderate' | 'rich'

interface SlideDecision {
  slot_id:            string
  composition:        Composition
  palette:            SlidePalette
  heading_font:       string
  body_font:          string
  heading_weight:     number
  body_weight:        number
  image_treatment:    ImageTreatment
  decoration:         DecorationIntensity
  text_align:         'left' | 'center' | 'right'
  gradient_angle:     number      // 0–360
  use_gradient_bg:    boolean
}

interface ArtDirection {
  mood:         Mood
  slides:       SlideDecision[]
  heading_font: string
  body_font:    string
}

// ─── Color engine ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#000000').replace('#', '').padEnd(6, '0')
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0)
        : max === gn ? (bn - rn) / d + 2
        :              (rn - gn) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function adjustHsl(hex: string, dh = 0, ds = 0, dl = 0): string {
  const [r, g, b] = hexToRgb(hex)
  let [h, s, l] = rgbToHsl(r, g, b)
  h = ((h + dh) % 360 + 360) % 360
  s = Math.max(0, Math.min(1, s + ds))
  l = Math.max(0, Math.min(1, l + dl))
  return rgbToHex(...hslToRgb(h, s, l))
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Returns the more readable of white / black against bg */
function readableOn(bg: string): string {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#111111', bg) ? '#ffffff' : '#111111'
}

/** Ensure text meets at least AA (4.5:1). Lighten or darken text until it does. */
function ensureContrast(text: string, bg: string, minRatio = 4.5): string {
  if (contrastRatio(text, bg) >= minRatio) return text
  // try white / black first
  const w = contrastRatio('#ffffff', bg)
  const k = contrastRatio('#111111', bg)
  return w >= k ? '#ffffff' : '#111111'
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(100, alpha)) / 100 * 255).toString(16).padStart(2, '0')
  return hex.replace('#', '') + a
}

function withAlpha(hex: string, alpha: number): string {
  return `#${hexWithAlpha(hex, alpha)}`
}

/** Build an 8-role palette from brand colors + mood */
function buildPalette(brandColors: string[], mood: Mood): SlidePalette {
  const brand0 = safeHex(brandColors[0], '#1a1a2e')
  const brand1 = safeHex(brandColors[1], '')
  const brand2 = safeHex(brandColors[2], '')

  const [h, s, l] = rgbToHsl(...hexToRgb(brand0))

  // mood → lightness offsets for bg / surface
  const moodBg: Record<Mood, { bgL: number; surfaceL: number; accentShift: number }> = {
    editorial:  { bgL: 0.97, surfaceL: 1.0,  accentShift: 0   },
    premium:    { bgL: 0.06, surfaceL: 0.12, accentShift: 30  },
    minimal:    { bgL: 0.98, surfaceL: 1.0,  accentShift: 0   },
    bold:       { bgL: 0.08, surfaceL: 0.15, accentShift: 180 },
    modern:     { bgL: 0.10, surfaceL: 0.16, accentShift: 210 },
    technical:  { bgL: 0.05, surfaceL: 0.10, accentShift: 200 },
    luxury:     { bgL: 0.04, surfaceL: 0.09, accentShift: 45  },
    organic:    { bgL: 0.95, surfaceL: 0.99, accentShift: -20 },
    playful:    { bgL: 0.93, surfaceL: 0.98, accentShift: 120 },
    corporate:  { bgL: 0.96, surfaceL: 1.0,  accentShift: 10  },
  }
  const mo = moodBg[mood] ?? moodBg.editorial

  const bg      = rgbToHex(...hslToRgb(h, Math.min(s, 0.12), mo.bgL))
  const surface = rgbToHex(...hslToRgb(h, Math.min(s, 0.08), mo.surfaceL))
  const primary = brand0
  const accent  = brand1 || adjustHsl(brand0, mo.accentShift, 0.05, 0)
  const text    = ensureContrast(readableOn(bg), bg)
  const muted   = ensureContrast(adjustHsl(text, 0, -0.2, luminance(bg) > 0.5 ? -0.35 : 0.35), bg, 3.0)
  const gradFrom = brand0
  const gradTo   = brand2 || adjustHsl(brand0, 30, 0.1, -0.1)

  return { bg, surface, primary, accent, text, mutedText: muted, gradFrom, gradTo }
}

// ─── Safe helpers ─────────────────────────────────────────────────────────────

function safe(s: any, fallback = ''): string {
  return typeof s === 'string' && s.trim() ? s.trim() : fallback
}

function safeHex(hex: any, fallback: string): string {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) return hex.trim()
  return fallback
}

function clampFont(name: string): string {
  return SUPPORTED_FONTS.includes(name) ? name : 'Inter'
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

// ─── Node builders ────────────────────────────────────────────────────────────

function id(): string { return uuidv4() }

type TextAlign = 'left' | 'center' | 'right'

interface TextOpts {
  x: number; y: number; w: number; h: number
  text: string; font: string; size: number; weight: number
  color: string; align: TextAlign
  lineHeight?: number; letterSpacing?: number; textTransform?: string
  shadow?: boolean; shadowColor?: string; italic?: boolean
}

function txt(o: TextOpts): object {
  const w = nearestWeight(o.font, o.weight)
  return {
    id: id(), type: 'text',
    x: clamp(o.x, 0, W - 10), y: clamp(o.y, 0, H - 10),
    width: clamp(o.w, 20, W), height: clamp(o.h, 20, H),
    text: o.text,
    fontFamily: o.font, fontSize: o.size, fontWeight: w,
    fontStyle: o.italic ? 'italic' : 'normal',
    color: o.color, textAlign: o.align,
    lineHeight: o.lineHeight ?? 1.15,
    letterSpacing: o.letterSpacing ?? 0,
    textTransform: o.textTransform ?? 'none',
    ...(o.shadow ? {
      textShadow: {
        enabled: true, offsetX: 0, offsetY: 2, blur: 16,
        color: o.shadowColor ?? '#00000070',
      }
    } : {}),
  }
}

interface ImgOpts {
  x: number; y: number; w: number; h: number
  src: string; radius?: number; mask?: string
  brightness?: number; contrast?: number; saturate?: number
  grayscale?: number; sepia?: number; blur?: number
}

function img(o: ImgOpts): object {
  return {
    id: id(), type: 'image',
    x: clamp(o.x, -W, W), y: clamp(o.y, -H, H),
    width: clamp(o.w, 10, W * 2), height: clamp(o.h, 10, H * 2),
    src: o.src, aspectRatio: o.w / o.h,
    borderRadius: o.radius ?? 0, mask: o.mask ?? 'none',
    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
    filters: {
      brightness: o.brightness ?? 100, contrast: o.contrast ?? 100,
      saturate: o.saturate ?? 100, grayscale: o.grayscale ?? 0,
      blur: o.blur ?? 0, sepia: o.sepia ?? 0, hueRotate: 0, opacity: 100,
    },
  }
}

interface ShapeOpts {
  x: number; y: number; w: number; h: number
  fill: string; shape?: 'rect' | 'ellipse'; radius?: number
  stroke?: string; strokeWidth?: number
}

function shp(o: ShapeOpts): object {
  return {
    id: id(), type: 'shape',
    x: clamp(o.x, -W, W * 2), y: clamp(o.y, -H, H * 2),
    width: clamp(o.w, 1, W * 2), height: clamp(o.h, 1, H * 2),
    shape: o.shape ?? 'rect', fill: o.fill,
    stroke: o.stroke ?? '#00000000', strokeWidth: o.strokeWidth ?? 0,
    borderRadius: o.radius ?? 0,
  }
}

interface GradOpts {
  x: number; y: number; w: number; h: number
  stops: { color: string; position: number; alpha: number }[]
  angle?: number; radial?: boolean; focalX?: number; focalY?: number
  radius?: number; shape?: 'rect' | 'ellipse'
}

function grad(o: GradOpts): object {
  return {
    id: id(), type: 'gradient',
    x: clamp(o.x, -W, W * 2), y: clamp(o.y, -H, H * 2),
    width: clamp(o.w, 1, W * 2), height: clamp(o.h, 1, H * 2),
    gradientType: o.radial ? 'radial' : 'linear',
    angle: o.angle ?? 180,
    shape: o.shape ?? 'rect',
    borderRadius: o.radius ?? 0,
    focalX: o.focalX ?? 50, focalY: o.focalY ?? 50,
    stops: o.stops,
  }
}

// ─── Decoration library ───────────────────────────────────────────────────────
// Reusable elements built from existing KAND nodes.
// Each returns an array of nodes (may be empty based on intensity).

/** Soft radial glow — large semi-transparent ellipse */
function decoGlow(x: number, y: number, size: number, color: string, alpha = 18): object[] {
  return [shp({ x: x - size / 2, y: y - size / 2, w: size, h: size, shape: 'ellipse', fill: withAlpha(color, alpha) })]
}

/** Thin horizontal rule */
function decoLine(x: number, y: number, w: number, color: string, alpha = 60, h = 2, radius = 1): object[] {
  return [shp({ x, y, w, h, fill: withAlpha(color, alpha), radius })]
}

/** Stroke ring around an ellipse (uses two overlapping ellipses) */
function decoRing(cx: number, cy: number, size: number, color: string, alpha = 25, stroke = 3): object[] {
  const s = size + stroke * 2
  return [shp({ x: cx - s / 2, y: cy - s / 2, w: s, h: s, shape: 'ellipse', fill: withAlpha(color, alpha) })]
}

/** Small rounded pill label */
function decoBadge(x: number, y: number, w: number, h: number, fill: string, textColor: string, label: string, font: string): object[] {
  return [
    shp({ x, y, w, h, fill, radius: Math.round(h / 2) }),
    txt({ x, y, w, h, text: label, font, size: 18, weight: 700, color: textColor, align: 'center', letterSpacing: 2, textTransform: 'uppercase' }),
  ]
}

/** Corner geometric accent — solid triangle-like shape in corner */
function decoCornerBlock(corner: 'tl' | 'tr' | 'bl' | 'br', size: number, color: string, alpha = 30): object[] {
  const positions = { tl: { x: 0, y: 0 }, tr: { x: W - size, y: 0 }, bl: { x: 0, y: H - size }, br: { x: W - size, y: H - size } }
  const pos = positions[corner]
  return [shp({ ...pos, w: size, h: size, fill: withAlpha(color, alpha), radius: corner === 'tl' ? 0 : 0 })]
}

/** Vertical accent stripe */
function decoStripe(x: number, y: number, h: number, color: string, alpha = 80, w = 4, radius = 2): object[] {
  return [shp({ x, y, w, h, fill: withAlpha(color, alpha), radius })]
}

/** Frosted / semi-opaque card overlay */
function decoCard(x: number, y: number, w: number, h: number, fill: string, alpha = 90, radius = 24): object[] {
  return [shp({ x, y, w, h, fill: withAlpha(fill, alpha), radius })]
}

/** Gradient scrim — typically over an image for text legibility */
function decoScrim(
  y: number, h: number,
  from: string, to: string,
  fromAlpha: number, toAlpha: number,
  angle = 180,
): object[] {
  return [grad({
    x: 0, y, w: W, h,
    angle, stops: [
      { color: from, position: 0,   alpha: fromAlpha },
      { color: to,   position: 100, alpha: toAlpha   },
    ],
  })]
}

/** Dot grid pattern approximation — row of small circles */
function decoDots(x: number, y: number, cols: number, rows: number, spacing: number, size: number, color: string, alpha = 15): object[] {
  const nodes: object[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push(shp({
        x: x + c * spacing, y: y + r * spacing,
        w: size, h: size, shape: 'ellipse',
        fill: withAlpha(color, alpha),
      }))
    }
  }
  return nodes
}

/** Bottom accent bar */
function decoBottomBar(color: string, h = 6): object[] {
  return [shp({ x: 0, y: H - h, w: W, h, fill: color })]
}

/** Large number/counter label (for numbered slides) */
function decoLargeNumber(num: string, font: string, color: string, alpha = 8): object[] {
  return [txt({
    x: W - 340, y: -20, w: 380, h: 320,
    text: num, font, size: 300, weight: 900,
    color: withAlpha(color.replace('#', '').length === 6 ? color : '#000000', alpha),
    align: 'right', letterSpacing: -8, lineHeight: 1.0,
  })]
}

// ─── Composition assemblers ───────────────────────────────────────────────────

interface SlideInput {
  d:           SlideDecision
  headline:    string
  body:        string
  cta:         string
  eyebrow:     string
  slideNumber: number
  totalSlides: number
  imageUrl:    string | null
}

/** Helper: consistent eyebrow label node */
function eyebrowNode(d: SlideDecision, text: string, x: number, y: number, w: number): object {
  return txt({
    x, y, w, h: 44,
    text, font: d.body_font, size: 19, weight: 600,
    color: ensureContrast(d.palette.accent, d.palette.bg),
    align: d.text_align,
    letterSpacing: 3, textTransform: 'uppercase',
  })
}

/** Helper: consistent CTA button (pill) */
function ctaButton(d: SlideDecision, text: string, x: number, y: number, w = 280, h = 60): object[] {
  const btnColor = d.palette.accent
  const btnText  = ensureContrast(readableOn(btnColor), btnColor)
  return [
    shp({ x, y, w, h, fill: btnColor, radius: 30 }),
    txt({ x, y, w, h, text, font: d.body_font, size: 24, weight: 700, color: btnText, align: 'center' }),
  ]
}

/** Helper: carousel progress dots */
function progressDots(d: SlideDecision, slideNum: number, total: number): object[] {
  if (total <= 1) return []
  const dotW = 8, gap = 12
  const totalW = total * dotW + (total - 1) * gap
  const startX = Math.round((W - totalW) / 2)
  const dotColor = d.palette.surface === '#ffffff' || luminance(d.palette.bg) > 0.5 ? d.palette.primary : '#ffffff'
  return Array.from({ length: total }, (_, i) =>
    shp({
      x: startX + i * (dotW + gap), y: H - 40,
      w: i === slideNum ? 24 : dotW, h: dotW,
      shape: 'rect', fill: i === slideNum ? dotColor : withAlpha(dotColor, 35),
      radius: dotW / 2,
    })
  )
}

// ── 1. full_bleed_image ───────────────────────────────────────────────────────
function compFullBleedImage(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []

  if (imageUrl) {
    const filters = imageFilters(d.image_treatment)
    nodes.push(img({ x: 0, y: 0, w: W, h: H, src: imageUrl, ...filters }))
  } else {
    nodes.push(grad({
      x: 0, y: 0, w: W, h: H,
      stops: [
        { color: d.palette.gradFrom, position: 0,   alpha: 100 },
        { color: d.palette.gradTo,   position: 100, alpha: 100 },
      ],
      angle: d.gradient_angle,
    }))
  }

  // Deep scrim for readability — starts 40% down
  nodes.push(...decoScrim(Math.round(H * 0.38), Math.round(H * 0.62), '#000000', '#000000', 0, 88))

  const textColor = '#ffffff'
  const x = PAD, textW = W - PAD * 2

  if (eyebrow) {
    nodes.push(txt({ x, y: H - 440, w: textW, h: 44, text: eyebrow, font: d.body_font, size: 18, weight: 600, color: d.palette.accent, align: 'left', letterSpacing: 3, textTransform: 'uppercase' }))
  }

  nodes.push(txt({ x, y: H - 380, w: textW, h: 220, text: headline, font: d.heading_font, size: 76, weight: d.heading_weight, color: textColor, align: 'left', lineHeight: 1.05, shadow: true }))

  if (body) {
    nodes.push(txt({ x, y: H - 150, w: textW, h: 96, text: body, font: d.body_font, size: 28, weight: d.body_weight, color: withAlpha('#ffffff', 88), align: 'left', lineHeight: 1.4 }))
  }

  if (cta) {
    nodes.push(...ctaButton(d, cta, x, H - 96 - (body ? 0 : 64), 240, 52))
  }

  nodes.push(...progressDots(d, si.slideNumber, si.totalSlides))
  return nodes
}

// ── 2. image_top_text_panel ───────────────────────────────────────────────────
function compImageTopTextPanel(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []
  const imgH = 520

  if (imageUrl) {
    nodes.push(img({ x: 0, y: 0, w: W, h: imgH, src: imageUrl, ...imageFilters(d.image_treatment) }))
  } else {
    nodes.push(grad({ x: 0, y: 0, w: W, h: imgH, stops: [{ color: d.palette.primary, position: 0, alpha: 100 }, { color: d.palette.gradTo, position: 100, alpha: 100 }], angle: 135 }))
  }

  // Panel
  nodes.push(shp({ x: 0, y: imgH, w: W, h: H - imgH, fill: d.palette.bg }))

  // Overlap card — slightly overlapping image
  nodes.push(...decoCard(PAD, imgH - 32, W - PAD * 2, H - imgH - PAD + 32, d.palette.surface, 97, 20))

  const panelX = PAD * 2, panelW = W - PAD * 4

  if (eyebrow) {
    nodes.push(eyebrowNode(d, eyebrow, panelX, imgH + 28, panelW))
  }

  const hl_y = imgH + (eyebrow ? 80 : 44)
  nodes.push(txt({ x: panelX, y: hl_y, w: panelW, h: 180, text: headline, font: d.heading_font, size: 56, weight: d.heading_weight, color: ensureContrast(d.palette.text, d.palette.surface), align: d.text_align, lineHeight: 1.1 }))

  if (body) {
    nodes.push(txt({ x: panelX, y: hl_y + 192, w: panelW, h: 120, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: ensureContrast(d.palette.mutedText, d.palette.surface), align: d.text_align, lineHeight: 1.5 }))
  }

  if (cta) {
    const btnX = d.text_align === 'center' ? Math.round((W - 260) / 2) : panelX
    nodes.push(...ctaButton(d, cta, btnX, H - 92, 260, 56))
  }

  return nodes
}

// ── 3. image_right_text_left (asymmetric) ────────────────────────────────────
function compImageRightTextLeft(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []
  const imgX = Math.round(W * 0.42)
  const textW = imgX - PAD - 32

  // Background
  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  // Decorative glow behind image area
  nodes.push(...decoGlow(imgX + (W - imgX) / 2, H / 2, 600, d.palette.accent, 12))

  if (imageUrl) {
    nodes.push(img({ x: imgX, y: 0, w: W - imgX, h: H, src: imageUrl, ...imageFilters(d.image_treatment) }))
    // Fade edge from left
    nodes.push(grad({ x: imgX - 80, y: 0, w: 120, h: H, angle: 90, stops: [{ color: d.palette.bg, position: 0, alpha: 100 }, { color: d.palette.bg, position: 100, alpha: 0 }] }))
  } else {
    nodes.push(grad({ x: imgX, y: 0, w: W - imgX, h: H, stops: [{ color: d.palette.primary, position: 0, alpha: 100 }, { color: d.palette.gradTo, position: 100, alpha: 100 }], angle: 150 }))
  }

  // Left accent stripe
  nodes.push(...decoStripe(PAD - 20, 140, H - 280, d.palette.accent, 90))

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(PAD, H * 0.6, 360, d.palette.primary, 10))
  }

  if (eyebrow) nodes.push(eyebrowNode(d, eyebrow, PAD, 140, textW))

  const hl_y = eyebrow ? 200 : 160
  nodes.push(txt({ x: PAD, y: hl_y, w: textW, h: 320, text: headline, font: d.heading_font, size: 60, weight: d.heading_weight, color: ensureContrast(d.palette.text, d.palette.bg), align: 'left', lineHeight: 1.05 }))

  if (body) {
    nodes.push(txt({ x: PAD, y: hl_y + 334, w: textW, h: 160, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: ensureContrast(d.palette.mutedText, d.palette.bg), align: 'left', lineHeight: 1.5 }))
  }

  if (cta) {
    nodes.push(txt({ x: PAD, y: H - 110, w: textW, h: 48, text: `→ ${cta}`, font: d.body_font, size: 24, weight: 700, color: d.palette.accent, align: 'left' }))
  }

  nodes.push(...decoBottomBar(d.palette.accent))
  return nodes
}

// ── 4. image_left_text_right ─────────────────────────────────────────────────
function compImageLeftTextRight(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []
  const imgW = Math.round(W * 0.44)
  const textX = imgW + 48
  const textW = W - textX - PAD_SM

  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  if (imageUrl) {
    nodes.push(img({ x: 0, y: 0, w: imgW, h: H, src: imageUrl, ...imageFilters(d.image_treatment) }))
    nodes.push(grad({ x: imgW - 80, y: 0, w: 100, h: H, angle: 90, stops: [{ color: d.palette.bg, position: 0, alpha: 0 }, { color: d.palette.bg, position: 100, alpha: 100 }] }))
  } else {
    nodes.push(grad({ x: 0, y: 0, w: imgW, h: H, stops: [{ color: d.palette.primary, position: 0, alpha: 100 }, { color: d.palette.gradTo, position: 100, alpha: 100 }], angle: d.gradient_angle }))
  }

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(textX + textW / 2, H * 0.4, 400, d.palette.accent, 10))
  }

  if (eyebrow) nodes.push(eyebrowNode(d, eyebrow, textX, 130, textW))

  const hl_y = eyebrow ? 188 : 150
  nodes.push(txt({ x: textX, y: hl_y, w: textW, h: 280, text: headline, font: d.heading_font, size: 56, weight: d.heading_weight, color: ensureContrast(d.palette.text, d.palette.bg), align: 'left', lineHeight: 1.1 }))

  if (body) {
    nodes.push(txt({ x: textX, y: hl_y + 296, w: textW, h: 200, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: ensureContrast(d.palette.mutedText, d.palette.bg), align: 'left', lineHeight: 1.5 }))
  }

  if (cta) {
    nodes.push(txt({ x: textX, y: H - 110, w: textW, h: 48, text: `→ ${cta}`, font: d.body_font, size: 24, weight: 700, color: d.palette.accent, align: 'left' }))
  }

  nodes.push(...decoBottomBar(d.palette.accent))
  return nodes
}

// ── 5. magazine_split ─────────────────────────────────────────────────────────
function compMagazineSplit(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []
  const splitY = Math.round(H * 0.48)

  // Top half
  if (imageUrl) {
    nodes.push(img({ x: 0, y: 0, w: W, h: splitY + 40, src: imageUrl, ...imageFilters(d.image_treatment) }))
    nodes.push(...decoScrim(splitY - 80, 120, '#000000', '#000000', 0, 70))
  } else {
    nodes.push(grad({ x: 0, y: 0, w: W, h: splitY + 40, stops: [{ color: d.palette.gradFrom, position: 0, alpha: 100 }, { color: d.palette.primary, position: 100, alpha: 100 }], angle: 135 }))
  }

  // Bottom half
  nodes.push(shp({ x: 0, y: splitY, w: W, h: H - splitY, fill: d.palette.bg }))

  // Accent overlap strip at split
  nodes.push(shp({ x: 0, y: splitY - 4, w: W, h: 8, fill: d.palette.accent }))

  // Category badge
  if (eyebrow) {
    nodes.push(...decoBadge(PAD, splitY + 28, 200, 40, d.palette.accent, readableOn(d.palette.accent), eyebrow, d.body_font))
  }

  const hl_y = eyebrow ? splitY + 84 : splitY + 44
  nodes.push(txt({ x: PAD, y: hl_y, w: W - PAD * 2, h: 200, text: headline, font: d.heading_font, size: 62, weight: d.heading_weight, color: ensureContrast(d.palette.text, d.palette.bg), align: d.text_align, lineHeight: 1.05 }))

  if (body) {
    nodes.push(txt({ x: PAD, y: hl_y + 210, w: W - PAD * 2, h: 130, text: body, font: d.body_font, size: 27, weight: d.body_weight, color: ensureContrast(d.palette.mutedText, d.palette.bg), align: d.text_align, lineHeight: 1.5 }))
  }

  if (cta) {
    const btnX = d.text_align === 'center' ? Math.round((W - 280) / 2) : PAD
    nodes.push(...ctaButton(d, cta, btnX, H - 100, 280, 58))
  }

  return nodes
}

// ── 6. editorial_large_type ───────────────────────────────────────────────────
function compEditorialLargeType(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow } = si
  const nodes: object[] = []

  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(-120, -120, 600, d.palette.primary, 8))
    nodes.push(...decoGlow(W + 80, H + 80, 600, d.palette.accent, 6))
  }

  if (d.decoration === 'rich' || d.decoration === 'moderate') {
    nodes.push(...decoDots(W - 200, 60, 5, 6, 36, 6, d.palette.accent, 20))
  }

  // Top rule
  nodes.push(...decoLine(PAD, PAD_SM, 80, d.palette.accent, 100, 3))

  if (eyebrow) nodes.push(eyebrowNode(d, eyebrow, PAD, PAD_SM + 20, W - PAD * 2))

  const hl_y = eyebrow ? 172 : 140
  nodes.push(txt({ x: PAD, y: hl_y, w: W - PAD * 2, h: 420, text: headline, font: d.heading_font, size: 90, weight: d.heading_weight, color: ensureContrast(d.palette.text, d.palette.bg), align: d.text_align, lineHeight: 1.0, letterSpacing: -1 }))

  if (body) {
    nodes.push(txt({ x: PAD, y: hl_y + 432, w: W - PAD * 2, h: 160, text: body, font: d.body_font, size: 30, weight: d.body_weight, color: ensureContrast(d.palette.mutedText, d.palette.bg), align: d.text_align, lineHeight: 1.5 }))
  }

  if (cta) {
    const btnX = d.text_align === 'center' ? Math.round((W - 280) / 2) : PAD
    nodes.push(...ctaButton(d, cta, btnX, H - 110, 280, 56))
  }

  nodes.push(...decoBottomBar(d.palette.accent))
  return nodes
}

// ── 7. centered_card ──────────────────────────────────────────────────────────
function compCenteredCard(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []

  // Background (gradient or color)
  if (d.use_gradient_bg) {
    nodes.push(grad({ x: 0, y: 0, w: W, h: H, stops: [{ color: d.palette.gradFrom, position: 0, alpha: 100 }, { color: d.palette.gradTo, position: 100, alpha: 100 }], angle: d.gradient_angle }))
  } else {
    nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.primary }))
  }

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(W / 2, H / 2, 800, '#ffffff', 6))
  }

  // Card
  const cardPad = 72
  const cardX = cardPad, cardY = 110
  const cardW = W - cardPad * 2, cardH = H - 220
  nodes.push(...decoCard(cardX, cardY, cardW, cardH, d.palette.surface, 96, 28))

  // Small image above headline inside card
  if (imageUrl) {
    const sz = 120
    nodes.push(img({ x: Math.round((W - sz) / 2), y: cardY + 40, w: sz, h: sz, src: imageUrl, mask: 'circle', ...imageFilters(d.image_treatment) }))
  }

  const contentStartY = imageUrl ? cardY + 180 : cardY + 56
  const cardInnerX = cardX + 48, cardInnerW = cardW - 96
  const surfColor = ensureContrast(d.palette.text, d.palette.surface)
  const mutedColor = ensureContrast(d.palette.mutedText, d.palette.surface)

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, text_align: 'center', palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.surface) } }, eyebrow, cardInnerX, contentStartY, cardInnerW))
  }

  const hl_y = contentStartY + (eyebrow ? 56 : 0)
  nodes.push(txt({ x: cardInnerX, y: hl_y, w: cardInnerW, h: 200, text: headline, font: d.heading_font, size: 58, weight: d.heading_weight, color: surfColor, align: 'center', lineHeight: 1.1 }))

  if (body) {
    nodes.push(txt({ x: cardInnerX, y: hl_y + 214, w: cardInnerW, h: 140, text: body, font: d.body_font, size: 27, weight: d.body_weight, color: mutedColor, align: 'center', lineHeight: 1.5 }))
  }

  if (cta) {
    const btnX = Math.round((W - 260) / 2)
    nodes.push(...ctaButton({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.surface) } }, cta, btnX, cardY + cardH - 80, 260, 54))
  }

  return nodes
}

// ── 8. layered_depth ──────────────────────────────────────────────────────────
function compLayeredDepth(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []

  // Full-bleed blurred background
  if (imageUrl) {
    nodes.push(img({ x: -40, y: -40, w: W + 80, h: H + 80, src: imageUrl, blur: 14, brightness: d.image_treatment === 'darken' ? 50 : 70, saturate: 60 }))
  } else {
    nodes.push(grad({ x: 0, y: 0, w: W, h: H, stops: [{ color: d.palette.gradFrom, position: 0, alpha: 100 }, { color: d.palette.gradTo, position: 100, alpha: 100 }], angle: d.gradient_angle }))
  }

  // Dark overlay
  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: withAlpha('#000000', 45) }))

  // Frosted content card
  const cardY = 160, cardH = H - 320
  nodes.push(...decoCard(PAD, cardY, W - PAD * 2, cardH, d.palette.surface, 88, 24))

  // Optional small crisp image inside card
  if (imageUrl) {
    const sz = 110
    nodes.push(img({ x: Math.round((W - sz) / 2), y: cardY + 36, w: sz, h: sz, src: imageUrl, mask: 'rounded', ...imageFilters(d.image_treatment) }))
  }

  const startY = imageUrl ? cardY + 168 : cardY + 52
  const innerX = PAD + 48, innerW = W - PAD * 2 - 96
  const surfText  = ensureContrast(d.palette.text, d.palette.surface)
  const mutedText = ensureContrast(d.palette.mutedText, d.palette.surface)

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, text_align: 'center', palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.surface) } }, eyebrow, innerX, startY, innerW))
  }

  const hl_y = startY + (eyebrow ? 58 : 0)
  nodes.push(txt({ x: innerX, y: hl_y, w: innerW, h: 200, text: headline, font: d.heading_font, size: 56, weight: d.heading_weight, color: surfText, align: 'center', lineHeight: 1.1 }))

  if (body) {
    nodes.push(txt({ x: innerX, y: hl_y + 212, w: innerW, h: 130, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: mutedText, align: 'center', lineHeight: 1.5 }))
  }

  if (cta) {
    const btnX = Math.round((W - 260) / 2)
    nodes.push(...ctaButton({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.surface) } }, cta, btnX, cardY + cardH - 78, 260, 52))
  }

  nodes.push(...progressDots(d, si.slideNumber, si.totalSlides))
  return nodes
}

// ── 9. bold_number ────────────────────────────────────────────────────────────
function compBoldNumber(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow } = si
  const nodes: object[] = []

  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  // Oversized ghost number
  const num = String(si.slideNumber + 1).padStart(2, '0')
  nodes.push(...decoLargeNumber(num, d.heading_font, d.palette.primary, 7))

  // Accent blocks
  nodes.push(shp({ x: 0, y: 0, w: W, h: 10, fill: d.palette.accent }))
  nodes.push(...decoStripe(PAD - 16, 80, H - 160, d.palette.accent, 40))

  const textColor = ensureContrast(d.palette.text, d.palette.bg)
  const mutedColor = ensureContrast(d.palette.mutedText, d.palette.bg)

  if (eyebrow) {
    nodes.push(eyebrowNode(d, eyebrow, PAD, 80, W - PAD * 2))
  }

  const hl_y = eyebrow ? 148 : 120
  nodes.push(txt({ x: PAD, y: hl_y, w: W - PAD * 2, h: 360, text: headline, font: d.heading_font, size: 84, weight: d.heading_weight, color: textColor, align: 'left', lineHeight: 1.0, letterSpacing: -1 }))

  if (body) {
    nodes.push(txt({ x: PAD, y: hl_y + 374, w: W - PAD * 2, h: 180, text: body, font: d.body_font, size: 30, weight: d.body_weight, color: mutedColor, align: 'left', lineHeight: 1.5 }))
  }

  if (cta) {
    nodes.push(txt({ x: PAD, y: H - 106, w: W - PAD * 2, h: 48, text: `→ ${cta}`, font: d.body_font, size: 24, weight: 700, color: d.palette.accent, align: 'left' }))
  }

  nodes.push(shp({ x: 0, y: H - 10, w: W, h: 10, fill: d.palette.accent }))
  return nodes
}

// ── 10. quote_pull ────────────────────────────────────────────────────────────
function compQuotePull(si: SlideInput): object[] {
  const { d, headline, body, eyebrow } = si
  const nodes: object[] = []

  if (d.use_gradient_bg) {
    nodes.push(grad({ x: 0, y: 0, w: W, h: H, stops: [{ color: d.palette.gradFrom, position: 0, alpha: 100 }, { color: d.palette.gradTo, position: 100, alpha: 100 }], angle: d.gradient_angle }))
  } else {
    nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))
  }

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(W * 0.85, H * 0.15, 500, d.palette.accent, 14))
    nodes.push(...decoGlow(W * 0.15, H * 0.85, 400, d.palette.primary, 10))
  }

  const textColor = ensureContrast(d.palette.text, d.use_gradient_bg ? d.palette.gradFrom : d.palette.bg)

  // Giant quotation mark
  nodes.push(txt({ x: PAD - 12, y: 100, w: 120, h: 140, text: '\u201C', font: d.heading_font, size: 160, weight: 900, color: withAlpha(d.palette.accent.replace('#','') + 'ff', 60), align: 'left', lineHeight: 1.0 }))

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.bg) } }, eyebrow, PAD, 120, W - PAD * 2))
  }

  nodes.push(txt({ x: PAD, y: eyebrow ? 192 : 200, w: W - PAD * 2, h: 380, text: headline, font: d.heading_font, size: 66, weight: d.heading_weight, color: textColor, align: 'left', lineHeight: 1.15, italic: true }))

  if (body) {
    nodes.push(...decoLine(PAD, 600, 72, d.palette.accent, 100, 3))
    nodes.push(txt({ x: PAD, y: 622, w: W - PAD * 2, h: 140, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: ensureContrast(d.palette.mutedText, d.use_gradient_bg ? d.palette.gradFrom : d.palette.bg), align: 'left', lineHeight: 1.5 }))
  }

  return nodes
}

// ── 11. minimal_typographic ───────────────────────────────────────────────────
function compMinimalTypographic(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow } = si
  const nodes: object[] = []

  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  // Single accent element depending on decoration level
  if (d.decoration !== 'none') {
    nodes.push(...decoLine(PAD, Math.round(H * 0.44), W - PAD * 2, d.palette.accent, 20, 1))
  }
  if (d.decoration === 'moderate' || d.decoration === 'rich') {
    nodes.push(...decoCornerBlock('br', 160, d.palette.accent, 8))
  }

  const textColor = ensureContrast(d.palette.text, d.palette.bg)
  const mutedColor = ensureContrast(d.palette.mutedText, d.palette.bg)

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.bg) } }, eyebrow, PAD, 160, W - PAD * 2))
  }

  nodes.push(txt({ x: PAD, y: eyebrow ? 220 : 180, w: W - PAD * 2, h: 320, text: headline, font: d.heading_font, size: 78, weight: d.heading_weight, color: textColor, align: d.text_align, lineHeight: 1.05, letterSpacing: -0.5 }))

  if (body) {
    nodes.push(txt({ x: PAD + 20, y: 540, w: W - PAD * 2 - 40, h: 160, text: body, font: d.body_font, size: 28, weight: d.body_weight, color: mutedColor, align: d.text_align, lineHeight: 1.55 }))
  }

  if (cta) {
    const btnX = d.text_align === 'center' ? Math.round((W - 260) / 2) : PAD
    nodes.push(...ctaButton({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.bg) } }, cta, btnX, H - 120, 260, 52))
  }

  return nodes
}

// ── 12. mosaic_circle ────────────────────────────────────────────────────────
function compMosaicCircle(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []

  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(W / 2, 340, 600, d.palette.accent, 10))
  }

  const circleSize = 380
  const cx = Math.round((W - circleSize) / 2)
  const cy = 90

  // Ring behind circle
  if (d.decoration === 'moderate' || d.decoration === 'rich') {
    nodes.push(...decoRing(cx + circleSize / 2, cy + circleSize / 2, circleSize, d.palette.accent, 18, 6))
  }

  if (imageUrl) {
    nodes.push(img({ x: cx, y: cy, w: circleSize, h: circleSize, src: imageUrl, mask: 'circle', ...imageFilters(d.image_treatment) }))
  } else {
    nodes.push(shp({ x: cx, y: cy, w: circleSize, h: circleSize, shape: 'ellipse', fill: d.palette.accent }))
  }

  const textY = cy + circleSize + 52
  const textColor  = ensureContrast(d.palette.text, d.palette.bg)
  const mutedColor = ensureContrast(d.palette.mutedText, d.palette.bg)

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, text_align: 'center', palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.bg) } }, eyebrow, PAD, textY, W - PAD * 2))
  }

  nodes.push(txt({ x: PAD, y: textY + (eyebrow ? 56 : 0), w: W - PAD * 2, h: 200, text: headline, font: d.heading_font, size: 60, weight: d.heading_weight, color: textColor, align: 'center', lineHeight: 1.1 }))

  if (body) {
    nodes.push(txt({ x: PAD + 40, y: textY + (eyebrow ? 56 : 0) + 212, w: W - PAD * 2 - 80, h: 120, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: mutedColor, align: 'center', lineHeight: 1.5 }))
  }

  if (cta) {
    nodes.push(...ctaButton({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.bg) } }, cta, Math.round((W - 260) / 2), H - 96, 260, 52))
  }

  return nodes
}

// ── 13. corner_accent ────────────────────────────────────────────────────────
function compCornerAccent(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow, imageUrl } = si
  const nodes: object[] = []

  nodes.push(shp({ x: 0, y: 0, w: W, h: H, fill: d.palette.bg }))

  // Large rounded image in top-right corner
  const imgSize = 480
  if (imageUrl) {
    nodes.push(img({ x: W - imgSize + 40, y: -20, w: imgSize, h: imgSize, src: imageUrl, radius: 32, ...imageFilters(d.image_treatment) }))
    // Soft fade from left
    nodes.push(grad({ x: W - imgSize - 20, y: 0, w: 160, h: imgSize + 20, angle: 90, stops: [{ color: d.palette.bg, position: 0, alpha: 100 }, { color: d.palette.bg, position: 100, alpha: 0 }] }))
  } else {
    nodes.push(shp({ x: W - imgSize + 40, y: -20, w: imgSize, h: imgSize, fill: d.palette.accent, radius: 32 }))
  }

  if (d.decoration !== 'none') {
    nodes.push(...decoGlow(PAD, H * 0.65, 400, d.palette.primary, 10))
  }

  const textColor  = ensureContrast(d.palette.text, d.palette.bg)
  const mutedColor = ensureContrast(d.palette.mutedText, d.palette.bg)
  const textW = Math.round(W * 0.54)

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, palette: { ...d.palette, accent: ensureContrast(d.palette.accent, d.palette.bg) } }, eyebrow, PAD, 340, textW))
  }

  const hl_y = eyebrow ? 396 : 360
  nodes.push(txt({ x: PAD, y: hl_y, w: textW, h: 240, text: headline, font: d.heading_font, size: 62, weight: d.heading_weight, color: textColor, align: 'left', lineHeight: 1.1 }))

  if (body) {
    nodes.push(txt({ x: PAD, y: hl_y + 252, w: textW, h: 140, text: body, font: d.body_font, size: 26, weight: d.body_weight, color: mutedColor, align: 'left', lineHeight: 1.5 }))
  }

  if (cta) {
    nodes.push(txt({ x: PAD, y: H - 106, w: textW, h: 48, text: `→ ${cta}`, font: d.body_font, size: 24, weight: 700, color: d.palette.accent, align: 'left' }))
  }

  nodes.push(...decoBottomBar(d.palette.accent))
  return nodes
}

// ── 14. gradient_hero ────────────────────────────────────────────────────────
function compGradientHero(si: SlideInput): object[] {
  const { d, headline, body, cta, eyebrow } = si
  const nodes: object[] = []

  // Rich multi-stop gradient background
  nodes.push(grad({
    x: 0, y: 0, w: W, h: H,
    stops: [
      { color: d.palette.gradFrom, position: 0,   alpha: 100 },
      { color: d.palette.primary,  position: 50,  alpha: 100 },
      { color: d.palette.gradTo,   position: 100, alpha: 100 },
    ],
    angle: d.gradient_angle,
  }))

  // Radial glow center
  nodes.push(grad({ x: W / 2 - 400, y: H / 2 - 400, w: 800, h: 800, radial: true, focalX: 50, focalY: 50, shape: 'ellipse', stops: [{ color: '#ffffff', position: 0, alpha: 12 }, { color: '#ffffff', position: 100, alpha: 0 }] }))

  if (d.decoration === 'rich') {
    nodes.push(...decoDots(W - 160, 80, 4, 5, 32, 5, '#ffffff', 18))
    nodes.push(...decoDots(20, H - 200, 3, 4, 32, 5, '#ffffff', 12))
  }

  const textOnGrad = '#ffffff'

  if (eyebrow) {
    nodes.push(eyebrowNode({ ...d, text_align: 'center', palette: { ...d.palette, accent: d.palette.accent } }, eyebrow, PAD, 180, W - PAD * 2))
  }

  const hl_y = eyebrow ? 240 : 200
  nodes.push(txt({ x: PAD, y: hl_y, w: W - PAD * 2, h: 360, text: headline, font: d.heading_font, size: 82, weight: d.heading_weight, color: textOnGrad, align: 'center', lineHeight: 1.05, shadow: true }))

  if (body) {
    nodes.push(txt({ x: PAD + 40, y: hl_y + 372, w: W - PAD * 2 - 80, h: 160, text: body, font: d.body_font, size: 30, weight: d.body_weight, color: withAlpha('ffffff', 88), align: 'center', lineHeight: 1.5 }))
  }

  if (cta) {
    // Ghost/outline CTA on gradient
    const btnW = 280, btnH = 56
    const btnX = Math.round((W - btnW) / 2)
    nodes.push(shp({ x: btnX, y: H - 120, w: btnW, h: btnH, fill: withAlpha('ffffff', 20), radius: 28, stroke: withAlpha('ffffff', 70), strokeWidth: 2 }))
    nodes.push(txt({ x: btnX, y: H - 120, w: btnW, h: btnH, text: cta, font: d.body_font, size: 24, weight: 600, color: '#ffffff', align: 'center' }))
  }

  nodes.push(...progressDots(d, si.slideNumber, si.totalSlides))
  return nodes
}

// ─── Image filter mapper ──────────────────────────────────────────────────────

function imageFilters(treatment: ImageTreatment): Partial<ImgOpts> {
  switch (treatment) {
    case 'darken':       return { brightness: 60 }
    case 'desaturate':   return { grayscale: 70, brightness: 95 }
    case 'warm':         return { sepia: 30, brightness: 105 }
    case 'cool':         return { sepia: 0, saturate: 80, brightness: 100 }
    case 'high_contrast':return { contrast: 140, brightness: 90 }
    case 'duotone':      return { grayscale: 100, sepia: 60, brightness: 110 }
    default:             return {}
  }
}

// ─── Composition dispatcher ───────────────────────────────────────────────────

function assembleSlide(si: SlideInput): { nodes: object[]; background: string } {
  let nodes: object[]
  switch (si.d.composition) {
    case 'full_bleed_image':      nodes = compFullBleedImage(si); break
    case 'image_top_text_panel':  nodes = compImageTopTextPanel(si); break
    case 'image_right_text_left': nodes = compImageRightTextLeft(si); break
    case 'image_left_text_right': nodes = compImageLeftTextRight(si); break
    case 'magazine_split':        nodes = compMagazineSplit(si); break
    case 'editorial_large_type':  nodes = compEditorialLargeType(si); break
    case 'centered_card':         nodes = compCenteredCard(si); break
    case 'layered_depth':         nodes = compLayeredDepth(si); break
    case 'bold_number':           nodes = compBoldNumber(si); break
    case 'quote_pull':            nodes = compQuotePull(si); break
    case 'minimal_typographic':   nodes = compMinimalTypographic(si); break
    case 'mosaic_circle':         nodes = compMosaicCircle(si); break
    case 'corner_accent':         nodes = compCornerAccent(si); break
    case 'gradient_hero':         nodes = compGradientHero(si); break
    default:                      nodes = compEditorialLargeType(si)
  }
  return { nodes, background: si.d.palette.bg }
}

// ─── Copy text extraction ─────────────────────────────────────────────────────

interface SlideText { headline: string; body: string; cta: string; eyebrow: string }

function extractSlideText(copy: any, idx: number, format: string, total: number): SlideText {
  if (format === 'single') {
    return {
      headline: safe(copy.headline, safe(copy.slides?.[0]?.headline, 'Untitled')),
      body:     safe(copy.subheadline || copy.supportingText, ''),
      cta:      safe(copy.cta, ''),
      eyebrow:  '',
    }
  }
  const slide = copy.slides?.[idx]
  if (!slide) return { headline: '', body: '', cta: '', eyebrow: '' }
  const eyebrow = idx === 0 ? '' : `${String(idx).padStart(2, '0')}`
  return {
    headline: safe(slide.headline, ''),
    body:     safe(slide.body, ''),
    cta:      safe(slide.cta, ''),
    eyebrow,
  }
}

// ─── Groq art direction ───────────────────────────────────────────────────────

async function getGroqModel(groq: Groq): Promise<string> {
  try {
    const models = await groq.models.list()
    const preferred = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'groq/compound-mini']
    const found = preferred.find(p => models.data.some((m: any) => m.id === p))
    if (found) return found
    const deny = ['guard', 'embed', 'whisper', 'tts', 'orpheus', 'allam', 'safeguard', 'prompt-guard']
    const fallback = models.data.find((m: any) => !deny.some(d => m.id.toLowerCase().includes(d)))
    if (fallback) return fallback.id
  } catch { /**/ }
  return 'llama-3.3-70b-versatile'
}

const SYSTEM_PROMPT = `You are an expert Instagram art director with professional experience across editorial, premium brand, and digital content design.

You receive: brand info, post copy, and resolved visual assets.
Your job: return a JSON art direction brief that a design engine will translate into canvas nodes.

IMPORTANT RULES:
- bg_color, surface_color, primary_color, accent_color, text_color, muted_text_color, grad_from, grad_to: valid 6-char hex ONLY like "#1a2b3c"
- heading_font and body_font: choose from Inter, Roboto, Poppins, Oswald, Montserrat, Playfair Display, Bebas Neue, Dancing Script, Raleway, Lato, Open Sans
- heading_weight and body_weight: must be integers divisible by 100 (300–900)
- mood: one of editorial, premium, minimal, bold, modern, technical, luxury, organic, playful, corporate
- composition: one of full_bleed_image, image_top_text_panel, image_right_text_left, image_left_text_right, magazine_split, editorial_large_type, centered_card, layered_depth, bold_number, quote_pull, minimal_typographic, mosaic_circle, corner_accent, gradient_hero
- image_treatment: one of natural, darken, desaturate, warm, cool, high_contrast, duotone
- decoration: one of none, subtle, moderate, rich
- text_align: one of left, center, right
- gradient_angle: integer 0–360
- use_gradient_bg: true/false

COMPOSITION RULES:
- full_bleed_image, layered_depth, magazine_split, image_top_text_panel: ONLY use when has_image is true
- gradient_hero, editorial_large_type, bold_number, minimal_typographic, quote_pull, centered_card: use for typography-only or when image is optional
- mosaic_circle, corner_accent: work with or without images
- Do NOT repeat the same composition twice in a carousel
- First slide: prefer impactful compositions (full_bleed_image, magazine_split, gradient_hero, editorial_large_type)
- Last slide: prefer CTA-style (centered_card, minimal_typographic, gradient_hero)
- Use bold_number for numbered/step content

COLOR RULES:
- Use brand colors as primary/accent anchors
- Generate bg, surface, mutedText as complementary/neutral variants
- Ensure text reads on its background (WCAG AA)
- Vary palette slightly between slides for visual freshness — keep consistent mood

Return ONLY valid JSON, no markdown, no explanation.`

function buildPrompt(brand: any, copy: any, plan: ResolvedAssetPlan): string {
  const slides = plan.slots.map((s, i) => ({
    index: i, slot_id: s.slot_id,
    has_image: !!s.resolvedAsset,
    visual_purpose: s.visual_purpose,
    slide_purpose: i === 0 ? 'cover/hook' : i === plan.slots.length - 1 ? 'cta/conclusion' : 'content',
    headline: copy.slides?.[i]?.headline ?? copy.headline ?? '',
  }))

  const palette = { colors: brand.colors?.slice(0, 4) ?? [], fonts: brand.fonts?.slice(0, 2) ?? [] }

  return `Brand: ${JSON.stringify({ name: brand.name, palette }, null, 2)}
Post: ${plan.format} — "${copy.headline ?? copy.slides?.[0]?.headline ?? ''}"
Slides: ${JSON.stringify(slides, null, 2)}

Return this exact structure:
{
  "mood": "modern",
  "heading_font": "Poppins",
  "body_font": "Inter",
  "slides": [
    {
      "slot_id": "slide_1",
      "composition": "full_bleed_image",
      "bg_color": "#0f0f0f",
      "surface_color": "#1a1a1a",
      "primary_color": "#e94560",
      "accent_color": "#ff6b35",
      "text_color": "#ffffff",
      "muted_text_color": "#aaaaaa",
      "grad_from": "#0f0f0f",
      "grad_to": "#e94560",
      "heading_weight": 800,
      "body_weight": 400,
      "image_treatment": "darken",
      "decoration": "moderate",
      "text_align": "left",
      "gradient_angle": 135,
      "use_gradient_bg": false
    }
  ]
}`
}

// ─── Fallback art direction ───────────────────────────────────────────────────

function fallback(brand: any, plan: ResolvedAssetPlan): ArtDirection {
  const brandColors: string[] = brand?.colors ?? []
  const mood: Mood = 'modern'
  const basePalette = buildPalette(brandColors, mood)

  const font = SUPPORTED_FONTS.find(f =>
    (brand?.fonts ?? []).some((bf: string) => bf?.toLowerCase().includes(f.toLowerCase()))
  ) ?? 'Poppins'

  // Cycle through varied compositions for fallback
  const compositionsWithImage: Composition[] = ['full_bleed_image', 'image_top_text_panel', 'magazine_split', 'layered_depth', 'corner_accent']
  const compositionsNoImage: Composition[] = ['gradient_hero', 'editorial_large_type', 'minimal_typographic', 'bold_number', 'centered_card', 'quote_pull']
  const usedComps = new Set<Composition>()

  const slides: SlideDecision[] = plan.slots.map((slot, idx) => {
    const hasImage = !!slot.resolvedAsset
    const pool = hasImage ? compositionsWithImage : compositionsNoImage
    // Pick next unused composition from pool
    let comp = pool.find(c => !usedComps.has(c)) ?? pool[idx % pool.length]
    usedComps.add(comp)

    // Vary palette slightly per slide
    const slightlyVaried: SlidePalette = {
      ...basePalette,
      accent: adjustHsl(basePalette.accent, idx * 15, 0, idx % 2 === 0 ? 0 : 0.04),
    }

    return {
      slot_id:         slot.slot_id,
      composition:     comp,
      palette:         slightlyVaried,
      heading_font:    font,
      body_font:       'Inter',
      heading_weight:  800,
      body_weight:     400,
      image_treatment: hasImage ? (idx === 0 ? 'darken' : 'natural') : 'natural',
      decoration:      idx === 0 ? 'moderate' : 'subtle',
      text_align:      'left',
      gradient_angle:  135,
      use_gradient_bg: !hasImage && (idx % 3 === 2),
    }
  })

  return { mood, slides, heading_font: font, body_font: 'Inter' }
}

// ─── Parse Groq art direction ─────────────────────────────────────────────────

function parseArtDirection(raw: string, plan: ResolvedAssetPlan, brand: any): ArtDirection {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed  = JSON.parse(cleaned)

    const mood: Mood = (['editorial','premium','minimal','bold','modern','technical','luxury','organic','playful','corporate'].includes(parsed.mood) ? parsed.mood : 'modern') as Mood

    const globalFont = clampFont(parsed.heading_font ?? 'Poppins')
    const globalBody = clampFont(parsed.body_font    ?? 'Inter')
    const brandColors: string[] = brand?.colors ?? []

    const allowedComps = new Set<string>([
      'full_bleed_image','image_top_text_panel','image_right_text_left','image_left_text_right',
      'magazine_split','editorial_large_type','centered_card','layered_depth','bold_number',
      'quote_pull','minimal_typographic','mosaic_circle','corner_accent','gradient_hero',
    ])
    const imageComps = new Set(['full_bleed_image','image_top_text_panel','image_right_text_left','image_left_text_right','magazine_split','layered_depth'])
    const allowedTreatments = new Set(['natural','darken','desaturate','warm','cool','high_contrast','duotone'])
    const allowedDecos = new Set(['none','subtle','moderate','rich'])

    const usedComps = new Set<string>()

    const slides: SlideDecision[] = plan.slots.map((slot, idx) => {
      const ai = (parsed.slides ?? [])[idx] ?? {}
      const hasImage = !!slot.resolvedAsset

      // Validate composition
      let comp = ai.composition as Composition
      if (!allowedComps.has(comp)) comp = hasImage ? 'full_bleed_image' : 'editorial_large_type'
      if (!hasImage && imageComps.has(comp)) comp = 'editorial_large_type'
      // Avoid repeats
      if (usedComps.has(comp)) {
        const altPool = hasImage
          ? ['corner_accent','mosaic_circle','image_left_text_right','image_top_text_panel']
          : ['minimal_typographic','bold_number','quote_pull','gradient_hero','centered_card']
        comp = (altPool.find(c => !usedComps.has(c)) ?? altPool[0]) as Composition
      }
      usedComps.add(comp)

      // Build palette from AI output, falling back to computed palette
      const basePalette = buildPalette(brandColors, mood)
      const palette: SlidePalette = {
        bg:        safeHex(ai.bg_color,          basePalette.bg),
        surface:   safeHex(ai.surface_color,     basePalette.surface),
        primary:   safeHex(ai.primary_color,     basePalette.primary),
        accent:    safeHex(ai.accent_color,      basePalette.accent),
        text:      safeHex(ai.text_color,        basePalette.text),
        mutedText: safeHex(ai.muted_text_color,  basePalette.mutedText),
        gradFrom:  safeHex(ai.grad_from,         basePalette.gradFrom),
        gradTo:    safeHex(ai.grad_to,           basePalette.gradTo),
      }

      // Force contrast for text
      palette.text      = ensureContrast(palette.text,      palette.bg)
      palette.mutedText = ensureContrast(palette.mutedText,  palette.bg, 3.0)

      const hFont = clampFont(ai.heading_font ?? globalFont)
      const bFont = clampFont(ai.body_font    ?? globalBody)
      const hW = Math.round((ai.heading_weight ?? 800) / 100) * 100
      const bW = Math.round((ai.body_weight    ?? 400) / 100) * 100

      return {
        slot_id:         slot.slot_id,
        composition:     comp,
        palette,
        heading_font:    hFont,
        body_font:       bFont,
        heading_weight:  nearestWeight(hFont, Math.max(300, Math.min(900, hW))),
        body_weight:     nearestWeight(bFont, Math.max(300, Math.min(900, bW))),
        image_treatment: (allowedTreatments.has(ai.image_treatment) ? ai.image_treatment : 'natural') as ImageTreatment,
        decoration:      (allowedDecos.has(ai.decoration) ? ai.decoration : 'subtle') as DecorationIntensity,
        text_align:      (['left','center','right'].includes(ai.text_align) ? ai.text_align : 'left') as 'left'|'center'|'right',
        gradient_angle:  typeof ai.gradient_angle === 'number' ? Math.round(ai.gradient_angle) % 360 : 135,
        use_gradient_bg: !!ai.use_gradient_bg,
      }
    })

    return { mood, slides, heading_font: globalFont, body_font: globalBody }
  } catch (err) {
    console.warn('[canvas-designer] parse failed, using fallback:', (err as Error).message)
    return fallback(brand, plan)
  }
}

// ─── Canvas builders ──────────────────────────────────────────────────────────

function buildSingleCanvas(copy: any, plan: ResolvedAssetPlan, dir: ArtDirection, name: string): object {
  const slot = plan.slots[0]
  const d    = dir.slides[0]
  const txt_ = extractSlideText(copy, 0, 'single', 1)
  const { nodes, background } = assembleSlide({
    d, headline: txt_.headline, body: txt_.body, cta: txt_.cta, eyebrow: txt_.eyebrow,
    imageUrl: slot?.resolvedAsset?.url ?? null, slideNumber: 0, totalSlides: 1,
  })
  return {
    id: uuidv4(), name, type: 'single', width: W, height: H,
    background, nodes, groups: [], classes: {},
    createdAt: new Date(), updatedAt: new Date(),
  }
}

function buildCarouselCanvas(copy: any, plan: ResolvedAssetPlan, dir: ArtDirection, name: string): object {
  const slots = plan.slots
  const total = slots.length

  const pages = slots.map((slot, idx) => {
    const d    = dir.slides[idx] ?? dir.slides[0]
    const txt_ = extractSlideText(copy, idx, 'carousel', total)

    const pageType = idx === 0 ? 'top_peer' : idx === total - 1 ? 'bottom_peer' : 'content'
    const { nodes, background } = assembleSlide({
      d, headline: txt_.headline, body: txt_.body, cta: txt_.cta, eyebrow: txt_.eyebrow,
      imageUrl: slot.resolvedAsset?.url ?? null, slideNumber: idx, totalSlides: total,
    })
    return {
      id: uuidv4(), type: pageType,
      name: pageType === 'top_peer' ? 'Cover' : pageType === 'bottom_peer' ? 'CTA' : `Slide ${idx}`,
      order: idx, nodes, groups: [], classes: {}, background,
    }
  })

  return {
    id: uuidv4(), name, type: 'carousel', width: W, height: H,
    background: pages[0]?.background ?? '#ffffff',
    nodes: [], groups: [], classes: {}, pages,
    createdAt: new Date(), updatedAt: new Date(),
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

export async function handleDesignCanvas(db: any, body: any) {
  try {
    const { brandContext, copy, resolvedPlan, canvasName } = body as {
      brandContext: any; copy: any; resolvedPlan: ResolvedAssetPlan; canvasName?: string
    }

    if (!copy)         return corsify(NextResponse.json({ error: 'copy is required' },         { status: 400 }))
    if (!resolvedPlan) return corsify(NextResponse.json({ error: 'resolvedPlan is required' }, { status: 400 }))

    const format  = resolvedPlan.format ?? copy.format ?? 'single'
    const name    = safe(canvasName, `${brandContext?.name ?? 'Post'} — ${copy.headline ?? copy.slides?.[0]?.headline ?? ''}`.slice(0, 80))

    // ── Art direction from Groq ────────────────────────────────────────────
    let direction: ArtDirection = fallback(brandContext, resolvedPlan)

    const apiKey = process.env.GROQ_API_KEY
    if (apiKey && resolvedPlan.slots.length > 0) {
      try {
        const groq  = new Groq({ apiKey })
        const model = await getGroqModel(groq)

        let raw: string | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await groq.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: buildPrompt(brandContext ?? {}, copy, resolvedPlan) },
              ],
              max_tokens: 2400,
              temperature: 0.5,
            })
            raw = res.choices[0]?.message?.content?.trim() ?? null
            break
          } catch (err: any) {
            const is429 = err?.status === 429 || err?.message?.includes('rate_limit')
            if (is429 && attempt < 2) { await new Promise(r => setTimeout(r, 12000)); continue }
            throw err
          }
        }

        if (raw) direction = parseArtDirection(raw, resolvedPlan, brandContext)
      } catch (err: any) {
        console.warn('[canvas-designer] Groq failed, using fallback:', err?.message)
      }
    }

    // ── Build canvas ───────────────────────────────────────────────────────
    const canvas = format === 'carousel'
      ? buildCarouselCanvas(copy, resolvedPlan, direction, name)
      : buildSingleCanvas(copy, resolvedPlan, direction, name)

    // ── Persist ────────────────────────────────────────────────────────────
    const saved = { ...canvas }
    await db.collection('canvases').insertOne(saved)
    const { _id, ...result } = saved as any
    return corsify(NextResponse.json(result))
  } catch (error: any) {
    console.error('[canvas-designer] error:', error)
    return corsify(NextResponse.json({ error: error.message || 'Canvas design failed' }, { status: 500 }))
  }
}
