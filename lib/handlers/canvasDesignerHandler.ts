/**
 * Canvas Designer
 *
 * Receives:
 *   - brandContext  – brand name, about, colors, fonts, language
 *   - copy          – CopywriterOutput (headline/slides/caption/etc.)
 *   - resolvedPlan  – ResolvedAssetPlan (one resolved asset per slot)
 *   - format        – "single" | "carousel"
 *
 * Outputs a complete KAND Canvas document ready for the renderer.
 *
 * Design strategy:
 *   1. Ask Groq to make high-level layout decisions (layout variant per slide,
 *      typography choices, color role assignments). Groq never emits coordinates.
 *   2. TypeScript assembles the final canvas JSON from those decisions using
 *      well-tested layout templates, guaranteeing a valid schema every time.
 *
 * Pipeline: Content Planner → Copywriter → Asset Planner → Asset Resolver
 *           → Canvas Designer → Canvas JSON → Renderer
 */

import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import Groq from 'groq-sdk'
import { corsify } from '@/lib/services/middleware'
import type { ResolvedAssetPlan, ResolvedSlot } from './assetResolverHandler'

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const W = 1080
const H = 1080

// ─── Supported fonts (must match lib/fonts.js FONT_CONFIG) ───────────────────

const SUPPORTED_FONTS = [
  'Inter', 'Roboto', 'Poppins', 'Oswald', 'Montserrat',
  'Playfair Display', 'Bebas Neue', 'Raleway', 'Lato', 'Open Sans',
]

// ─── Layout variants per slide ────────────────────────────────────────────────
// Each variant is a named template that places elements differently.
// The assembler picks a variant based on whether the slide has an image.

type LayoutVariant =
  | 'full_image_overlay'   // image fills canvas, text overlaid with dark gradient
  | 'image_top_text_bottom' // image top half, text bottom half
  | 'image_left_text_right' // image left 45%, text right 55%
  | 'text_center_no_image'  // typography only, centered, coloured background
  | 'image_circle_text'     // circular image + text beside it
  | 'bold_statement'        // large headline, minimal, colour block background
  | 'split_color'           // left colour block + right content area

// ─── Groq helpers ─────────────────────────────────────────────────────────────

async function getGroqModel(groq: Groq): Promise<string> {
  try {
    const models = await groq.models.list()
    const preferred = [
      'llama-3.3-70b-versatile',
      'llama3-70b-8192',
      'mixtral-8x7b-32768',
      'groq/compound-mini',
    ]
    const found = preferred.find(p => models.data.some((m: any) => m.id === p))
    if (found) return found
    const deny = ['guard', 'embed', 'whisper', 'tts', 'orpheus', 'allam', 'safeguard', 'prompt-guard']
    const fallback = models.data.find((m: any) => !deny.some(d => m.id.toLowerCase().includes(d)))
    if (fallback) return fallback.id
  } catch { /* ignore */ }
  return 'llama-3.3-70b-versatile'
}

// ─── Design decision types ────────────────────────────────────────────────────

interface SlideDecision {
  slot_id:        string
  layout:         LayoutVariant
  bg_color:       string   // hex
  accent_color:   string   // hex
  text_color:     string   // hex
  heading_font:   string
  body_font:      string
  image_filter:   'none' | 'darken' | 'desaturate' | 'warm'
}

interface DesignDecisions {
  slides:         SlideDecision[]
  palette:        { primary: string; secondary: string; text: string; background: string }
  heading_font:   string
  body_font:      string
}

// ─── Ask Groq for design decisions ───────────────────────────────────────────

const DESIGNER_SYSTEM = `You are an expert Instagram graphic designer.
You receive brand information, post copy, and resolved visual assets.
Your job is to return ONLY a JSON object with layout and color decisions for each slide.

RULES:
- Use the brand's own colors whenever possible.
- If no brand colors are provided, choose a clean professional palette.
- Choose layouts that suit the content — do not use the same layout for every slide.
- heading_font and body_font must be one of: Inter, Roboto, Poppins, Oswald, Montserrat, Playfair Display, Bebas Neue, Raleway, Lato, Open Sans.
- If brand fonts match one of the above, use them. Otherwise pick the closest match.
- layout options: full_image_overlay, image_top_text_bottom, image_left_text_right, text_center_no_image, image_circle_text, bold_statement, split_color.
- Use full_image_overlay or image_top_text_bottom when a strong photo is available.
- Use text_center_no_image or bold_statement for typography-only slides.
- Use split_color for CTA or summary slides.
- image_filter: "darken" adds a dark overlay on the image to keep text readable, "desaturate" mutes the image, "warm" adds a warm tone, "none" keeps it clean.
- bg_color, accent_color, text_color must be valid 6-char hex codes like "#1a1a2e".
- Return ONLY valid JSON, no markdown, no explanation.`

function buildDesignerPrompt(
  brand: any,
  copy: any,
  resolvedPlan: ResolvedAssetPlan,
): string {
  const slides = resolvedPlan.slots.map(slot => ({
    slot_id:       slot.slot_id,
    has_image:     !!slot.resolvedAsset,
    needs_visual:  slot.needs_visual,
    visual_purpose: slot.visual_purpose,
  }))

  return `Brand:
${JSON.stringify({ name: brand.name, colors: brand.colors, fonts: brand.fonts }, null, 2)}

Post format: ${resolvedPlan.format}
Post topic: ${copy.headline || copy.slides?.[0]?.headline || ''}

Slides:
${JSON.stringify(slides, null, 2)}

Return this exact JSON structure — one entry per slide:
{
  "palette": { "primary": "#hex", "secondary": "#hex", "text": "#hex", "background": "#hex" },
  "heading_font": "FontName",
  "body_font": "FontName",
  "slides": [
    {
      "slot_id": "slide_1",
      "layout": "full_image_overlay",
      "bg_color": "#hex",
      "accent_color": "#hex",
      "text_color": "#hex",
      "heading_font": "FontName",
      "body_font": "FontName",
      "image_filter": "none"
    }
  ]
}`
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function readableTextColor(bg: string): string {
  return luminance(bg) > 0.35 ? '#111111' : '#ffffff'
}

function hexWithAlpha(hex: string, alpha: number): string {
  // alpha 0-100 → 00-FF
  const a = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0')
  return hex.replace('#', '') + a
}

// ─── Safe string helpers ──────────────────────────────────────────────────────

function safe(s: any, fallback = ''): string {
  return typeof s === 'string' && s.trim() ? s.trim() : fallback
}

function clampFont(name: string): string {
  return SUPPORTED_FONTS.includes(name) ? name : 'Inter'
}

function safeHex(hex: any, fallback: string): string {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  return fallback
}

// ─── Node builders ────────────────────────────────────────────────────────────

function makeId(): string { return uuidv4() }

function textNode(opts: {
  x: number; y: number; w: number; h: number
  text: string; font: string; size: number; weight: number
  color: string; align: 'left' | 'center' | 'right'
  lineHeight?: number; letterSpacing?: number; textTransform?: string
  shadow?: boolean; dynamicKey?: string
}) {
  return {
    id: makeId(), type: 'text',
    x: opts.x, y: opts.y, width: opts.w, height: opts.h,
    text: opts.text,
    fontFamily: opts.font,
    fontSize: opts.size,
    fontWeight: opts.weight,
    fontStyle: 'normal',
    color: opts.color,
    textAlign: opts.align,
    lineHeight: opts.lineHeight ?? 1.15,
    letterSpacing: opts.letterSpacing ?? 0,
    textTransform: opts.textTransform ?? 'none',
    ...(opts.shadow ? {
      textShadow: { enabled: true, offsetX: 0, offsetY: 2, blur: 12, color: '#00000060' }
    } : {}),
    ...(opts.dynamicKey ? { dynamic_key: opts.dynamicKey } : {}),
  }
}

function imageNode(opts: {
  x: number; y: number; w: number; h: number
  src: string; radius?: number; mask?: string
  brightness?: number; grayscale?: number; dynamicKey?: string
}) {
  return {
    id: makeId(), type: 'image',
    x: opts.x, y: opts.y, width: opts.w, height: opts.h,
    src: opts.src,
    aspectRatio: opts.w / opts.h,
    borderRadius: opts.radius ?? 0,
    mask: opts.mask ?? 'none',
    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
    filters: {
      brightness: opts.brightness ?? 100,
      contrast: 100, saturate: 100, grayscale: opts.grayscale ?? 0,
      blur: 0, sepia: 0, hueRotate: 0, opacity: 100,
    },
    ...(opts.dynamicKey ? { dynamic_key: opts.dynamicKey } : {}),
  }
}

function shapeNode(opts: {
  x: number; y: number; w: number; h: number
  fill: string; shape?: 'rect' | 'ellipse'; radius?: number; alpha?: number
}) {
  const fillColor = opts.alpha !== undefined
    ? `#${hexWithAlpha(opts.fill, opts.alpha)}`
    : opts.fill
  return {
    id: makeId(), type: 'shape',
    x: opts.x, y: opts.y, width: opts.w, height: opts.h,
    shape: opts.shape ?? 'rect',
    fill: fillColor,
    stroke: '#00000000', strokeWidth: 0,
    borderRadius: opts.radius ?? 0,
  }
}

function gradientNode(opts: {
  x: number; y: number; w: number; h: number
  from: string; to: string; angle?: number; fromAlpha?: number; toAlpha?: number
  radius?: number
}) {
  return {
    id: makeId(), type: 'gradient',
    x: opts.x, y: opts.y, width: opts.w, height: opts.h,
    gradientType: 'linear',
    angle: opts.angle ?? 180,
    shape: 'rect',
    borderRadius: opts.radius ?? 0,
    stops: [
      { color: opts.from, position: 0,   alpha: opts.fromAlpha ?? 100 },
      { color: opts.to,   position: 100, alpha: opts.toAlpha ?? 100 },
    ],
  }
}

// ─── Layout assemblers ────────────────────────────────────────────────────────
// Each function returns { nodes, groups } for one slide/canvas.

interface LayoutInput {
  decision:    SlideDecision
  headline:    string
  body:        string
  cta:         string
  eyebrow:     string   // small label above headline (slide number, pillar, etc.)
  imageUrl:    string | null
  slideNumber: number
  totalSlides: number
}

function padded(x: number) { return Math.round(x) }

// Shared: bottom accent bar
function accentBar(color: string): object {
  return shapeNode({ x: 0, y: H - 8, w: W, h: 8, fill: color })
}

// ── full_image_overlay ────────────────────────────────────────────────────────
function layoutFullImageOverlay(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, cta, imageUrl } = inp
  const textColor = d.text_color || '#ffffff'
  const nodes: object[] = []

  // Background colour (shown if image fails)
  // Image fills entire canvas
  if (imageUrl) {
    nodes.push(imageNode({ x: 0, y: 0, w: W, h: H, src: imageUrl,
      brightness: d.image_filter === 'darken' ? 60 : d.image_filter === 'desaturate' ? 90 : 100,
      grayscale:  d.image_filter === 'desaturate' ? 60 : 0,
    }))
  }

  // Dark gradient from bottom
  nodes.push(gradientNode({
    x: 0, y: Math.round(H * 0.35), w: W, h: Math.round(H * 0.65),
    from: '#00000000', to: '#000000', fromAlpha: 0, toAlpha: 90, angle: 180,
  }))

  // Optional eyebrow
  if (inp.eyebrow) {
    nodes.push(textNode({
      x: 64, y: H - 400, w: W - 128, h: 48,
      text: inp.eyebrow, font: d.body_font, size: 22, weight: 600,
      color: d.accent_color, align: 'left', letterSpacing: 2, textTransform: 'uppercase',
    }))
  }

  // Headline
  nodes.push(textNode({
    x: 64, y: H - 340, w: W - 128, h: 200,
    text: headline, font: d.heading_font, size: 72, weight: 800,
    color: textColor, align: 'left', lineHeight: 1.05, shadow: true,
  }))

  // Body
  if (body) {
    nodes.push(textNode({
      x: 64, y: H - 130, w: W - 128, h: 90,
      text: body, font: d.body_font, size: 30, weight: 400,
      color: `#${hexWithAlpha(textColor.replace('#', ''), 85)}`, align: 'left', lineHeight: 1.4,
    }))
  }

  // CTA chip
  if (cta) {
    nodes.push(shapeNode({ x: 64, y: H - 96, w: 260, h: 56, fill: d.accent_color, radius: 28 }))
    nodes.push(textNode({
      x: 64, y: H - 96, w: 260, h: 56,
      text: cta, font: d.body_font, size: 24, weight: 700,
      color: readableTextColor(d.accent_color), align: 'center',
    }))
  }

  // Slide indicator dots for carousels
  if (inp.totalSlides > 1) {
    const dotW = 8
    const gap = 12
    const totalW = inp.totalSlides * dotW + (inp.totalSlides - 1) * gap
    const startX = Math.round((W - totalW) / 2)
    for (let i = 0; i < inp.totalSlides; i++) {
      nodes.push(shapeNode({
        x: startX + i * (dotW + gap), y: H - 32, w: dotW, h: dotW,
        fill: i === inp.slideNumber ? '#ffffff' : '#ffffff44',
        shape: 'ellipse',
      }))
    }
  }

  return { nodes, background: d.bg_color }
}

// ── image_top_text_bottom ─────────────────────────────────────────────────────
function layoutImageTopTextBottom(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, cta, imageUrl } = inp
  const textColor = safeHex(d.text_color, readableTextColor(d.bg_color))
  const nodes: object[] = []

  const imgH = Math.round(H * 0.52)
  const textY = imgH + 40

  if (imageUrl) {
    nodes.push(imageNode({ x: 0, y: 0, w: W, h: imgH, src: imageUrl }))
  } else {
    nodes.push(shapeNode({ x: 0, y: 0, w: W, h: imgH, fill: d.accent_color, radius: 0 }))
  }

  // Thin separator line
  nodes.push(shapeNode({ x: 64, y: imgH + 20, w: 80, h: 4, fill: d.accent_color }))

  // Eyebrow
  if (inp.eyebrow) {
    nodes.push(textNode({
      x: 64, y: imgH + 16, w: W - 128, h: 40,
      text: inp.eyebrow, font: d.body_font, size: 20, weight: 700,
      color: d.accent_color, align: 'left', letterSpacing: 2, textTransform: 'uppercase',
    }))
  }

  // Headline
  nodes.push(textNode({
    x: 64, y: textY + 20, w: W - 128, h: 180,
    text: headline, font: d.heading_font, size: 60, weight: 800,
    color: textColor, align: 'left', lineHeight: 1.1,
  }))

  // Body
  if (body) {
    nodes.push(textNode({
      x: 64, y: textY + 210, w: W - 128, h: 120,
      text: body, font: d.body_font, size: 28, weight: 400,
      color: textColor, align: 'left', lineHeight: 1.45,
    }))
  }

  nodes.push(accentBar(d.accent_color))
  return { nodes, background: d.bg_color }
}

// ── image_left_text_right ─────────────────────────────────────────────────────
function layoutImageLeftTextRight(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, cta, imageUrl } = inp
  const textColor = safeHex(d.text_color, readableTextColor(d.bg_color))
  const nodes: object[] = []
  const imgW = Math.round(W * 0.45)
  const textX = imgW + 48
  const textW = W - textX - 56

  if (imageUrl) {
    nodes.push(imageNode({ x: 0, y: 0, w: imgW, h: H, src: imageUrl }))
  } else {
    nodes.push(shapeNode({ x: 0, y: 0, w: imgW, h: H, fill: d.accent_color }))
  }

  // Right panel background
  nodes.push(shapeNode({ x: imgW, y: 0, w: W - imgW, h: H, fill: d.bg_color }))

  // Vertical accent line
  nodes.push(shapeNode({ x: imgW, y: 120, w: 4, h: H - 240, fill: d.accent_color }))

  if (inp.eyebrow) {
    nodes.push(textNode({
      x: textX, y: 120, w: textW, h: 44,
      text: inp.eyebrow, font: d.body_font, size: 18, weight: 700,
      color: d.accent_color, align: 'left', letterSpacing: 2, textTransform: 'uppercase',
    }))
  }

  nodes.push(textNode({
    x: textX, y: 200, w: textW, h: 300,
    text: headline, font: d.heading_font, size: 58, weight: 800,
    color: textColor, align: 'left', lineHeight: 1.1,
  }))

  if (body) {
    nodes.push(textNode({
      x: textX, y: 520, w: textW, h: 200,
      text: body, font: d.body_font, size: 27, weight: 400,
      color: textColor, align: 'left', lineHeight: 1.5,
    }))
  }

  if (cta) {
    nodes.push(textNode({
      x: textX, y: 760, w: textW, h: 48,
      text: `→ ${cta}`, font: d.body_font, size: 24, weight: 700,
      color: d.accent_color, align: 'left',
    }))
  }

  nodes.push(accentBar(d.accent_color))
  return { nodes, background: d.bg_color }
}

// ── text_center_no_image ──────────────────────────────────────────────────────
function layoutTextCenterNoImage(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, cta } = inp
  const textColor = safeHex(d.text_color, readableTextColor(d.bg_color))
  const nodes: object[] = []

  // Subtle background shape for depth
  nodes.push(shapeNode({
    x: -60, y: -60, w: 480, h: 480,
    fill: d.accent_color, shape: 'ellipse', alpha: 8,
  }))
  nodes.push(shapeNode({
    x: W - 300, y: H - 360, w: 420, h: 420,
    fill: d.accent_color, shape: 'ellipse', alpha: 6,
  }))

  // Top accent rule
  nodes.push(shapeNode({ x: Math.round((W - 80) / 2), y: 120, w: 80, h: 6, fill: d.accent_color, radius: 3 }))

  if (inp.eyebrow) {
    nodes.push(textNode({
      x: 80, y: 160, w: W - 160, h: 48,
      text: inp.eyebrow, font: d.body_font, size: 20, weight: 700,
      color: d.accent_color, align: 'center', letterSpacing: 3, textTransform: 'uppercase',
    }))
  }

  nodes.push(textNode({
    x: 80, y: 230, w: W - 160, h: 340,
    text: headline, font: d.heading_font, size: 74, weight: 800,
    color: textColor, align: 'center', lineHeight: 1.05,
  }))

  if (body) {
    nodes.push(textNode({
      x: 120, y: 590, w: W - 240, h: 200,
      text: body, font: d.body_font, size: 32, weight: 400,
      color: textColor, align: 'center', lineHeight: 1.5,
    }))
  }

  if (cta) {
    nodes.push(shapeNode({ x: Math.round((W - 280) / 2), y: 840, w: 280, h: 60, fill: d.accent_color, radius: 30 }))
    nodes.push(textNode({
      x: Math.round((W - 280) / 2), y: 840, w: 280, h: 60,
      text: cta, font: d.body_font, size: 26, weight: 700,
      color: readableTextColor(d.accent_color), align: 'center',
    }))
  }

  nodes.push(accentBar(d.accent_color))
  return { nodes, background: d.bg_color }
}

// ── image_circle_text ─────────────────────────────────────────────────────────
function layoutImageCircleText(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, imageUrl } = inp
  const textColor = safeHex(d.text_color, readableTextColor(d.bg_color))
  const nodes: object[] = []
  const circleSize = 320

  // Decorative background shapes
  nodes.push(shapeNode({ x: -80, y: H - 280, w: 400, h: 400, fill: d.accent_color, shape: 'ellipse', alpha: 10 }))

  // Circle image
  const imgX = Math.round((W - circleSize) / 2)
  const imgY = 120
  if (imageUrl) {
    nodes.push(imageNode({ x: imgX, y: imgY, w: circleSize, h: circleSize, src: imageUrl, mask: 'circle' }))
  } else {
    nodes.push(shapeNode({ x: imgX, y: imgY, w: circleSize, h: circleSize, fill: d.accent_color, shape: 'ellipse' }))
  }

  // Accent ring around circle
  nodes.push(shapeNode({
    x: imgX - 8, y: imgY - 8, w: circleSize + 16, h: circleSize + 16,
    shape: 'ellipse', fill: '#00000000', alpha: 0,
  }))

  nodes.push(textNode({
    x: 80, y: imgY + circleSize + 56, w: W - 160, h: 260,
    text: headline, font: d.heading_font, size: 64, weight: 800,
    color: textColor, align: 'center', lineHeight: 1.1,
  }))

  if (body) {
    nodes.push(textNode({
      x: 80, y: imgY + circleSize + 330, w: W - 160, h: 160,
      text: body, font: d.body_font, size: 28, weight: 400,
      color: textColor, align: 'center', lineHeight: 1.5,
    }))
  }

  nodes.push(accentBar(d.accent_color))
  return { nodes, background: d.bg_color }
}

// ── bold_statement ────────────────────────────────────────────────────────────
function layoutBoldStatement(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, cta } = inp
  const textColor = safeHex(d.text_color, readableTextColor(d.bg_color))
  const nodes: object[] = []

  // Bold accent blocks
  nodes.push(shapeNode({ x: 0, y: 0, w: W, h: 12, fill: d.accent_color }))
  nodes.push(shapeNode({ x: 0, y: H - 12, w: W, h: 12, fill: d.accent_color }))

  // Large eyebrow number / label
  if (inp.eyebrow) {
    nodes.push(textNode({
      x: 60, y: 80, w: W - 120, h: 80,
      text: inp.eyebrow, font: d.heading_font, size: 28, weight: 900,
      color: d.accent_color, align: 'left', letterSpacing: 4, textTransform: 'uppercase',
    }))
  }

  // Giant headline
  const headlineY = inp.eyebrow ? 200 : 140
  nodes.push(textNode({
    x: 60, y: headlineY, w: W - 120, h: 440,
    text: headline, font: d.heading_font, size: 96, weight: 900,
    color: textColor, align: 'left', lineHeight: 1.0, letterSpacing: -1,
  }))

  if (body) {
    nodes.push(shapeNode({ x: 60, y: headlineY + 460, w: 60, h: 4, fill: d.accent_color }))
    nodes.push(textNode({
      x: 60, y: headlineY + 484, w: W - 120, h: 180,
      text: body, font: d.body_font, size: 30, weight: 400,
      color: textColor, align: 'left', lineHeight: 1.5,
    }))
  }

  if (cta) {
    nodes.push(textNode({
      x: 60, y: H - 120, w: W - 120, h: 60,
      text: `→ ${cta}`, font: d.body_font, size: 26, weight: 700,
      color: d.accent_color, align: 'left',
    }))
  }

  return { nodes, background: d.bg_color }
}

// ── split_color ───────────────────────────────────────────────────────────────
function layoutSplitColor(inp: LayoutInput): { nodes: object[], background: string } {
  const { decision: d, headline, body, cta, imageUrl } = inp
  const nodes: object[] = []
  const splitY = Math.round(H * 0.46)

  // Top: accent colour block
  nodes.push(shapeNode({ x: 0, y: 0, w: W, h: splitY, fill: d.accent_color }))
  // Bottom: background colour
  nodes.push(shapeNode({ x: 0, y: splitY, w: W, h: H - splitY, fill: d.bg_color }))

  // Image as circle at the split line
  if (imageUrl) {
    const sz = 180
    nodes.push(imageNode({
      x: Math.round((W - sz) / 2), y: splitY - Math.round(sz / 2),
      w: sz, h: sz, src: imageUrl, mask: 'circle',
    }))
  }

  const topTextColor = readableTextColor(d.accent_color)
  const botTextColor = readableTextColor(d.bg_color)

  if (inp.eyebrow) {
    nodes.push(textNode({
      x: 80, y: 60, w: W - 160, h: 48,
      text: inp.eyebrow, font: d.body_font, size: 20, weight: 700,
      color: `#${hexWithAlpha(topTextColor.replace('#', ''), 70)}`, align: 'center',
      letterSpacing: 3, textTransform: 'uppercase',
    }))
  }

  nodes.push(textNode({
    x: 80, y: 120, w: W - 160, h: 280,
    text: headline, font: d.heading_font, size: 70, weight: 800,
    color: topTextColor, align: 'center', lineHeight: 1.05,
  }))

  if (body) {
    nodes.push(textNode({
      x: 80, y: splitY + (imageUrl ? 120 : 48), w: W - 160, h: 200,
      text: body, font: d.body_font, size: 30, weight: 400,
      color: botTextColor, align: 'center', lineHeight: 1.5,
    }))
  }

  if (cta) {
    const btnY = H - 140
    nodes.push(shapeNode({ x: Math.round((W - 320) / 2), y: btnY, w: 320, h: 64, fill: d.accent_color, radius: 32 }))
    nodes.push(textNode({
      x: Math.round((W - 320) / 2), y: btnY, w: 320, h: 64,
      text: cta, font: d.body_font, size: 26, weight: 700,
      color: readableTextColor(d.accent_color), align: 'center',
    }))
  }

  return { nodes, background: d.bg_color }
}

// ─── Main layout dispatcher ───────────────────────────────────────────────────

function assembleSlide(inp: LayoutInput): { nodes: object[], background: string } {
  switch (inp.decision.layout) {
    case 'full_image_overlay':    return layoutFullImageOverlay(inp)
    case 'image_top_text_bottom': return layoutImageTopTextBottom(inp)
    case 'image_left_text_right': return layoutImageLeftTextRight(inp)
    case 'text_center_no_image':  return layoutTextCenterNoImage(inp)
    case 'image_circle_text':     return layoutImageCircleText(inp)
    case 'bold_statement':        return layoutBoldStatement(inp)
    case 'split_color':           return layoutSplitColor(inp)
    default:                      return layoutTextCenterNoImage(inp)
  }
}

// ─── Extract text from copy ───────────────────────────────────────────────────

interface SlideText {
  headline: string
  body:     string
  cta:      string
  eyebrow:  string
}

function extractSlideText(copy: any, slotIdx: number, format: string, totalSlides: number): SlideText {
  if (format === 'single') {
    return {
      headline: safe(copy.headline, 'Untitled'),
      body:     safe(copy.subheadline || copy.supportingText, ''),
      cta:      safe(copy.cta, ''),
      eyebrow:  '',
    }
  }

  // Carousel
  const slide = copy.slides?.[slotIdx]
  if (!slide) {
    return { headline: '', body: '', cta: '', eyebrow: '' }
  }

  const eyebrow = slotIdx === 0
    ? ''
    : slotIdx === totalSlides - 1
      ? 'Conclusão'
      : `${String(slotIdx).padStart(2, '0')}`

  return {
    headline: safe(slide.headline, ''),
    body:     safe(slide.body, ''),
    cta:      safe(slide.cta, ''),
    eyebrow,
  }
}

// ─── Build full Canvas document ───────────────────────────────────────────────

function buildSingleCanvas(
  copy: any,
  resolvedPlan: ResolvedAssetPlan,
  decisions: DesignDecisions,
  canvasName: string,
): object {
  const slot = resolvedPlan.slots[0]
  const d = decisions.slides[0]
  const txt = extractSlideText(copy, 0, 'single', 1)
  const { nodes, background } = assembleSlide({
    decision:    d,
    headline:    txt.headline,
    body:        txt.body,
    cta:         txt.cta,
    eyebrow:     txt.eyebrow,
    imageUrl:    slot?.resolvedAsset?.url ?? null,
    slideNumber: 0,
    totalSlides: 1,
  })

  return {
    id: uuidv4(),
    name: canvasName,
    type: 'single',
    width: W, height: H,
    background,
    nodes,
    groups: [],
    classes: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function buildCarouselCanvas(
  copy: any,
  resolvedPlan: ResolvedAssetPlan,
  decisions: DesignDecisions,
  canvasName: string,
): object {
  const slots = resolvedPlan.slots
  const total = slots.length

  const pages = slots.map((slot, idx) => {
    const d = decisions.slides[idx] ?? decisions.slides[0]
    const txt = extractSlideText(copy, idx, 'carousel', total)

    let pageType: string
    if (idx === 0)          pageType = 'top_peer'
    else if (idx === total - 1) pageType = 'bottom_peer'
    else                    pageType = 'content'

    const { nodes, background } = assembleSlide({
      decision:    d,
      headline:    txt.headline,
      body:        txt.body,
      cta:         txt.cta,
      eyebrow:     txt.eyebrow,
      imageUrl:    slot.resolvedAsset?.url ?? null,
      slideNumber: idx,
      totalSlides: total,
    })

    return {
      id: uuidv4(),
      type: pageType,
      name: pageType === 'top_peer' ? 'Cover' : pageType === 'bottom_peer' ? 'CTA' : `Slide ${idx}`,
      order: idx,
      nodes,
      groups: [],
      classes: {},
      background,
    }
  })

  return {
    id: uuidv4(),
    name: canvasName,
    type: 'carousel',
    width: W, height: H,
    background: pages[0]?.background ?? '#ffffff',
    nodes: [], groups: [], classes: {},
    pages,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// ─── Fallback decisions ────────────────────────────────────────────────────────
// Used when Groq is unavailable or returns invalid JSON.

function fallbackDecisions(
  brand: any,
  resolvedPlan: ResolvedAssetPlan,
): DesignDecisions {
  const brandColors: string[] = brand?.colors ?? []
  const primary   = safeHex(brandColors[0], '#1a1a2e')
  const secondary = safeHex(brandColors[1], '#e94560')
  const bg        = safeHex(brandColors[2], '#f8f9fa')
  const textCol   = readableTextColor(bg)

  const font = SUPPORTED_FONTS.find(f =>
    (brand?.fonts ?? []).some((bf: string) => bf?.toLowerCase().includes(f.toLowerCase()))
  ) ?? 'Inter'

  const slides = resolvedPlan.slots.map((slot, idx) => {
    const hasImage = !!slot.resolvedAsset
    let layout: LayoutVariant

    if (!slot.needs_visual) {
      layout = idx % 2 === 0 ? 'text_center_no_image' : 'bold_statement'
    } else if (!hasImage) {
      layout = 'text_center_no_image'
    } else if (idx === 0) {
      layout = 'full_image_overlay'
    } else if (idx % 3 === 1) {
      layout = 'image_top_text_bottom'
    } else {
      layout = 'image_left_text_right'
    }

    return {
      slot_id:      slot.slot_id,
      layout,
      bg_color:     bg,
      accent_color: secondary,
      text_color:   textCol,
      heading_font: font,
      body_font:    'Inter',
      image_filter: 'none' as const,
    }
  })

  return {
    slides,
    palette: { primary, secondary, text: textCol, background: bg },
    heading_font: font,
    body_font: 'Inter',
  }
}

// ─── Parse and validate Groq decisions ────────────────────────────────────────

function parseDecisions(raw: string, resolvedPlan: ResolvedAssetPlan, brand: any): DesignDecisions {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    const headingFont = clampFont(parsed.heading_font ?? 'Inter')
    const bodyFont    = clampFont(parsed.body_font    ?? 'Inter')

    const allowedLayouts = new Set([
      'full_image_overlay', 'image_top_text_bottom', 'image_left_text_right',
      'text_center_no_image', 'image_circle_text', 'bold_statement', 'split_color',
    ])
    const allowedFilters = new Set(['none', 'darken', 'desaturate', 'warm'])

    const slides: SlideDecision[] = resolvedPlan.slots.map((slot, idx) => {
      const ai = parsed.slides?.[idx] ?? {}
      const hasImage = !!slot.resolvedAsset

      // Validate / default the layout
      let layout = ai.layout as LayoutVariant
      if (!allowedLayouts.has(layout)) {
        layout = hasImage ? 'full_image_overlay' : 'text_center_no_image'
      }
      // Prevent image layouts when there's no image
      if (!hasImage && layout !== 'text_center_no_image' && layout !== 'bold_statement' && layout !== 'split_color') {
        layout = 'text_center_no_image'
      }

      return {
        slot_id:      slot.slot_id,
        layout,
        bg_color:     safeHex(ai.bg_color,     parsed.palette?.background ?? '#f8f9fa'),
        accent_color: safeHex(ai.accent_color,  parsed.palette?.primary    ?? '#6366f1'),
        text_color:   safeHex(ai.text_color,    readableTextColor(ai.bg_color ?? '#f8f9fa')),
        heading_font: clampFont(ai.heading_font ?? headingFont),
        body_font:    clampFont(ai.body_font    ?? bodyFont),
        image_filter: allowedFilters.has(ai.image_filter) ? ai.image_filter : 'none',
      }
    })

    return {
      slides,
      palette: {
        primary:    safeHex(parsed.palette?.primary,    '#6366f1'),
        secondary:  safeHex(parsed.palette?.secondary,  '#ec4899'),
        text:       safeHex(parsed.palette?.text,       '#111111'),
        background: safeHex(parsed.palette?.background, '#ffffff'),
      },
      heading_font: headingFont,
      body_font:    bodyFont,
    }
  } catch (err) {
    console.warn('[canvas-designer] Groq decision parse failed, using fallback:', (err as Error).message)
    return fallbackDecisions(brand, resolvedPlan)
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

export async function handleDesignCanvas(db: any, body: any) {
  try {
    const { brandContext, copy, resolvedPlan, canvasName } = body as {
      brandContext:  any
      copy:          any
      resolvedPlan:  ResolvedAssetPlan
      canvasName?:   string
    }

    if (!copy)         return corsify(NextResponse.json({ error: 'copy is required' },         { status: 400 }))
    if (!resolvedPlan) return corsify(NextResponse.json({ error: 'resolvedPlan is required' }, { status: 400 }))

    const format: string = resolvedPlan.format ?? copy.format ?? 'single'
    const name = safe(canvasName, `${brandContext?.name ?? 'Post'} — ${copy.headline ?? copy.slides?.[0]?.headline ?? ''}`.slice(0, 80))

    // ── Get design decisions from Groq ─────────────────────────────────────
    let decisions: DesignDecisions = fallbackDecisions(brandContext, resolvedPlan)

    const apiKey = process.env.GROQ_API_KEY
    if (apiKey && resolvedPlan.slots.length > 0) {
      try {
        const groq  = new Groq({ apiKey })
        const model = await getGroqModel(groq)
        const prompt = buildDesignerPrompt(brandContext ?? {}, copy, resolvedPlan)

        let raw: string | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await groq.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: DESIGNER_SYSTEM },
                { role: 'user',   content: prompt },
              ],
              max_tokens: 2000,
              temperature: 0.4,
            })
            raw = res.choices[0]?.message?.content?.trim() ?? null
            break
          } catch (err: any) {
            const is429 = err?.status === 429 || err?.message?.includes('rate_limit')
            if (is429 && attempt < 2) { await new Promise(r => setTimeout(r, 12000)); continue }
            throw err
          }
        }

        if (raw) decisions = parseDecisions(raw, resolvedPlan, brandContext)
      } catch (err: any) {
        console.warn('[canvas-designer] Groq failed, using fallback:', err?.message)
      }
    }

    // ── Build the Canvas document ──────────────────────────────────────────
    const canvas = format === 'carousel'
      ? buildCarouselCanvas(copy, resolvedPlan, decisions, name)
      : buildSingleCanvas(copy, resolvedPlan, decisions, name)

    // ── Persist to MongoDB ─────────────────────────────────────────────────
    const savedCanvas = { ...canvas }
    await db.collection('canvases').insertOne(savedCanvas)
    const { _id, ...result } = savedCanvas as any

    return corsify(NextResponse.json(result))
  } catch (error: any) {
    console.error('[canvas-designer] error:', error)
    return corsify(NextResponse.json({ error: error.message || 'Canvas design failed' }, { status: 500 }))
  }
}
