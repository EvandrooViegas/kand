'use client'
import { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  ArrowLeft, Type, Image as ImageIcon, Trash2, Save, Play, Code2, Copy, Check,
  Square, Circle, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Upload,
  Link as LinkIcon, Palette, Plus, X, Moon, Sun, Italic, Underline, Bold,
  AlignLeft, AlignCenter, AlignRight, Sparkles, Wand2, GripVertical, Undo2, Redo2,
  ZoomIn, ZoomOut, Maximize2, Folder, Unlink, ChevronRight, Group, Crop, Download
} from 'lucide-react'
import {
  applyGroupLayoutToNodes, normalizeGroupGaps, sortNodeIdsByLayout,
  getGroupBounds, removeNodeFromAllGroups, getNodeEffectiveDimensions,
  insertNodeIdIntoGroup, removeNodeIdFromGroup, reorderGroupNodeIds, moveNodeIdInGroup,
} from '@/lib/groups'
import { applyPatchWithReflow } from '@/lib/flowLayout'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { KandLogo, KandMark } from '@/components/logo'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }
const MIN_ZOOM = 0.08
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { parseStyledText, renderStyledText, resolveCanvasClass, isVisibleBackground, splitTokensByNewlines } from '@/lib/styleParser'
import { createElement } from 'react'

const SNAP_THRESHOLD = 8

function collectSnapTargets(nodes, excludeIds = [], canvasW, canvasH) {
  const v = [0, canvasW / 2, canvasW]
  const h = [0, canvasH / 2, canvasH]
  for (const n of nodes || []) {
    if (excludeIds.includes(n.id)) continue
    v.push(n.x, n.x + n.width / 2, n.x + n.width)
    h.push(n.y, n.y + n.height / 2, n.y + n.height)
  }
  return { v, h }
}

function snapMovePosition(rawX, rawY, w, h, targetsV, targetsH, threshold = SNAP_THRESHOLD) {
  let newX = rawX
  let newY = rawY
  const lines = []
  const xEdges = [
    { get: () => newX, set: (v) => { newX = v } },
    { get: () => newX + w / 2, set: (v) => { newX = v - w / 2 } },
    { get: () => newX + w, set: (v) => { newX = v - w } },
  ]
  const yEdges = [
    { get: () => newY, set: (v) => { newY = v } },
    { get: () => newY + h / 2, set: (v) => { newY = v - h / 2 } },
    { get: () => newY + h, set: (v) => { newY = v - h } },
  ]
  for (const edge of xEdges) {
    for (const pos of targetsV) {
      if (Math.abs(edge.get() - pos) < threshold) {
        edge.set(pos)
        if (!lines.some((l) => l.type === 'v' && l.pos === pos)) lines.push({ type: 'v', pos })
        break
      }
    }
  }
  for (const edge of yEdges) {
    for (const pos of targetsH) {
      if (Math.abs(edge.get() - pos) < threshold) {
        edge.set(pos)
        if (!lines.some((l) => l.type === 'h' && l.pos === pos)) lines.push({ type: 'h', pos })
        break
      }
    }
  }
  return { x: Math.round(newX), y: Math.round(newY), lines }
}

function snapResizeBox(x, y, w, h, targetsV, targetsH, threshold = SNAP_THRESHOLD) {
  let nx = x
  let ny = y
  let nw = w
  let nh = h
  const lines = []
  const right = x + w
  const bottom = y + h
  for (const pos of targetsV) {
    if (Math.abs(right - pos) < threshold) { nw = pos - x; if (!lines.some((l) => l.type === 'v' && l.pos === pos)) lines.push({ type: 'v', pos }); break }
  }
  for (const pos of targetsH) {
    if (Math.abs(bottom - pos) < threshold) { nh = pos - y; if (!lines.some((l) => l.type === 'h' && l.pos === pos)) lines.push({ type: 'h', pos }); break }
  }
  for (const pos of targetsV) {
    if (Math.abs(x - pos) < threshold) { const delta = pos - x; nx = pos; nw = w - delta; if (!lines.some((l) => l.type === 'v' && l.pos === pos)) lines.push({ type: 'v', pos }); break }
  }
  for (const pos of targetsH) {
    if (Math.abs(y - pos) < threshold) { const delta = pos - y; ny = pos; nh = h - delta; if (!lines.some((l) => l.type === 'h' && l.pos === pos)) lines.push({ type: 'h', pos }); break }
  }
  return { x: Math.round(nx), y: Math.round(ny), w: Math.max(20, Math.round(nw)), h: Math.max(20, Math.round(nh)), lines }
}

// Font config (mirrors lib/fonts.js)
const FONT_META = {
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
const WEIGHT_LABELS = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' }

const getCanvasClassStyle = (classes = {}, className = '') => resolveCanvasClass(classes, className)?.style || {}
const normalizeClassTagName = (classes = {}, className = '') => {
  if (!className) return ''
  const resolved = resolveCanvasClass(classes, className)
  if (resolved?.key) return resolved.key.startsWith('.') ? resolved.key : `.${resolved.key}`
  return className.startsWith('.') ? className : `.${className}`
}

const GRADIENT_PRESETS = [
  { name: 'Sunset', stops: [{ color: '#ff7e5f', position: 0, alpha: 100 }, { color: '#feb47b', position: 100, alpha: 100 }], angle: 135 },
  { name: 'Purple Haze', stops: [{ color: '#667eea', position: 0, alpha: 100 }, { color: '#764ba2', position: 100, alpha: 100 }], angle: 135 },
  { name: 'Ocean', stops: [{ color: '#2193b0', position: 0, alpha: 100 }, { color: '#6dd5ed', position: 100, alpha: 100 }], angle: 135 },
  { name: 'Pink Bloom', stops: [{ color: '#ec4899', position: 0, alpha: 100 }, { color: '#8b5cf6', position: 100, alpha: 100 }], angle: 90 },
  { name: 'Forest', stops: [{ color: '#134e5e', position: 0, alpha: 100 }, { color: '#71b280', position: 100, alpha: 100 }], angle: 135 },
  { name: 'Fire', stops: [{ color: '#f12711', position: 0, alpha: 100 }, { color: '#f5af19', position: 100, alpha: 100 }], angle: 45 },
  { name: 'Glass', stops: [{ color: '#ffffff', position: 0, alpha: 80 }, { color: '#ffffff', position: 100, alpha: 0 }], angle: 180 },
  { name: 'Fade Out', stops: [{ color: '#000000', position: 0, alpha: 0 }, { color: '#000000', position: 100, alpha: 80 }], angle: 180 },
]

// MASK_PRESETS removed

function plainTextFromStyled(text = '') {
  const walk = (tokens) => tokens.map((t) => {
    if (typeof t === 'string') return t
    if (t?.children?.length) return walk(t.children)
    return ''
  }).join('')
  return walk(parseStyledText(text || '', {})).replace(/\s+/g, ' ').trim()
}

function LayerPreview({ node }) {
  if (node.type === 'image' && node.src) {
    return (
      <div className="w-11 h-11 shrink-0 rounded-md border-2 border-foreground/20 overflow-hidden bg-muted">
        <img src={node.src} alt="" className="w-full h-full object-cover" draggable={false} />
      </div>
    )
  }
  if (node.type === 'text') {
    const preview = plainTextFromStyled(node.text || '') || 'Text'
    return (
      <div
        className="w-11 h-11 shrink-0 rounded-md border-2 border-foreground/20 bg-background flex items-center justify-center p-1 overflow-hidden"
        style={{ fontFamily: `'${node.fontFamily || 'Inter'}', sans-serif`, color: node.color || '#111' }}
      >
        <span className="text-[7px] leading-[1.1] text-center line-clamp-4 font-medium w-full break-words">
          {preview.slice(0, 48)}
        </span>
      </div>
    )
  }
  if (node.type === 'gradient') {
    return (
      <div
        className="w-11 h-11 shrink-0 rounded-md border-2 border-foreground/20"
        style={{ backgroundImage: buildGradientCssClient(node) }}
      />
    )
  }
  if (node.type === 'shape') {
    return (
      <div
        className="w-11 h-11 shrink-0 border-2 border-foreground/20"
        style={{
          background: node.fill || '#6366f1',
          borderRadius: node.shape === 'ellipse' ? '50%' : Math.min(8, (node.borderRadius || 0) / 4 + 2),
        }}
      />
    )
  }
  return (
    <div className="w-11 h-11 shrink-0 rounded-md border-2 border-foreground/20 bg-muted flex items-center justify-center">
      <Square className="w-4 h-4 text-muted-foreground" />
    </div>
  )
}

function buildGradientCssClient(node) {
  const stops = (node.stops || [{ color: '#6366f1', position: 0, alpha: 100 }, { color: '#ec4899', position: 100, alpha: 100 }])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((s) => {
      const a = (typeof s.alpha === 'number' ? s.alpha : 100) / 100
      const hex = s.color || '#000000'
      const r = parseInt(hex.slice(1, 3), 16) || 0
      const g = parseInt(hex.slice(3, 5), 16) || 0
      const b = parseInt(hex.slice(5, 7), 16) || 0
      return `rgba(${r},${g},${b},${a}) ${s.position || 0}%`
    })
    .join(', ')
  if (node.gradientType === 'radial') return `radial-gradient(circle at center, ${stops})`
  const angle = typeof node.angle === 'number' ? node.angle : 90
  return `linear-gradient(${angle}deg, ${stops})`
}

function buildFilterCss(filters) {
  const f = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0, sepia: 0, hueRotate: 0, opacity: 100, ...(filters || {}) }
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) hue-rotate(${f.hueRotate}deg) blur(${f.blur}px) opacity(${f.opacity}%)`
}

// maskRadius removed

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0, sepia: 0, hueRotate: 0, opacity: 100 }

function nodeLayerLabel(n) {
  if (n.dynamic_key) return `{${n.dynamic_key}}`
  if (n.type === 'text') return plainTextFromStyled(n.text || '') || 'Empty text'
  if (n.type === 'image') return 'Image'
  if (n.type === 'gradient') return 'Gradient'
  return n.shape === 'ellipse' ? 'Circle' : 'Rectangle'
}

function isValidHex(hex) {
  return /^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)
}

function ColorInput({ value, onChange, className = '' }) {
  const safeHex = isValidHex(value) ? value : '#000000'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative w-8 h-8 rounded border border-input shrink-0 overflow-hidden bg-white dark:bg-black">
        <input 
          type="color" 
          className="absolute -inset-2 w-12 h-12 cursor-pointer opacity-0" 
          value={safeHex} 
          onChange={(e) => onChange(e.target.value)} 
        />
        <div className="w-full h-full pointer-events-none" style={{ backgroundColor: value || 'transparent' }} />
      </div>
      <Input 
        className="h-8 text-xs font-mono" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        placeholder="Hex, rgb(), hsl()"
      />
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <Button variant="ghost" size="icon"><Sun className="w-4 h-4" /></Button>
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  )
}

function Editor() {
  const router = useRouter()
  const params = useParams()
  const id = params.id
  const [canvasState, setCanvasState] = useState(null)
  const [hasChanges, setHasChanges] = useState(false)
  const savedCanvasRef = useRef(null)
  const historyRef = useRef({ past: [], future: [] })
  const clipboardRef = useRef([])
  const [, setHistoryTick] = useState(0)
  const canvasRefObj = useRef(canvasState)
  canvasRefObj.current = canvasState

  const pushHistory = (stateToPush) => {
    if (!stateToPush) return
    historyRef.current.past.push(stateToPush)
    if (historyRef.current.past.length > 50) historyRef.current.past.shift()
    historyRef.current.future = []
    setHistoryTick(t => t + 1)
  }

  const setCanvas = (updater, skipHistory = false) => {
    setCanvasState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (!skipHistory && prev && prev !== next) {
        pushHistory(prev)
      }
      if (savedCanvasRef.current) {
        setHasChanges(JSON.stringify(next) !== savedCanvasRef.current)
      }
      return next
    })
  }

  const canvas = canvasState

  const undo = () => {
    if (historyRef.current.past.length === 0) return
    const prev = historyRef.current.past.pop()
    historyRef.current.future.push(canvasRefObj.current)
    canvasRefObj.current = prev
    setCanvasState(prev)
    setHistoryTick(t => t + 1)
  }
  const redo = () => {
    if (historyRef.current.future.length === 0) return
    const next = historyRef.current.future.pop()
    historyRef.current.past.push(canvasRefObj.current)
    canvasRefObj.current = next
    setCanvasState(next)
    setHistoryTick(t => t + 1)
  }
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})
  const primarySelectedId = selectedIds[selectedIds.length - 1] ?? null
  const [editingId, setEditingId] = useState(null)
  const [cropModeNodeId, setCropModeNodeId] = useState(null)
  const [scale, setScale] = useState(0.5)
  const userZoomRef = useRef(false)
  const canvasViewportRef = useRef(null)
  const canvasRef = useRef(null)
  const editorRef = useRef(null)
  const hasInitializedRef = useRef(false)
  const savedRangeRef = useRef(null)
  const [renderDialog, setRenderDialog] = useState(false)
  const [renderData, setRenderData] = useState('')
  const [renderResult, setRenderResult] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [apiDialog, setApiDialog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageDialog, setImageDialog] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const measureRef = useRef(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [layerDropTarget, setLayerDropTarget] = useState(null)
  const [layerDragSource, setLayerDragSource] = useState(null)
  const [sessionImages, setSessionImages] = useState([])
  const [isDraggingOverBase, setIsDraggingOverBase] = useState(false)
  const [snapLines, setSnapLines] = useState([])
  const [selectionRect, setSelectionRect] = useState(null)
  const [textFormat, setTextFormat] = useState({ bold: false, italic: false, underline: false, color: '#000000', align: 'left' })

  const tagsToHtml = useCallback((text) => {
    const tokens = parseStyledText(text || '', canvas?.classes || {});
    const toHtml = (arr) => arr.map(t => {
      if (typeof t === 'string') return t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      if (t.className) {
        const cleanName = t.className.startsWith('.') ? t.className.slice(1) : t.className;
        return `<span class="${cleanName}">${toHtml(t.children)}</span>`;
      }
      // Inline style token: serialize style object to html style attr
      const styleStr = Object.entries(t.style || {}).map(([k, v]) => {
        const css = k.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${css}:${v}`;
      }).join(';');
      return `<span style="${styleStr}">${toHtml(t.children)}</span>`;
    }).join('');
    return toHtml(tokens);
  }, [canvas?.classes])

  const htmlToTags = useCallback((html) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const walk = (n) => {
      let str = '';
      for (const child of n.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          str += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'SPAN' && child.className && !child.style.cssText) {
            // Keep class tags stable whether the stored class key has a dot prefix or not.
            const cls = normalizeClassTagName(canvas?.classes || {}, child.className);
            str += `<%kind:${cls}:${walk(child)}%>`;
          } else if (child.tagName === 'SPAN' && child.style.cssText) {
            // Inline-styled span (from execCommand or manual span)
            const styleParts = [];
            if (child.style.color) styleParts.push(`color=${child.style.color}`);
            if (child.style.fontSize) styleParts.push(`font-size=${child.style.fontSize}`);
            if (child.style.textDecoration && child.style.textDecoration !== 'none') styleParts.push(`textDecoration=${child.style.textDecoration}`);
            if (child.style.fontWeight) styleParts.push(`fontWeight=${child.style.fontWeight}`);
            if (child.style.fontStyle) styleParts.push(`fontStyle=${child.style.fontStyle}`);
            if (child.style.backgroundColor) styleParts.push(`backgroundColor=${child.style.backgroundColor}`);
            if (child.style.letterSpacing) styleParts.push(`letterSpacing=${child.style.letterSpacing}`);
            if (styleParts.length > 0) {
              str += `<%inline:${styleParts.join('|')}:${walk(child)}%>`;
            } else {
              str += walk(child);
            }
          } else if (child.tagName === 'FONT') {
            // execCommand 'foreColor' creates <font color="..."> in some browsers
            const parts = [];
            if (child.color) parts.push(`color=${child.color}`);
            const inner = walk(child);
            str += parts.length > 0 ? `<%inline:${parts.join('|')}:${inner}%>` : inner;
          } else if (child.tagName === 'U') {
            str += `<%inline:textDecoration=underline:${walk(child)}%>`;
          } else if (child.tagName === 'B' || child.tagName === 'STRONG') {
            str += `<%inline:fontWeight=bold:${walk(child)}%>`;
          } else if (child.tagName === 'I' || child.tagName === 'EM') {
            str += `<%inline:fontStyle=italic:${walk(child)}%>`;
          } else if (child.tagName === 'BR') {
            str += '\n';
          } else if (child.tagName === 'DIV' || child.tagName === 'P') {
            const childStr = walk(child);
            str += childStr ? '\n' + childStr : '\n';
          } else {
            str += walk(child);
          }
        }
      }
      return str;
    };
    return walk(temp).replace(/\n\n/g, '\n');
  }, [canvas?.classes])

  const handleSelectionChange = () => {
    if (!editingId) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelectionRect(null);
      savedRangeRef.current = null;
      return;
    }
    const editor = document.getElementById(`editor-${editingId}`);
    if (!editor || !editor.contains(sel.anchorNode)) {
      setSelectionRect(null);
      savedRangeRef.current = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) {
      setSelectionRect(null);
      savedRangeRef.current = null;
      return;
    }
    savedRangeRef.current = range.cloneRange();
    setSelectionRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    // Detect active formatting at selection
    const editingNode = canvasState?.nodes?.find(n => n.id === editingId);
    const nodeColor = editingNode?.color || '#000000';
    setTextFormat({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      color: document.queryCommandValue('foreColor') || nodeColor,
      align: document.queryCommandState('justifyCenter') ? 'center' : document.queryCommandState('justifyRight') ? 'right' : 'left',
    });
  }

  const restoreSelection = () => {
    if (!savedRangeRef.current) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
    return true;
  }

  const applyAdHocStyle = (styleKey, value) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    
    if (styleKey === 'color') {
      document.execCommand('foreColor', false, value);
    } else if (styleKey === 'textDecoration' && value === 'underline') {
      document.execCommand('underline');
    } else if (styleKey === 'fontWeight' && value === 'bold') {
      document.execCommand('bold');
    } else if (styleKey === 'fontStyle' && value === 'italic') {
      document.execCommand('italic');
    } else {
      // For other styles (fontSize etc.), manually wrap in a span
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      const cssProp = styleKey.replace(/([A-Z])/g, '-$1').toLowerCase();
      span.style[styleKey] = typeof value === 'number' ? `${value}px` : value;
      try {
        const content = range.extractContents();
        span.appendChild(content);
        range.insertNode(span);
      } catch (e) { toast.error('Could not apply style'); return; }
    }
    
    // Save the updated HTML without closing toolbar
    updateNode(editingId, { text: htmlToTags(editor.innerHTML) });
    // Don't clear selectionRect here — toolbar persists until click-outside
  }

  const applyAdHocClass = (className) => {
    if (!className) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (!restoreSelection()) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    const span = document.createElement('span');
    // Strip leading dot — DOM className does NOT include the dot (that's a CSS selector prefix)
    span.className = className.startsWith('.') ? className.slice(1) : className;
    try {
      const content = range.extractContents();
      span.appendChild(content);
      range.insertNode(span);
      updateNode(editingId, { text: htmlToTags(editor.innerHTML) });
      // Don't clear selectionRect — toolbar persists until click-outside
    } catch (e) {
      toast.error('Complex selection format not supported');
    }
  }

  useEffect(() => {
    if (editingId) {
      if (!hasInitializedRef.current && editorRef.current) {
        const enode = canvasState?.nodes?.find(n => n.id === editingId)
        if (enode) {
          editorRef.current.innerHTML = tagsToHtml(enode.text || '')
          editorRef.current.focus()
          
          // Select all text or put cursor at the end
          const range = document.createRange()
          range.selectNodeContents(editorRef.current)
          range.collapse(false)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        }
        hasInitializedRef.current = true
      }
    } else {
      hasInitializedRef.current = false
    }
  }, [editingId, canvasState, tagsToHtml])

  // Close editing and toolbar when clicking outside both editor and toolbar
  useEffect(() => {
    if (!editingId) return;
    const handler = (e) => {
      const toolbar = document.querySelector('[data-floating-toolbar]');
      const classPanel = document.querySelector('[data-class-panel]');
      const editor = editorRef.current;
      if (toolbar && toolbar.contains(e.target)) return;
      if (editor && editor.contains(e.target)) return;
      // Class-panel clicks (sidebar "Apply to Selection" buttons) must not exit edit mode
      // — the button's onClick will apply the class using savedRangeRef
      if (classPanel && classPanel.contains(e.target)) return;
      
      // Save content and exit edit mode
      if (editor) {
        updateNode(editingId, { text: htmlToTags(editor.innerHTML) });
      }
      setEditingId(null);
      setSelectionRect(null);
      savedRangeRef.current = null;
    };
    // Use capture to run before canvas/node selection handlers
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [editingId, htmlToTags])

  useEffect(() => {
    fetch(`/api/canvases/${id}`).then((r) => r.json()).then((data) => {
      if (data.error) { toast.error(data.error); router.push('/') } else {
        setCanvas(data, true)
        savedCanvasRef.current = JSON.stringify(data)
        setHasChanges(false)
      }
    })
  }, [id])

  const fitCanvasToView = useCallback(() => {
    if (!canvas) return
    const el = canvasViewportRef.current
    const pad = 48
    const vw = el ? el.clientWidth - pad : window.innerWidth - 720
    const vh = el ? el.clientHeight - pad : window.innerHeight - 180
    const sx = vw / canvas.width
    const sy = vh / canvas.height
    setScale(Math.min(sx, sy, 1))
    userZoomRef.current = false
  }, [canvas?.width, canvas?.height])

  useEffect(() => {
    if (!canvas) return
    const updateScale = () => {
      if (userZoomRef.current) return
      fitCanvasToView()
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [canvas, fitCanvasToView])

  useLayoutEffect(() => {
    const el = canvasViewportRef.current
    if (!el || !canvas) return
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      userZoomRef.current = true
      const factor = e.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      setScale((s) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s * factor)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvas])

  useEffect(() => {
    if (!canvas) return
    const sample = {}
    ;(canvas.nodes || []).forEach((n) => {
      if (n.dynamic_key) sample[n.dynamic_key] = n.type === 'text' ? (n.text || 'Sample') : (n.src || 'https://image.url')
    })
    setRenderData(JSON.stringify({ canva_id: id, data: sample }, null, 2))
  }, [canvas?.id, canvas?.nodes?.length, renderDialog])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedIds.length > 0) {
          clipboardRef.current = (canvasState?.nodes || []).filter(n => selectedIds.includes(n.id))
          toast.success(`${clipboardRef.current.length} copied`)
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current && clipboardRef.current.length > 0) {
          const newNodes = clipboardRef.current.map(n => ({
            ...n,
            id: uuidv4(),
            groupId: undefined,
            x: n.x + 20,
            y: n.y + 20
          }))
          setCanvas(c => ({ ...c, nodes: [...(c.nodes || []), ...newNodes] }))
          setSelectedIds(newNodes.map(n => n.id))
          setSelectedGroupId(null)
          e.preventDefault()
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo()
        else undo()
        e.preventDefault()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo()
        e.preventDefault()
        return
      }

      if (selectedIds.length === 0) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        selectedIds.forEach((nid) => deleteNode(nid, true))
        setSelectedIds([])
        setSelectedGroupId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds, canvasState])

  const groups = canvas?.groups || []
  const selectedGroup = selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : null
  const selected = primarySelectedId ? canvas?.nodes?.find((n) => n.id === primarySelectedId) : null

  const clearSelection = () => {
    setSelectedIds([])
    setSelectedGroupId(null)
    setCropModeNodeId(null)
  }

  const selectLayer = (nodeId, e) => {
    setCropModeNodeId(null)
    if (e?.ctrlKey || e?.metaKey) {
      setSelectedGroupId(null)
      setSelectedIds((prev) => (prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]))
      return
    }
    if (e?.shiftKey && selectedIds.length > 0) {
      setSelectedGroupId(null)
      setSelectedIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]))
      return
    }
    setSelectedGroupId(null)
    setSelectedIds([nodeId])
  }

  const selectGroup = (groupId) => {
    const g = groups.find((gr) => gr.id === groupId)
    if (!g) return
    setSelectedGroupId(groupId)
    setSelectedIds([...g.nodeIds])
  }

  const toggleGroupExpanded = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const stripNodesFromOtherGroups = (groupsList, nodeIds, exceptGroupId) =>
    (groupsList || [])
      .map((g) => {
        if (g.id === exceptGroupId) return g
        const nodeIdsFiltered = g.nodeIds.filter((id) => !nodeIds.includes(id))
        return { ...g, nodeIds: nodeIdsFiltered, gaps: normalizeGroupGaps({ ...g, nodeIds: nodeIdsFiltered }) }
      })
      .filter((g) => g.nodeIds.length >= 2)

  const createGroupFromSelection = () => {
    const ids = selectedIds.filter((id) => canvas.nodes?.some((n) => n.id === id))
    if (ids.length < 2) return toast.error('Select at least 2 layers (Ctrl+click in the list)')
    const layout = 'horizontal'
    const sorted = sortNodeIdsByLayout(ids, canvas.nodes, layout)
    const groupId = uuidv4()
    const newGroup = {
      id: groupId,
      name: `Group ${groups.length + 1}`,
      nodeIds: sorted,
      layout,
      align: 'left',
      gaps: sorted.slice(0, -1).map(() => ({ gapX: 0, gapY: 0 })),
    }
    setCanvas((c) => {
      let nextGroups = stripNodesFromOtherGroups(c.groups || [], sorted, groupId)
      nextGroups = [...nextGroups, newGroup]
      let nodes = c.nodes.map((n) => {
        if (sorted.includes(n.id)) return { ...n, groupId }
        const stillGrouped = nextGroups.some((g) => g.nodeIds.includes(n.id))
        if (n.groupId && !stillGrouped) return { ...n, groupId: undefined }
        return n
      })
      nodes = applyGroupLayoutToNodes(nodes, newGroup)
      return { ...c, groups: nextGroups, nodes }
    })
    setSelectedGroupId(groupId)
    setSelectedIds([...sorted])
    toast.success('Grouped')
  }

  const ungroupById = (groupId) => {
    setCanvas((c) => ({
      ...c,
      groups: (c.groups || []).filter((g) => g.id !== groupId),
      nodes: c.nodes.map((n) => (n.groupId === groupId ? { ...n, groupId: undefined } : n)),
    }))
    if (selectedGroupId === groupId) setSelectedGroupId(null)
    toast.success('Ungrouped')
  }

  const updateGroup = (groupId, patch) => {
    setCanvas((c) => {
      const g = (c.groups || []).find((gr) => gr.id === groupId)
      if (!g) return c
      let updated = { ...g, ...patch }
      if (patch.nodeIds) updated.nodeIds = patch.nodeIds
      updated.gaps = normalizeGroupGaps(updated)
      const nodes = applyGroupLayoutToNodes(c.nodes, updated)
      return {
        ...c,
        groups: (c.groups || []).map((gr) => (gr.id === groupId ? updated : gr)),
        nodes,
      }
    })
  }

  const moveGroupMember = (groupId, nodeId, direction) => {
    const g = groups.find((gr) => gr.id === groupId)
    if (!g) return
    const updated = moveNodeIdInGroup(g, nodeId, direction)
    updateGroup(groupId, { nodeIds: updated.nodeIds, gaps: updated.gaps })
  }

  const addNodeToGroup = (groupId, nodeId, beforeNodeId = null) => {
    setCanvas((c) => {
      let nextGroups = stripNodesFromOtherGroups(c.groups || [], [nodeId], groupId)
      const gi = nextGroups.findIndex((gr) => gr.id === groupId)
      if (gi === -1) return c
      const updated = insertNodeIdIntoGroup(nextGroups[gi], nodeId, beforeNodeId)
      nextGroups[gi] = updated
      let nodes = c.nodes.map((n) => {
        if (n.id === nodeId) return { ...n, groupId }
        const still = nextGroups.some((gr) => gr.nodeIds.includes(n.id))
        if (n.groupId && !still) return { ...n, groupId: undefined }
        return n
      })
      nodes = applyGroupLayoutToNodes(nodes, updated)
      return { ...c, groups: nextGroups, nodes }
    })
    toast.success('Added to group')
  }

  const removeNodeFromGroupById = (groupId, nodeId) => {
    setCanvas((c) => {
      const g = (c.groups || []).find((gr) => gr.id === groupId)
      if (!g) return c
      const reduced = removeNodeIdFromGroup(g, nodeId)
      let nextGroups = (c.groups || [])
        .map((gr) => (gr.id === groupId ? reduced : gr))
        .filter((gr) => gr.nodeIds.length >= 2)
      let nodes = c.nodes.map((n) => (n.id === nodeId ? { ...n, groupId: undefined } : n))
      const remaining = nextGroups.find((gr) => gr.id === groupId)
      if (remaining) nodes = applyGroupLayoutToNodes(nodes, remaining)
      return { ...c, groups: nextGroups, nodes }
    })
    toast.success('Removed from group')
  }

  const reorderGroupMember = (groupId, draggedId, beforeNodeId) => {
    const g = groups.find((gr) => gr.id === groupId)
    if (!g || draggedId === beforeNodeId) return
    const nodeIds = reorderGroupNodeIds(g.nodeIds, draggedId, beforeNodeId)
    updateGroup(groupId, { nodeIds })
  }

  const handleLayerDragStart = (nodeId, fromGroupId, e) => {
    e.dataTransfer.setData('text/plain', nodeId)
    if (fromGroupId) e.dataTransfer.setData('application/x-kand-from-group', fromGroupId)
    e.dataTransfer.effectAllowed = 'move'
    setLayerDragSource({ nodeId, fromGroupId: fromGroupId || null })
  }

  const handleLayerDragEnd = () => {
    setLayerDragSource(null)
    setLayerDropTarget(null)
    setDragOverId(null)
  }

  const layerDropActive = (target) => {
    if (!layerDropTarget || !target) return false
    if (layerDropTarget.type !== target.type) return false
    if (target.groupId != null && layerDropTarget.groupId !== target.groupId) return false
    if (target.nodeId != null && layerDropTarget.nodeId !== target.nodeId) return false
    return true
  }

  const handleLayerDropEvent = (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('text/plain')
    if (!draggedId || !target) return
    const fromGroupId = e.dataTransfer.getData('application/x-kand-from-group') || null

    if (target.type === 'group-add') {
      if (fromGroupId === target.groupId) {
        const g = groups.find((gr) => gr.id === target.groupId)
        if (g && g.nodeIds[g.nodeIds.length - 1] !== draggedId) {
          reorderGroupMember(target.groupId, draggedId, null)
        }
      } else {
        addNodeToGroup(target.groupId, draggedId, null)
      }
    } else if (target.type === 'group-before') {
      if (fromGroupId === target.groupId) {
        reorderGroupMember(target.groupId, draggedId, target.nodeId)
      } else {
        addNodeToGroup(target.groupId, draggedId, target.nodeId)
      }
    } else if (target.type === 'ungroup') {
      if (fromGroupId) removeNodeFromGroupById(fromGroupId, draggedId)
    } else if (target.type === 'ungrouped-before' && target.nodeId) {
      if (fromGroupId) removeNodeFromGroupById(fromGroupId, draggedId)
      reorderByDrag(draggedId, target.nodeId)
    }
    setLayerDropTarget(null)
    setDragOverId(null)
  }

  const updateGroupGap = (groupId, gapIndex, key, value) => {
    setCanvas((c) => {
      const g = (c.groups || []).find((gr) => gr.id === groupId)
      if (!g) return c
      const gaps = normalizeGroupGaps(g)
      gaps[gapIndex] = { ...gaps[gapIndex], [key]: typeof value === 'number' ? value : 0 }
      const updated = { ...g, gaps }
      const nodes = applyGroupLayoutToNodes(c.nodes, updated)
      return {
        ...c,
        groups: (c.groups || []).map((gr) => (gr.id === groupId ? updated : gr)),
        nodes,
      }
    })
  }

  const updateNode = (nodeId, patch, skipHistory = false) => {
    setCanvas((c) => ({
      ...c,
      nodes: applyPatchWithReflow(c.nodes, nodeId, patch, c.groups || []),
    }), skipHistory)
  }
  const deleteNode = (nodeId, skipClear = false) => {
    setCanvas((c) => ({
      ...c,
      nodes: c.nodes.filter((n) => n.id !== nodeId),
      groups: removeNodeFromAllGroups(c.groups, nodeId),
    }))
    if (!skipClear) {
      setSelectedIds((prev) => prev.filter((id) => id !== nodeId))
    }
    if (nodeId === cropModeNodeId) setCropModeNodeId(null)
  }

  const moveNode = (nodeId, direction) => {
    setCanvas((c) => {
      const nodes = [...c.nodes]
      const idx = nodes.findIndex((n) => n.id === nodeId)
      if (idx === -1) return c
      const [node] = nodes.splice(idx, 1)
      let newIdx = idx
      if (direction === 'forward') newIdx = Math.min(nodes.length, idx + 1)
      else if (direction === 'backward') newIdx = Math.max(0, idx - 1)
      else if (direction === 'front') newIdx = nodes.length
      else if (direction === 'back') newIdx = 0
      nodes.splice(newIdx, 0, node)
      return { ...c, nodes }
    })
  }

  // Drag-reorder a layer: place draggedId in the visual (front-first) list just before targetId
  const reorderByDrag = (draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) return
    setCanvas((c) => {
      // The layer panel renders nodes in reverse order (top of panel = last in array).
      // We work in that reversed (visual) order so "insert before target" means
      // the dragged item appears above the target row in the panel.
      const visual = c.nodes.slice().reverse()
      const dragIdx = visual.findIndex((n) => n.id === draggedId)
      if (dragIdx === -1) return c
      const [item] = visual.splice(dragIdx, 1)
      // Re-find target after removal (index may have shifted)
      const newTgt = visual.findIndex((n) => n.id === targetId)
      if (newTgt === -1) {
        visual.push(item)
      } else {
        visual.splice(newTgt, 0, item)
      }
      return { ...c, nodes: visual.reverse() }
    })
  }

  // Adaptive text height: measure all text nodes via a hidden mirror div, update height
  useLayoutEffect(() => {
    if (!canvas || !measureRef.current) return
    const el = measureRef.current
    const updates = []
    for (const n of canvas.nodes || []) {
      if (n.type !== 'text') continue
      if (n.autoSize === false) continue
      el.className = n.className ? (n.className.startsWith('.') ? n.className.slice(1) : n.className) : ''
      el.style.width = `${n.width}px`
      el.style.fontSize = `${n.fontSize || 48}px`
      el.style.fontFamily = `'${n.fontFamily || 'Inter'}', sans-serif`
      el.style.fontWeight = String(n.fontWeight || 400)
      el.style.fontStyle = n.fontStyle === 'italic' ? 'italic' : 'normal'
      el.style.lineHeight = String(n.lineHeight ?? 1.2)
      el.style.textAlign = n.textAlign || 'left'
      el.style.letterSpacing = `${n.letterSpacing || 0}px`
      el.style.whiteSpace = 'pre-wrap'
      el.style.wordBreak = 'break-word'
      el.innerHTML = (n.text && n.text.length > 0) ? tagsToHtml(n.text) : 'M'
      const h = Math.max(40, Math.ceil(el.getBoundingClientRect().height))
      if (h !== n.height) updates.push({ id: n.id, height: h })
    }
    if (updates.length) {
      setCanvas((c) => {
        let nodes = c.nodes
        for (const u of updates) {
          const prev = nodes.find((n) => n.id === u.id)
          if (!prev) continue
          nodes = applyPatchWithReflow(nodes, u.id, { height: u.height }, c.groups || [])
        }
        return { ...c, nodes }
      })
    }
  }, [canvas?.nodes, tagsToHtml])

  const addText = () => {
    const newNode = {
      id: uuidv4(), type: 'text',
      x: Math.round((canvas.width - 600) / 2), y: Math.round((canvas.height - 100) / 2),
      width: 600, height: 100,
      text: 'New text', fontFamily: 'Inter', fontSize: 72, fontWeight: 700, fontStyle: 'normal',
      color: '#111111', textAlign: 'center',
      textShadow: { enabled: false, offsetX: 0, offsetY: 4, blur: 12, color: '#00000055' },
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedIds([newNode.id])
  }

  const addShape = (shape) => {
    const newNode = {
      id: uuidv4(), type: 'shape', shape,
      x: Math.round((canvas.width - 300) / 2), y: Math.round((canvas.height - 300) / 2),
      width: 300, height: 300, fill: '#6366f1', stroke: '#000000', strokeWidth: 0,
      borderRadius: shape === 'rect' ? 0 : 9999,
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedIds([newNode.id])
  }

  const addGradient = () => {
    const newNode = {
      id: uuidv4(), type: 'gradient',
      gradientType: 'linear', angle: 135, shape: 'rect',
      stops: [{ color: '#667eea', position: 0, alpha: 100 }, { color: '#764ba2', position: 100, alpha: 100 }],
      x: Math.round((canvas.width - 600) / 2), y: Math.round((canvas.height - 400) / 2),
      width: 600, height: 400, borderRadius: 24,
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedIds([newNode.id])
  }

  const openImageDialog = () => { setImageUrl(''); setImageDialog(true) }
  const insertImageNode = (src) => {
    const placeNode = (width, height, aspectRatio) => {
      const newNode = {
        id: uuidv4(), type: 'image',
        x: Math.round((canvas.width - width) / 2), y: Math.round((canvas.height - height) / 2),
        width, height, aspectRatio, src, borderRadius: 0, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
        filters: { ...DEFAULT_FILTERS },
      }
      setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
      setSelectedIds([newNode.id])
      setImageDialog(false)
    }
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth || 1
      const nh = img.naturalHeight || 1
      const aspect = nw / nh
      const maxDim = 500
      let w = maxDim
      let h = maxDim
      if (aspect >= 1) { w = maxDim; h = Math.round(maxDim / aspect) }
      else { h = maxDim; w = Math.round(maxDim * aspect) }
      placeNode(w, h, aspect)
    }
    img.onerror = () => placeNode(500, 500, 1)
    img.src = src
  }
  const addImageByUrl = () => { if (!imageUrl.trim()) return toast.error('Enter an image URL'); insertImageNode(imageUrl.trim()) }
  const uploadFile = async (file) => {
    if (!file) return
    if (file.size > 6 * 1024 * 1024) return toast.error('Image too large (max 6MB)')
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
      const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
      const result = await res.json()
      if (result.url) { 
        insertImageNode(result.url); 
        setSessionImages(prev => [result.url, ...prev].filter((v, i, a) => a.indexOf(v) === i));
        toast.success('Uploaded') 
      } else toast.error(result.error || 'Upload failed')
    } catch (e) { toast.error('Upload failed: ' + e.message) }
    finally { setUploading(false) }
  }

  const handleRootDrop = async (e) => {
    e.preventDefault()
    setIsDraggingOverBase(false)
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return
    
    const newImages = []
    for (const file of Array.from(e.dataTransfer.files)) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 6 * 1024 * 1024) { toast.error('File too large: ' + file.name); continue }
      try {
        const reader = new FileReader()
        const dataUrl = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
        const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
        const result = await res.json()
        if (result.url) {
          newImages.push(result.url)
          toast.success('Uploaded ' + file.name)
        }
      } catch (err) {
        toast.error('Failed to upload ' + file.name)
      }
    }
    if (newImages.length > 0) {
      setSessionImages(prev => [...newImages, ...prev].filter((v, i, a) => a.indexOf(v) === i))
    }
  }

  const save = async () => {
    if (!canvas) return
    const res = await fetch(`/api/canvases/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(canvas) })
    if (res.ok) {
      toast.success('Saved!')
      savedCanvasRef.current = JSON.stringify(canvas)
      setHasChanges(false)
    } else toast.error('Save failed')
  }

  const testRender = async () => {
    setRendering(true); setRenderResult(null)
    try {
      const parsed = renderData.trim() ? JSON.parse(renderData) : { canva_id: id, data: {} }
      await fetch(`/api/canvases/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(canvas) })
      const res = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canva_id: parsed.canva_id || id, data: parsed.data || {} }) })
      const r = await res.json()
      if (r.url) setRenderResult(r.url); else toast.error(r.error || 'Render failed')
    } catch (e) { toast.error('Error: ' + e.message) }
    finally { setRendering(false) }
  }

  const dragState = useRef(null)
  const handleMouseDown = (e, node, mode = 'move') => {
    e.stopPropagation(); e.preventDefault()
    if (!selectedIds.includes(node.id)) setSelectedIds([node.id])
    const c = canvasRefObj.current
    const group = node.groupId ? (c?.groups || []).find((g) => g.id === node.groupId) : null
    const moveIds = group ? group.nodeIds.filter((id) => c?.nodes?.some((n) => n.id === id)) : [node.id]
    const origPositions = moveIds.map((id) => {
      const n = c?.nodes?.find((nd) => nd.id === id)
      return n ? { id, x: n.x, y: n.y, width: n.width, height: n.height } : null
    }).filter(Boolean)
    const lead = origPositions.find((p) => p.id === node.id) || origPositions[0]
    dragState.current = {
      nodeId: node.id,
      moveIds,
      origPositions,
      startX: e.clientX,
      startY: e.clientY,
      orig: {
        x: lead.x,
        y: lead.y,
        width: lead.width,
        height: lead.height,
        maxWidth: node.maxWidth || node.width,
        maxHeight: node.maxHeight || node.height,
        rotation: node.rotation || 0,
        cropLeft: node.cropLeft || 0,
        cropRight: node.cropRight || 0,
        cropTop: node.cropTop || 0,
        cropBottom: node.cropBottom || 0,
      },
      mode,
      initialCanvas: c,
      hasMoved: false,
    }
    const onMove = (e) => {
      const ds = dragState.current; if (!ds) return
      const dx = (e.clientX - ds.startX) / scale, dy = (e.clientY - ds.startY) / scale
      if (ds.mode === 'move') {
        const rawX = Math.round(ds.orig.x + dx)
        const rawY = Math.round(ds.orig.y + dy)
        const nodeW = ds.orig.width
        const nodeH = ds.orig.height
        const idsToMove = ds.moveIds || [ds.nodeId]
        const { v, h } = collectSnapTargets(canvasRefObj.current?.nodes, idsToMove, canvas.width, canvas.height)
        const { x: newX, y: newY, lines } = snapMovePosition(rawX, rawY, nodeW, nodeH, v, h)
        setSnapLines(lines)
        const deltaX = newX - ds.orig.x
        const deltaY = newY - ds.orig.y
        const origMap = new Map((ds.origPositions || []).map((p) => [p.id, p]))
        idsToMove.forEach((id) => {
          const o = origMap.get(id)
          if (o) updateNode(id, { x: Math.round(o.x + deltaX), y: Math.round(o.y + deltaY) }, true)
        })
        ds.hasMoved = true
      }
      else if (ds.mode === 'resize') {
        const n = canvasRefObj.current?.nodes?.find((nd) => nd.id === ds.nodeId)
        const isText = n?.type === 'text'
        const isImage = n?.type === 'image'
        
        const cL = isImage ? (ds.orig.cropLeft || 0) : 0
        const cR = isImage ? (ds.orig.cropRight || 0) : 0
        const cT = isImage ? (ds.orig.cropTop || 0) : 0
        const cB = isImage ? (ds.orig.cropBottom || 0) : 0

        const visibleFactorX = (100 - cL - cR) / 100
        const visibleFactorY = (100 - cT - cB) / 100

        const angle = (ds.orig.rotation || 0) * (Math.PI / 180)
        const u = { x: Math.cos(angle), y: Math.sin(angle) }
        const v = { x: -Math.sin(angle), y: Math.cos(angle) }

        const cx = ds.orig.x + ds.orig.width / 2
        const cy = ds.orig.y + ds.orig.height / 2

        const TL = {
          x: cx - (ds.orig.width / 2) * u.x - (ds.orig.height / 2) * v.x,
          y: cy - (ds.orig.width / 2) * u.y - (ds.orig.height / 2) * v.y,
        }

        // Stationary cropped top-left anchor:
        const croppedTL = {
          x: TL.x + (ds.orig.width * cL / 100) * u.x + (ds.orig.height * cT / 100) * v.x,
          y: TL.y + (ds.orig.width * cL / 100) * u.y + (ds.orig.height * cT / 100) * v.y,
        }

        // Original cropped bottom-right handle:
        const croppedBR = {
          x: TL.x + (ds.orig.width * (100 - cR) / 100) * u.x + (ds.orig.height * (100 - cB) / 100) * v.x,
          y: TL.y + (ds.orig.width * (100 - cR) / 100) * u.y + (ds.orig.height * (100 - cB) / 100) * v.y,
        }

        const newCroppedBR = { x: croppedBR.x + dx, y: croppedBR.y + dy }
        const diagCropped = { x: newCroppedBR.x - croppedTL.x, y: newCroppedBR.y - croppedTL.y }

        let newVisibleW = diagCropped.x * u.x + diagCropped.y * u.y
        let newVisibleH = diagCropped.x * v.x + diagCropped.y * v.y

        // Limit minimum visible size to 20px
        newVisibleW = Math.max(20, newVisibleW)
        newVisibleH = Math.max(20, newVisibleH)

        let rawW = Math.round(newVisibleW / visibleFactorX)
        let rawH = Math.round(newVisibleH / visibleFactorY)

        const lockAspect = isImage && (n?.aspectRatio || (ds.orig.width && ds.orig.height))
        const aspect = lockAspect ? (n?.aspectRatio || ds.orig.width / ds.orig.height) : null

        if (lockAspect && aspect) {
          const scaleFactor = Math.max(rawW / ds.orig.width, rawH / ds.orig.height)
          rawW = Math.max(isText ? 40 : 20, Math.round(ds.orig.width * scaleFactor))
          rawH = Math.max(20, Math.round(rawW / aspect))
          newVisibleW = rawW * visibleFactorX
          newVisibleH = rawH * visibleFactorY
        }

        if (n?.maxWidth) rawW = Math.min(rawW, n.maxWidth)
        if (n?.maxHeight) rawH = Math.min(rawH, n.maxHeight)

        let newX = ds.orig.x
        let newY = ds.orig.y
        let lines = []

        if (Math.abs(angle) < 0.01 && !isImage) {
          const { v: targetsV, h: targetsH } = collectSnapTargets(
            canvasRefObj.current?.nodes,
            [ds.nodeId],
            canvas.width,
            canvas.height
          )
          const snapped = snapResizeBox(ds.orig.x, ds.orig.y, rawW, isText ? ds.orig.height : rawH, targetsV, targetsH)
          newX = snapped.x
          newY = snapped.y
          rawW = snapped.w
          rawH = isText ? ds.orig.height : snapped.h
          if (lockAspect && aspect) {
            rawH = Math.max(20, Math.round(rawW / aspect))
          }
          lines = snapped.lines
          setSnapLines(lines)
        } else {
          const newTL = {
            x: croppedTL.x - (rawW * cL / 100) * u.x - (rawH * cT / 100) * v.x,
            y: croppedTL.y - (rawW * cL / 100) * u.y - (rawH * cT / 100) * v.y,
          }
          const newCx = newTL.x + (rawW / 2) * u.x + (rawH / 2) * v.x
          const newCy = newTL.y + (rawW / 2) * u.y + (rawH / 2) * v.y
          newX = Math.round(newCx - rawW / 2)
          newY = Math.round(newCy - rawH / 2)
        }

        if (isText) {
          updateNode(ds.nodeId, { x: newX, y: newY, width: rawW }, true)
        } else {
          updateNode(ds.nodeId, { x: newX, y: newY, width: rawW, height: rawH }, true)
        }
        ds.hasMoved = true
      }
      else if (ds.mode === 'resize-max') {
        const angle = (ds.orig.rotation || 0) * (Math.PI / 180)
        const u = { x: Math.cos(angle), y: Math.sin(angle) }
        const v = { x: -Math.sin(angle), y: Math.cos(angle) }
        
        const cx = ds.orig.x + ds.orig.width / 2
        const cy = ds.orig.y + ds.orig.height / 2
        const TL = {
           x: cx - (ds.orig.width/2)*u.x - (ds.orig.height/2)*v.x,
           y: cy - (ds.orig.width/2)*u.y - (ds.orig.height/2)*v.y
        }
        const BR_max = {
           x: TL.x + ds.orig.maxWidth * u.x + ds.orig.maxHeight * v.x,
           y: TL.y + ds.orig.maxWidth * u.y + ds.orig.maxHeight * v.y
        }
        
        const newBR = { x: BR_max.x + dx, y: BR_max.y + dy }
        const diag = { x: newBR.x - TL.x, y: newBR.y - TL.y }
        
        let newMaxW = Math.max(ds.orig.width, Math.round(diag.x * u.x + diag.y * u.y))
        let newMaxH = Math.max(ds.orig.height, Math.round(diag.x * v.x + diag.y * v.y))
        
        updateNode(ds.nodeId, { maxWidth: newMaxW, maxHeight: newMaxH }, true)
        ds.hasMoved = true
      }
      else if (ds.mode.startsWith('crop-')) {
        const angle = (ds.orig.rotation || 0) * (Math.PI / 180)
        const cosA = Math.cos(angle), sinA = Math.sin(angle)
        // Project screen-space delta into local node axes
        const localDx = dx * cosA + dy * sinA
        const localDy = -dx * sinA + dy * cosA
        let { cropLeft, cropRight, cropTop, cropBottom } = ds.orig
        const pctX = (localDx / ds.orig.width) * 100
        const pctY = (localDy / ds.orig.height) * 100
        if (ds.mode === 'crop-left') {
          cropLeft = Math.max(0, Math.min(100 - cropRight - 5, cropLeft + pctX))
        } else if (ds.mode === 'crop-right') {
          cropRight = Math.max(0, Math.min(100 - cropLeft - 5, cropRight - pctX))
        } else if (ds.mode === 'crop-top') {
          cropTop = Math.max(0, Math.min(100 - cropBottom - 5, cropTop + pctY))
        } else if (ds.mode === 'crop-bottom') {
          cropBottom = Math.max(0, Math.min(100 - cropTop - 5, cropBottom - pctY))
        }
        updateNode(ds.nodeId, {
          cropLeft: Math.round(cropLeft * 10) / 10,
          cropRight: Math.round(cropRight * 10) / 10,
          cropTop: Math.round(cropTop * 10) / 10,
          cropBottom: Math.round(cropBottom * 10) / 10,
        }, true)
        ds.hasMoved = true
      }
      else if (ds.mode === 'rotate') {
        const canvasRect = canvasRef.current?.getBoundingClientRect()
        if (canvasRect) {
           const cx = canvasRect.left + (ds.orig.x + ds.orig.width / 2) * scale
           const cy = canvasRect.top + (ds.orig.y + ds.orig.height / 2) * scale
           const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
           let rotation = Math.round(angle + 90)
           if (rotation < 0) rotation += 360
           if (e.shiftKey || Math.abs(rotation % 45) < 5 || Math.abs(rotation % 45) > 40) {
              rotation = Math.round(rotation / 45) * 45
           }
           if (rotation === 360) rotation = 0
           updateNode(ds.nodeId, { rotation }, true)
           ds.hasMoved = true
        }
      }
    }
    const onUp = () => { 
      const ds = dragState.current
      if (ds && ds.hasMoved) {
        pushHistory(ds.initialCanvas)
      }
      dragState.current = null; setSnapLines([]); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) 
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  if (!canvas) return <div className="h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Loading canvas...</p></div>

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const curlBody = JSON.stringify({ canva_id: id, data: Object.fromEntries((canvas.nodes || []).filter((n) => n.dynamic_key).map((n) => [n.dynamic_key, n.type === 'text' ? 'your text' : 'https://example.com/image.png'])) }, null, 2)
  const curlCmd = `curl -X POST ${origin}/api/render \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ canva_id: id, data: Object.fromEntries((canvas.nodes || []).filter((n) => n.dynamic_key).map((n) => [n.dynamic_key, n.type === 'text' ? 'your text' : 'https://example.com/image.png'])) })}'`

  const canvasColorFilter =
    canvas.colorMode === 'grayscale' ? 'grayscale(100%)' :
    canvas.colorMode === 'sepia' ? 'sepia(80%) saturate(120%)' :
    canvas.colorMode === 'invert' ? 'invert(100%)' :
    canvas.colorMode === 'high-contrast' ? 'contrast(160%)' : 'none'

  const nodeBoxStyle = (node) => {
    const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
    const base = {
      position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
      cursor: 'move', pointerEvents: 'auto',
      outline: 'none',
      display: node.type === 'text' ? 'block' : 'flex', alignItems: node.type === 'text' ? 'normal' : 'center',
      justifyContent: node.textAlign === 'center' ? 'center' : node.textAlign === 'right' ? 'flex-end' : 'flex-start',
      overflow: node.type === 'text' ? 'visible' : 'hidden', userSelect: 'none', whiteSpace: 'pre-wrap',
      transform: `rotate(${node.rotation || 0}deg)`, transformOrigin: 'center center',
    }
    if (node.type === 'text') {
      const ts = clsStyle.textShadow && clsStyle.textShadow.enabled ? clsStyle.textShadow : (node.textShadow && node.textShadow.enabled ? node.textShadow : null)
      return {
        ...base,
        color: clsStyle.color || node.color || '#000', 
        backgroundColor: clsStyle.background || clsStyle.backgroundColor || 'transparent',
        fontSize: node.fontSize || 48, 
        fontWeight: clsStyle.fontWeight || node.fontWeight || 400,
        fontStyle: clsStyle.fontStyle || (node.fontStyle === 'italic' ? 'italic' : 'normal'),
        fontFamily: `'${node.fontFamily || 'Inter'}', sans-serif`,
        lineHeight: node.lineHeight || 1.2,
        letterSpacing: `${clsStyle.letterSpacing || node.letterSpacing || 0}px`,
        textTransform: clsStyle.textTransform || node.textTransform || 'none',
        textDecoration: clsStyle.textDecoration || 'none',
        textAlign: node.textAlign || 'left',
        textShadow: ts ? `${ts.offsetX || 0}px ${ts.offsetY || 0}px ${ts.blur || 0}px ${ts.color || '#000'}` : 'none',
      }
    }
    if (node.type === 'shape') {
      const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      return {
        ...base,
        backgroundColor: clsStyle.fill || node.fill || '#6366f1',
        border: `${clsStyle.strokeWidth ?? node.strokeWidth ?? 0}px solid ${clsStyle.stroke || node.stroke || '#000000'}`,
        borderRadius: (clsStyle.shape || node.shape) === 'ellipse' ? '50%' : (clsStyle.borderRadius ?? node.borderRadius ?? 0),
      }
    }
    if (node.type === 'gradient') {
      const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      const stops = clsStyle.stops || node.stops || [{ color: '#6366f1', position: 0, alpha: 100 }, { color: '#ec4899', position: 100, alpha: 100 }]
      const angle = clsStyle.angle ?? node.angle ?? 90
      const gType = clsStyle.gradientType || node.gradientType || 'linear'
      const shape = clsStyle.shape || node.shape || 'rect'
      
      const stopsStr = stops.map(s => {
        const c = s.color + Math.round((typeof s.alpha === 'number' ? s.alpha : 100) * 2.55).toString(16).padStart(2, '0')
        return `${c} ${s.position}%`
      }).join(', ')
      const bg = gType === 'radial' ? `radial-gradient(circle, ${stopsStr})` : `linear-gradient(${angle}deg, ${stopsStr})`
      
      return {
        ...base,
        background: bg,
        borderRadius: shape === 'ellipse' ? '50%' : (clsStyle.borderRadius ?? node.borderRadius ?? 0),
      }
    }
    if (node.type === 'image') {
      const mask = node.mask || 'none'
      const br = node.borderRadius || 0
      const cL = node.cropLeft || 0
      const cR = node.cropRight || 0
      const cT = node.cropTop || 0
      const cB = node.cropBottom || 0
      const hasClip = cL > 0 || cR > 0 || cT > 0 || cB > 0

      const w = node.width, h = node.height, min = Math.min(w, h)
      const maskRadius = mask === 'circle' ? '50%'
        : mask === 'rounded' ? Math.round(min * 0.15)
        : mask === 'pill' ? Math.round(min * 0.5)
        : br

      const polygonClipMap = {
        triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
        'triangle-down': 'polygon(0% 0%, 100% 0%, 50% 100%)',
        diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        pentagon: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
        hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
        star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
        'arrow-right': 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)',
        parallelogram: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)',
      }
      const polygonClip = polygonClipMap[mask]

      // When a polygon shape is active, apply it on the outer div.
      // Crop is handled by a nested inner div (see canvas render below).
      // When no polygon: use borderRadius + inset clip-path for crop.
      const clipPath = polygonClip
        ? polygonClip
        : hasClip
          ? `inset(${cT}% ${cR}% ${cB}% ${cL}% round ${typeof maskRadius === 'string' ? maskRadius : maskRadius + 'px'})`
          : undefined

      return {
        ...base,
        borderRadius: polygonClip ? 0 : maskRadius,
        overflow: 'hidden',
        ...(clipPath ? { clipPath } : {}),
      }
    }
    return base
  }

  const layerLabel = nodeLayerLabel

  const fontMeta = selected?.type === 'text' ? (FONT_META[selected.fontFamily] || FONT_META['Inter']) : null

  const generateCssFromClasses = () => {
    if (!canvas?.classes) return '';
    let css = '';
    for (const [name, cls] of Object.entries(canvas.classes)) {
      if (cls.type === 'text' || !cls.type) {
        const selector = name.startsWith('.') ? name : `.${name}`
        css += `${selector} { `;
        if (cls.color) css += `color: ${cls.color} !important; `;
        const bg = cls.background || cls.backgroundColor;
        const py = typeof cls.paddingY === 'number' ? cls.paddingY : 0
        const px = typeof cls.paddingX === 'number' ? cls.paddingX : 0
        const showBgBox = isVisibleBackground(bg) && (px !== 0 || py !== 0)
        if (cls.fontWeight) css += `font-weight: ${cls.fontWeight} !important; `;
        if (cls.fontStyle) css += `font-style: ${cls.fontStyle} !important; `;
        if (cls.letterSpacing) css += `letter-spacing: ${cls.letterSpacing}px !important; `;
        if (cls.textTransform) css += `text-transform: ${cls.textTransform} !important; `;
        if (cls.textDecoration) css += `text-decoration: ${cls.textDecoration} !important; `;
        if (cls.textShadow?.enabled) css += `text-shadow: ${cls.textShadow.offsetX||0}px ${cls.textShadow.offsetY||0}px ${cls.textShadow.blur||0}px ${cls.textShadow.color||'#000'} !important; `;
        if (showBgBox) {
          css += `background-color: ${bg} !important; `
          css += `padding: ${py}px ${px}px !important; `
          css += `line-height: 1 !important; `
          if (cls.borderRadius != null) css += `border-radius: ${cls.borderRadius}px !important; `;
          if (cls.boxShadow?.enabled) css += `box-shadow: ${cls.boxShadow.offsetX||0}px ${cls.boxShadow.offsetY||0}px ${cls.boxShadow.blur||0}px ${cls.boxShadow.color||'#000'} !important; `;
        }
        css += `display: inline !important; vertical-align: baseline !important; line-height: inherit !important; `;
        css += `box-decoration-break: clone !important; -webkit-box-decoration-break: clone !important; `;
        css += `}\n`;
      }
    }
    return css;
  }

  return (
    <div className="h-screen flex flex-col bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground relative"
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDraggingOverBase(true); }}
      onDragLeave={(e) => {
        // Only set false if we are actually leaving the root element, not entering a child
        if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingOverBase(false);
      }}
      onDrop={(e) => { e.preventDefault(); setIsDraggingOverBase(false); handleDrop(e); }}>
      
      <style>{generateCssFromClasses()}</style>
      
      {selectionRect && editingId && (() => {
        const editingNode = canvas.nodes?.find(n => n.id === editingId);
        const nodeColor = editingNode?.color || '#000000';
        const textClasses = Object.entries(canvas.classes || {}).filter(([_, c]) => c.type === 'text' || !c.type);
        const btnBase = 'w-7 h-7 rounded flex items-center justify-center transition-colors';
        const btnActive = 'bg-foreground text-background';
        const btnInactive = 'hover:bg-muted';
        return (
          <div
            data-floating-toolbar="true"
            style={{
              position: 'fixed',
              top: selectionRect.top - 52,
              left: Math.max(8, Math.min(window.innerWidth - 500, selectionRect.left + selectionRect.width / 2 - 250)),
              zIndex: 99999
            }}
            className="bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.85)] dark:shadow-[6px_6px_0_0_rgba(212,255,0,0.3)] border-2 border-foreground/90 rounded-xl px-2 py-1.5 flex gap-0.5 items-center"
            onPointerDown={(e) => e.preventDefault()}
          >
            {/* Class selector — always shown, all classes */}
            <select
              className="h-7 border rounded text-[10px] px-1.5 bg-background max-w-[90px] truncate"
              onChange={(e) => { if (e.target.value) { applyAdHocClass(e.target.value); e.target.value = ''; } }}
              onPointerDown={(e) => e.stopPropagation()}
              defaultValue=""
            >
              <option value="">{textClasses.length > 0 ? 'Class…' : '(no classes)'}</option>
              {textClasses.map(([name]) => (
                <option key={name} value={name}>{name.startsWith('.') ? name.slice(1) : name}</option>
              ))}
            </select>

            <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />

            {/* Bold / Italic / Underline */}
            <button className={`${btnBase} ${textFormat.bold ? btnActive : btnInactive}`} title="Bold (Ctrl+B)" onClick={() => applyAdHocStyle('fontWeight', 'bold')}><Bold className="w-3.5 h-3.5" /></button>
            <button className={`${btnBase} ${textFormat.italic ? btnActive : btnInactive}`} title="Italic (Ctrl+I)" onClick={() => applyAdHocStyle('fontStyle', 'italic')}><Italic className="w-3.5 h-3.5" /></button>
            <button className={`${btnBase} ${textFormat.underline ? btnActive : btnInactive}`} title="Underline (Ctrl+U)" onClick={() => applyAdHocStyle('textDecoration', 'underline')}><Underline className="w-3.5 h-3.5" /></button>

            <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />

            {/* Align */}
            <button className={`${btnBase} ${textFormat.align === 'left' ? btnActive : btnInactive}`} title="Align left" onClick={() => applyAdHocStyle('textAlign', 'left')}><AlignLeft className="w-3.5 h-3.5" /></button>
            <button className={`${btnBase} ${textFormat.align === 'center' ? btnActive : btnInactive}`} title="Align center" onClick={() => applyAdHocStyle('textAlign', 'center')}><AlignCenter className="w-3.5 h-3.5" /></button>
            <button className={`${btnBase} ${textFormat.align === 'right' ? btnActive : btnInactive}`} title="Align right" onClick={() => applyAdHocStyle('textAlign', 'right')}><AlignRight className="w-3.5 h-3.5" /></button>

            <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />

            {/* Color — small swatch + native color picker + hex input */}
            <div className="flex items-center gap-1" title="Text color">
              <ColorInput
                className="w-32"
                value={textFormat.color || nodeColor || '#000000'}
                onChange={(val) => {
                  setTextFormat(prev => ({ ...prev, color: val }));
                  applyAdHocStyle('color', val);
                }}
              />
            </div>

            <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />

            {/* Font size */}
            <div className="flex items-center gap-0.5" title="Font size in px — press Enter">
              <span className="text-[10px] text-muted-foreground">Size</span>
              <input
                type="number"
                min={6} max={400}
                placeholder={editingNode?.fontSize || 48}
                className="w-12 h-7 text-[10px] text-center border rounded bg-background px-1"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v > 0) { applyAdHocStyle('fontSize', `${v}px`); e.target.value = ''; }
                  }
                }}
              />
            </div>
          </div>
        );
      })()}

      
      {isDraggingOverBase && (
        <div className="absolute inset-0 z-[100] bg-[#D4FF00]/15 border-4 border-dashed border-foreground/90 flex items-center justify-center pointer-events-none transition-all">
          <div className="bg-card border-2 border-foreground/90 px-8 py-6 rounded-2xl shadow-[8px_8px_0_0_rgba(0,0,0,0.85)] dark:shadow-[8px_8px_0_0_rgba(212,255,0,0.35)] flex flex-col items-center">
            <Upload className="w-12 h-12 text-foreground mb-3 animate-bounce" />
            <h2 className="text-2xl" style={BEBAS}>DROP IMAGES</h2>
            <p className="text-xs uppercase tracking-widest text-foreground/60 mt-1">Upload to your session library</p>
          </div>
        </div>
      )}
      <div ref={measureRef} aria-hidden="true" style={{ position: 'fixed', visibility: 'hidden', pointerEvents: 'none', left: -99999, top: -99999, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] px-4 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="hover:bg-[#D4FF00] hover:text-foreground shrink-0" onClick={() => router.push('/')} title="Back to studio"><ArrowLeft className="w-4 h-4" /></Button>
          <KandLogo size={30} />
          <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-0.5 border border-foreground/80 rounded-full text-[10px] font-semibold uppercase tracking-widest shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9AB800] animate-pulse" />
            Editor
          </div>
          <Input
            value={canvas.name}
            onChange={(e) => setCanvas({ ...canvas, name: e.target.value })}
            className="w-48 sm:w-64 font-semibold border-2 border-foreground/20 rounded-lg bg-card focus-visible:ring-[#D4FF00]"
          />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button variant="ghost" size="icon" className="hover:bg-[#D4FF00] hover:text-foreground" onClick={undo} disabled={historyRef.current.past.length === 0} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="hover:bg-[#D4FF00] hover:text-foreground" onClick={redo} disabled={historyRef.current.future.length === 0} title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-foreground/20 mx-0.5 hidden sm:block" />
          <div className="flex items-center gap-0.5 border-2 border-foreground/20 rounded-lg bg-card px-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => { userZoomRef.current = true; setScale((s) => Math.min(MAX_ZOOM, s * (1 + ZOOM_STEP))) }} title="Zoom in (Ctrl+scroll)"><ZoomIn className="w-3.5 h-3.5" /></Button>
            <span className="text-[10px] font-mono w-10 text-center tabular-nums text-foreground/80">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => { userZoomRef.current = true; setScale((s) => Math.max(MIN_ZOOM, s * (1 - ZOOM_STEP))) }} title="Zoom out (Ctrl+scroll)"><ZoomOut className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[#D4FF00] hover:text-foreground" onClick={fitCanvasToView} title="Fit to view"><Maximize2 className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="w-px h-6 bg-foreground/20 mx-0.5 hidden sm:block" />
          <ThemeToggle />
          <Button variant="outline" size="sm" className="hidden md:inline-flex border-2 border-foreground/30 rounded-full font-semibold" onClick={() => setApiDialog(true)}><Code2 className="w-4 h-4 mr-1.5" />API</Button>
          <Button variant="outline" size="sm" className="hidden lg:inline-flex border-2 border-foreground/30 rounded-full font-semibold" onClick={() => setRenderDialog(true)}><Play className="w-4 h-4 mr-1.5" />Render</Button>
          <Button variant="outline" size="sm" className="hidden md:inline-flex border-2 border-foreground/30 rounded-full font-semibold" onClick={() => {
            const { _id, createdAt, updatedAt, ...exportData } = canvas
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${(canvas.name || 'canvas').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.kand.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Exported')
          }}><Download className="w-4 h-4 mr-1.5" />Export</Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!hasChanges}
            className={`rounded-full px-5 font-semibold ${hasChanges ? 'bg-foreground text-background hover:bg-foreground/85' : 'bg-muted text-muted-foreground'}`}
          >
            <Save className="w-4 h-4 mr-1.5" />{hasChanges ? 'Save' : 'Saved'}
          </Button>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={18} minSize={14} maxSize={32} className="min-w-0">
        <Tabs defaultValue="design" className="h-full w-full border-r-2 border-foreground/90 bg-card flex flex-col min-h-0">
          <TabsList className="grid grid-cols-2 rounded-none border-b-2 border-foreground/90 h-11 bg-[#FAF7F2] dark:bg-[#0E0D0B] p-0">
            <TabsTrigger value="design" className="rounded-none data-[state=active]:bg-card data-[state=active]:border-b-2 data-[state=active]:border-[#D4FF00] font-bold tracking-widest text-xs uppercase">Design</TabsTrigger>
            <TabsTrigger value="classes" className="rounded-none data-[state=active]:bg-card data-[state=active]:border-b-2 data-[state=active]:border-[#D4FF00] font-bold tracking-widest text-xs uppercase">Classes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="design" className="flex-1 flex flex-col p-3 m-0 space-y-1 min-h-0">
            <p className="text-lg leading-none mb-2" style={BEBAS}>ADD</p>
          <div className="space-y-1.5">
            <Button variant="outline" className="w-full justify-start border-2 border-foreground/25 hover:bg-[#D4FF00] hover:text-foreground hover:border-foreground/90" onClick={addText}><Type className="w-4 h-4 mr-2" /> Text</Button>
            <Button variant="outline" className="w-full justify-start border-2 border-foreground/25 hover:bg-[#D4FF00] hover:text-foreground hover:border-foreground/90" onClick={openImageDialog}><ImageIcon className="w-4 h-4 mr-2" /> Image</Button>
            <Button variant="outline" className="w-full justify-start border-2 border-foreground/25 hover:bg-[#D4FF00] hover:text-foreground hover:border-foreground/90" onClick={addGradient}><Palette className="w-4 h-4 mr-2" /> Gradient</Button>
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="border-2 border-foreground/25 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => addShape('rect')}><Square className="w-4 h-4 mr-1" /> Rect</Button>
              <Button variant="outline" size="sm" className="border-2 border-foreground/25 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => addShape('ellipse')}><Circle className="w-4 h-4 mr-1" /> Circle</Button>
            </div>
          </div>
          <div className={`mt-5 pt-4 border-t-2 border-foreground/15 flex-col ${sessionImages.length > 0 ? 'flex-[0.5]' : 'flex-1'} min-h-0 flex`}>
            <div className="flex items-center justify-between mb-2 gap-1">
              <p className="text-lg leading-none" style={BEBAS}>LAYERS</p>
              {selectedIds.length >= 2 && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[10px] px-2 border-2" onClick={createGroupFromSelection}>
                  <Group className="w-3 h-3 mr-1" />Group
                </Button>
              )}
            </div>
            <p className="text-[9px] text-muted-foreground mb-2">Ctrl+click to multi-select. Drag into groups for HTML flow.</p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {groups.map((g) => {
                const expanded = expandedGroups[g.id] !== false
                const nodeMap = new Map((canvas.nodes || []).map((n) => [n.id, n]))
                const addTarget = { type: 'group-add', groupId: g.id }
                return (
                  <div key={g.id} className="rounded-lg border-2 border-foreground/20 overflow-hidden">
                    <div
                      className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-sm ${selectedGroupId === g.id ? 'bg-[#D4FF00]/50' : 'bg-muted/40 hover:bg-muted/60'} ${layerDropActive(addTarget) ? 'ring-2 ring-inset ring-[#9AB800]' : ''}`}
                      onClick={() => selectGroup(g.id)}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLayerDropTarget(addTarget) }}
                      onDragLeave={(e) => { e.stopPropagation(); if (layerDropTarget?.type === 'group-add' && layerDropTarget?.groupId === g.id) setLayerDropTarget(null) }}
                      onDrop={(e) => handleLayerDropEvent(e, addTarget)}
                    >
                      <button type="button" className="p-0.5" onClick={(e) => { e.stopPropagation(); toggleGroupExpanded(g.id) }}>
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <Folder className="w-3.5 h-3.5 shrink-0 text-foreground/70" />
                      <span className="flex-1 truncate font-semibold text-xs">{g.name}</span>
                      <span className="text-[10px] text-muted-foreground">{g.nodeIds.length}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Ungroup" onClick={(e) => { e.stopPropagation(); ungroupById(g.id) }}>
                        <Unlink className="w-3 h-3" />
                      </Button>
                    </div>
                    {expanded && g.nodeIds.map((nid) => {
                      const n = nodeMap.get(nid)
                      if (!n) return null
                      const beforeTarget = { type: 'group-before', groupId: g.id, nodeId: nid }
                      return (
                        <div key={nid}
                          draggable
                          onDragStart={(e) => handleLayerDragStart(nid, g.id, e)}
                          onDragEnd={handleLayerDragEnd}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setLayerDropTarget(beforeTarget) }}
                          onDragLeave={(e) => { e.stopPropagation(); if (layerDropActive(beforeTarget)) setLayerDropTarget(null) }}
                          onDrop={(e) => handleLayerDropEvent(e, beforeTarget)}
                          onClick={(e) => { e.stopPropagation(); selectLayer(nid, e) }}
                          className={`flex items-center gap-2 pl-4 pr-2 py-1.5 border-t border-foreground/10 cursor-grab active:cursor-grabbing text-sm relative ${selectedIds.includes(nid) ? 'bg-[#D4FF00]/30 font-medium' : 'hover:bg-foreground/5'} ${layerDropActive(beforeTarget) ? 'border-t-2 border-[#9AB800]' : ''}`}>
                          <GripVertical className="w-3 h-3 text-muted-foreground opacity-50 shrink-0" />
                          <LayerPreview node={n} />
                          <span className={`flex-1 min-w-0 truncate text-xs`}>{layerLabel(n)}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {layerDragSource?.fromGroupId && (
                <div
                  className={`rounded-lg border-2 border-dashed px-2 py-2 text-[10px] text-center text-muted-foreground transition ${layerDropActive({ type: 'ungroup' }) ? 'border-[#9AB800] bg-[#D4FF00]/20 text-foreground' : 'border-foreground/25'}`}
                  onDragOver={(e) => { e.preventDefault(); setLayerDropTarget({ type: 'ungroup' }) }}
                  onDragLeave={() => { if (layerDropTarget?.type === 'ungroup') setLayerDropTarget(null) }}
                  onDrop={(e) => handleLayerDropEvent(e, { type: 'ungroup' })}
                >
                  Drop here to remove from group
                </div>
              )}
              {(canvas.nodes || []).slice().reverse().filter((n) => !n.groupId).map((n) => {
                const beforeTarget = { type: 'ungrouped-before', nodeId: n.id }
                return (
                <div key={n.id}
                  draggable
                  onDragStart={(e) => handleLayerDragStart(n.id, null, e)}
                  onDragOver={(e) => { e.preventDefault(); setLayerDropTarget(beforeTarget); if (dragOverId !== n.id) setDragOverId(n.id) }}
                  onDragLeave={(e) => { if (dragOverId === n.id) setDragOverId(null); if (layerDropActive(beforeTarget)) setLayerDropTarget(null) }}
                  onDrop={(e) => handleLayerDropEvent(e, beforeTarget)}
                  onDragEnd={handleLayerDragEnd}
                  onClick={(e) => selectLayer(n.id, e)}
                  className={`flex items-center gap-2.5 px-2 py-2 rounded-lg border-2 cursor-grab active:cursor-grabbing text-sm transition relative ${selectedIds.includes(n.id) ? 'bg-[#D4FF00]/40 border-foreground/90 font-semibold' : 'border-transparent hover:bg-foreground/5 hover:border-foreground/20'} ${layerDropActive(beforeTarget) || dragOverId === n.id ? 'border-t-2 border-[#9AB800]' : ''}`}>
                  <GripVertical className="w-3 h-3 text-muted-foreground opacity-60 shrink-0" />
                  <LayerPreview node={n} />
                  <span className={`flex-1 min-w-0 ${n.type === 'text' ? 'text-xs leading-snug line-clamp-2' : 'truncate'}`}>{layerLabel(n)}</span>
                  {n.dynamic_key && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded shrink-0">DYN</span>}
                </div>
              )})}
            </div>
          </div>

          {sessionImages.length > 0 && (
            <div className="mt-3 pt-3 border-t-2 border-foreground/15 flex-[0.5] min-h-0 flex flex-col">
              <p className="text-lg leading-none mb-2 flex items-center justify-between" style={BEBAS}>
                <span>ASSETS</span>
                <span className="bg-[#D4FF00] text-foreground text-[10px] px-1.5 py-0.5 rounded-full border border-foreground/90 font-sans font-bold">{sessionImages.length}</span>
              </p>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start pr-1 pb-2">
                {sessionImages.map((src, i) => (
                  <div key={i} className="aspect-square rounded border overflow-hidden cursor-pointer hover:border-primary transition group relative" onClick={() => insertImageNode(src)}>
                    <img src={src} alt="upload" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Plus className="text-white w-5 h-5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </TabsContent>
          <TabsContent value="classes" className="flex-1 overflow-y-auto p-3 m-0 min-h-0">
            <ClassesPanel canvas={canvas} setCanvas={setCanvas} />
          </TabsContent>
        </Tabs>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-foreground/20 w-0.5" />

        <ResizablePanel defaultSize={58} minSize={35} className="min-w-0">
        <div
          ref={canvasViewportRef}
          className="h-full w-full overflow-auto flex items-center justify-center p-6 bg-[#FAF7F2] dark:bg-[#0E0D0B]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.08) 1px, transparent 0)', backgroundSize: '20px 20px' }}
          onMouseDown={() => clearSelection()}
          onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDraggingOverBase(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDraggingOverBase(false); }}
          onDrop={(e) => { e.preventDefault(); setIsDraggingOverBase(false); handleRootDrop(e); }}>
          <div ref={canvasRef} className="relative border-2 border-foreground/90 shadow-md"
            style={{ width: canvas.width * scale, height: canvas.height * scale, background: canvas.background || '#ffffff', filter: canvasColorFilter }}>
            <div style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
              {/* Clipped content — nodes only visible inside the paper */}
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              {(canvas.nodes || []).map((node) => (
                <div key={node.id} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {selectedIds.includes(node.id) && (node.maxWidth || node.maxHeight) && (
                    <div style={{
                      position: 'absolute', left: node.x, top: node.y,
                      width: node.maxWidth || node.width, height: node.maxHeight || node.height,
                      border: '2px dashed #ec4899', pointerEvents: 'none', zIndex: 10,
                      transform: `rotate(${node.rotation || 0}deg)`, transformOrigin: 'top left', // Note: maxbox aligns with node x,y so origin must be top left if we wanted it to rotate exactly with the node, but wait: the node rotates around center!
                      // If node rotates around center, top-left is not the same. 
                      // Simpler: don't rotate the max box, or rotate it with the same center.
                    }} />
                  )}
                  {selectedIds.includes(node.id) && (node.maxWidth || node.maxHeight) && (
                    <div style={{
                      position: 'absolute', left: node.x, top: node.y,
                      width: node.maxWidth || node.width, height: node.maxHeight || node.height,
                      transform: `rotate(${node.rotation || 0}deg)`, transformOrigin: `${node.width / 2}px ${node.height / 2}px`,
                      border: '2px dashed #ec4899', pointerEvents: 'none', zIndex: 10
                    }}>
                      <div onMouseDown={(e) => handleMouseDown(e, node, 'resize-max')}
                        style={{ pointerEvents: 'auto', position: 'absolute', right: -8, bottom: -8, width: 16, height: 16, background: '#fff', border: '2px solid #ec4899', borderRadius: 0, cursor: 'nwse-resize' }} />
                    </div>
                  )}

                  <div
                    data-node-id={node.id}
                    onMouseDown={(e) => {
                      if (editingId === node.id) return
                      handleMouseDown(e, node, 'move')
                    }}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (editingId === node.id) return
                    if (e.altKey) {
                      const elements = document.elementsFromPoint(e.clientX, e.clientY)
                      const nodeIds = elements.map(el => el.getAttribute('data-node-id')).filter(Boolean)
                      if (nodeIds.length > 1) {
                        const currentIdx = nodeIds.indexOf(primarySelectedId)
                        if (currentIdx !== -1 && currentIdx + 1 < nodeIds.length) selectLayer(nodeIds[currentIdx + 1])
                        else selectLayer(nodeIds[0])
                      } else {
                        selectLayer(node.id)
                      }
                    } else {
                      selectLayer(node.id) 
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (node.type === 'text') setEditingId(node.id)
                  }}
                   className={node.className ? (node.className.startsWith('.') ? node.className.slice(1) : node.className) : ''}
                  style={{...nodeBoxStyle(node), opacity: editingId === node.id ? 0 : 1}}>
                  {node.type === 'text' ? (() => {
                    const lines = splitTokensByNewlines(parseStyledText(node.text || '', canvas.classes || {}))
                    return lines.map((lineTokens, i) => (
                      <div key={i} style={{ width: '100%', whiteSpace: 'pre-wrap', lineHeight: node.lineHeight || 1.2, textAlign: node.textAlign || 'left' }}>
                        {renderStyledText(lineTokens, createElement, { canvasClasses: canvas.classes || {} })}
                      </div>
                    ))
                  })() :
                   node.type === 'image' && node.src ? (() => {
                     const hasPoly = ['triangle','triangle-down','diamond','pentagon','hexagon','star','arrow-right','parallelogram'].includes(node.mask)
                     const cL = node.cropLeft || 0, cR = node.cropRight || 0
                     const cT = node.cropTop || 0, cB = node.cropBottom || 0
                     const hasCrop = cL > 0 || cR > 0 || cT > 0 || cB > 0
                     const imgEl = <img src={node.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: buildFilterCss(node.filters) }} draggable={false} />
                     // When polygon + crop: nest a crop div inside so both clip-paths apply
                     if (hasPoly && hasCrop) {
                       return (
                         <div style={{
                           position: 'absolute',
                           top: `${cT}%`, left: `${cL}%`,
                           right: `${cR}%`, bottom: `${cB}%`,
                           overflow: 'hidden',
                         }}>
                           <img src={node.src} alt="" style={{ position: 'absolute', top: `-${cT / (100 - cT - cB) * 100}%`, left: `-${cL / (100 - cL - cR) * 100}%`, width: `${100 * 100 / (100 - cL - cR)}%`, height: `${100 * 100 / (100 - cT - cB)}%`, objectFit: 'cover', filter: buildFilterCss(node.filters) }} draggable={false} />
                         </div>
                       )
                     }
                     return imgEl
                   })() :
                   node.type === 'image' ? <div style={{ width: '100%', height: '100%', background: '#e5e7eb' }} /> : null}
                  {/* Handles and Drag surface are now moved to the Selection Overlay below */}
                </div>
                </div>
              ))}
              </div>

              {/* Unclipped overlay — selection outline & handles visible outside paper (Canva-style) */}
              <div style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
              
              {/* Selection Overlay (handles drag, resize, rotate, and stays on top!) */}
              {selectedGroupId && (() => {
                const g = groups.find((gr) => gr.id === selectedGroupId)
                const bounds = g ? getGroupBounds(canvas.nodes, g) : null
                if (!bounds) return null
                return (
                  <div style={{
                    position: 'absolute', left: bounds.x - 4, top: bounds.y - 4,
                    width: bounds.width + 8, height: bounds.height + 8,
                    border: '2px dashed #9AB800', pointerEvents: 'none', zIndex: 40,
                  }} />
                )
              })()}

              {selectedIds.filter((id) => canvas.nodes?.some((n) => n.id === id) && editingId !== id).map((sid) => {
                const node = canvas.nodes.find((n) => n.id === sid)
                if (!node) return null
                const isPrimary = sid === primarySelectedId
                const isImage = node.type === 'image'
                const cL = isImage ? (node.cropLeft || 0) : 0
                const cR = isImage ? (node.cropRight || 0) : 0
                const cT = isImage ? (node.cropTop || 0) : 0
                const cB = isImage ? (node.cropBottom || 0) : 0
                const hasCrop = cL > 0 || cR > 0 || cT > 0 || cB > 0
                // Cropped visible dimensions
                const cropW = hasCrop ? node.width * (100 - cL - cR) / 100 : node.width
                const cropH = hasCrop ? node.height * (100 - cT - cB) / 100 : node.height
                // Offset from node origin to crop origin
                const offsetX = hasCrop ? node.width * cL / 100 : 0
                const offsetY = hasCrop ? node.height * cT / 100 : 0
                // The overlay is positioned at the cropped top-left and sized to the cropped area
                const overlayLeft = node.x + offsetX
                const overlayTop = node.y + offsetY
                // Transform origin must be relative to the original node center for correct rotation
                const originX = (node.width / 2) - offsetX
                const originY = (node.height / 2) - offsetY
                const isCropMode = cropModeNodeId === node.id
                return (
                  <div key={sid} style={{
                    position: 'absolute', left: overlayLeft, top: overlayTop, width: cropW, height: cropH,
                    transform: `rotate(${node.rotation || 0}deg)`,
                    transformOrigin: `${originX}px ${originY}px`,
                    outline: isCropMode ? '2px dashed #f59e0b' : (isPrimary ? '3px solid #6366f1' : '2px dashed #6366f1'),
                    outlineOffset: 2,
                    pointerEvents: 'none', zIndex: isPrimary ? 50 : 45,
                  }}>
                    <div
                      data-node-id={node.id}
                      onMouseDown={(e) => handleMouseDown(e, node, 'move')}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        if (node.type === 'text') setEditingId(node.id)
                        if (isImage && isPrimary) setCropModeNodeId(node.id)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (e.altKey) {
                          const elements = document.elementsFromPoint(e.clientX, e.clientY)
                          const nodeIds = elements.map((el) => el.getAttribute('data-node-id')).filter(Boolean)
                          if (nodeIds.length > 1) {
                            const currentIdx = nodeIds.indexOf(primarySelectedId)
                            if (currentIdx !== -1 && currentIdx + 1 < nodeIds.length) selectLayer(nodeIds[currentIdx + 1])
                            else selectLayer(nodeIds[0])
                          } else selectLayer(node.id)
                        }
                      }}
                      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: isCropMode ? 'crosshair' : 'move' }}
                    />
                    {/* Normal resize / rotate handles (hidden in crop mode) */}
                    {isPrimary && !isCropMode && (
                      <>
                        <div onMouseDown={(e) => handleMouseDown(e, node, 'resize')}
                          style={{ position: 'absolute', right: -8, bottom: -8, width: 20, height: 20, background: '#6366f1', borderRadius: 4, cursor: 'nwse-resize', border: '2px solid white', pointerEvents: 'auto' }} />
                        <div onMouseDown={(e) => handleMouseDown(e, node, 'rotate')}
                          style={{ position: 'absolute', left: '50%', top: -36, width: 16, height: 16, marginLeft: -8, background: '#fff', borderRadius: '50%', cursor: 'grab', border: '2px solid #6366f1', pointerEvents: 'auto' }} />
                        <div style={{ position: 'absolute', left: '50%', top: -20, width: 2, height: 20, marginLeft: -1, background: '#6366f1', pointerEvents: 'none' }} />
                      </>
                    )}
                    {/* Crop handles — shown only in crop mode */}
                    {isPrimary && isCropMode && (
                      <>
                        {/* Left edge */}
                        <div onMouseDown={(e) => handleMouseDown(e, node, 'crop-left')}
                          style={{ position: 'absolute', left: -4, top: '20%', width: 8, height: '60%', background: '#f59e0b', borderRadius: 3, cursor: 'ew-resize', pointerEvents: 'auto', opacity: 0.9 }} />
                        {/* Right edge */}
                        <div onMouseDown={(e) => handleMouseDown(e, node, 'crop-right')}
                          style={{ position: 'absolute', right: -4, top: '20%', width: 8, height: '60%', background: '#f59e0b', borderRadius: 3, cursor: 'ew-resize', pointerEvents: 'auto', opacity: 0.9 }} />
                        {/* Top edge */}
                        <div onMouseDown={(e) => handleMouseDown(e, node, 'crop-top')}
                          style={{ position: 'absolute', top: -4, left: '20%', height: 8, width: '60%', background: '#f59e0b', borderRadius: 3, cursor: 'ns-resize', pointerEvents: 'auto', opacity: 0.9 }} />
                        {/* Bottom edge */}
                        <div onMouseDown={(e) => handleMouseDown(e, node, 'crop-bottom')}
                          style={{ position: 'absolute', bottom: -4, left: '20%', height: 8, width: '60%', background: '#f59e0b', borderRadius: 3, cursor: 'ns-resize', pointerEvents: 'auto', opacity: 0.9 }} />
                        {/* Exit crop mode button */}
                        <div onClick={(e) => { e.stopPropagation(); setCropModeNodeId(null) }}
                          style={{ position: 'absolute', top: -28, right: 0, background: '#f59e0b', color: '#000', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', pointerEvents: 'auto', whiteSpace: 'nowrap' }}>
                          ✓ Done
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
              
              {editingId && canvas.nodes?.find(n => n.id === editingId) && (
                (() => {
                  const enode = canvas.nodes.find(n => n.id === editingId)
                  
                  return (
                    <div
                      id={`editor-${enode.id}`}
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      className={`absolute bg-transparent outline-none p-0 m-0 resize-none overflow-visible ${enode.className ? (enode.className.startsWith('.') ? enode.className.slice(1) : enode.className) : ''}`}
                      style={{
                        left: enode.x, top: enode.y, width: enode.width, height: enode.height,
                        color: enode.color || '#000', fontSize: enode.fontSize || 48, fontWeight: enode.fontWeight || 400,
                        fontStyle: enode.fontStyle === 'italic' ? 'italic' : 'normal',
                        fontFamily: `'${enode.fontFamily || 'Inter'}', sans-serif`,
                        textAlign: enode.textAlign || 'left', lineHeight: enode.lineHeight || 1.2, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        textShadow: enode.textShadow?.enabled ? `${enode.textShadow.offsetX || 0}px ${enode.textShadow.offsetY || 0}px ${enode.textShadow.blur || 0}px ${enode.textShadow.color || '#000'}` : 'none',
                        outline: '2px solid #6366f1', outlineOffset: 2,
                        zIndex: 50, cursor: 'text'
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={handleSelectionChange}
                      onKeyUp={handleSelectionChange}
                      onBlur={(e) => {
                        updateNode(enode.id, { text: htmlToTags(e.target.innerHTML) });
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Escape') { setEditingId(null); setSelectionRect(null); }
                      }}
                      onPaste={(e) => {
                        e.preventDefault()
                        const text = e.clipboardData.getData('text/plain')
                        if (!text) return
                        // Clear any existing content and just set plain text
                        editorRef.current.innerHTML = ''
                        const textNode = document.createTextNode(text)
                        editorRef.current.appendChild(textNode)
                        
                        // Move cursor to end
                        const range = document.createRange()
                        range.setStart(textNode, text.length)
                        range.collapse(true)
                        const sel = window.getSelection()
                        sel.removeAllRanges()
                        sel.addRange(range)
                        
                        // Update the node - convert to simple text without any formatting
                        updateNode(enode.id, { text: text })
                      }}
                    />
                  )
                })()
              )}
              {selected && selected.dynamic_key && (
                <div style={{ position: 'absolute', left: selected.x, top: selected.y - 32, fontSize: 16, color: '#fff', background: '#6366f1', padding: '4px 10px', borderRadius: 4, fontWeight: 500, pointerEvents: 'none', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {`{${selected.dynamic_key}}`}
                </div>
              )}
              {snapLines.map((line, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  background: '#ec4899',
                  zIndex: 9999,
                  ...(line.type === 'v' ? { left: line.pos, top: 0, bottom: 0, width: 1 } : { top: line.pos, left: 0, right: 0, height: 1 })
                }} />
              ))}
              </div>
            </div>
          </div>
        </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-foreground/20 w-0.5" />

        <ResizablePanel defaultSize={24} minSize={16} maxSize={40} className="min-w-0">
        <div className="h-full border-l-2 border-foreground/90 bg-card p-4 overflow-y-auto">
          {selectedGroup ? (
            <GroupPropertiesPanel
              group={selectedGroup}
              nodes={canvas.nodes}
              selectedIds={selectedIds}
              updateGroup={updateGroup}
              updateGroupGap={updateGroupGap}
              ungroupById={ungroupById}
              moveGroupMember={moveGroupMember}
            />
          ) : selectedIds.length > 1 ? (
            <div className="space-y-3">
              <p className="text-2xl leading-none" style={BEBAS}>{selectedIds.length} SELECTED</p>
              <p className="text-sm text-muted-foreground">Ctrl+click layers to add or remove from selection.</p>
              <Button className="w-full" onClick={createGroupFromSelection}><Group className="w-4 h-4 mr-2" />Create group</Button>
              <Button variant="outline" className="w-full" onClick={clearSelection}>Clear selection</Button>
            </div>
          ) : !selected ? (
            <CanvasSettingsPanel canvas={canvas} setCanvas={setCanvas} />
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-foreground/15">
                <p className="text-2xl leading-none" style={BEBAS}>
                  {selected.type === 'text' ? 'TEXT' : selected.type === 'image' ? 'IMAGE' : selected.type === 'gradient' ? 'GRADIENT' : 'SHAPE'}
                </p>
                <Button variant="ghost" size="icon" className="hover:bg-destructive hover:text-destructive-foreground" onClick={() => deleteNode(selected.id)} title="Delete layer"><Trash2 className="w-4 h-4" /></Button>
              </div>

              <div className="flex gap-1 mb-3 pb-3 border-b">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => moveNode(selected.id, 'front')} title="Bring to front"><ChevronsUp className="w-3.5 h-3.5" /></Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => moveNode(selected.id, 'forward')} title="Bring forward"><ChevronUp className="w-3.5 h-3.5" /></Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => moveNode(selected.id, 'backward')} title="Send backward"><ChevronDown className="w-3.5 h-3.5" /></Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => moveNode(selected.id, 'back')} title="Send to back"><ChevronsDown className="w-3.5 h-3.5" /></Button>
              </div>

              <div className="space-y-3">
                {selected.type === 'text' && (
                  <TextProperties node={selected} updateNode={updateNode} meta={fontMeta} canvas={canvas} editorRef={editorRef} savedRangeRef={savedRangeRef} htmlToTags={htmlToTags} editingId={editingId} />
                )}
                {selected.type === 'image' && (
                  <ImageProperties node={selected} updateNode={updateNode} setCropModeNodeId={setCropModeNodeId}
                    onReplace={(src) => updateNode(selected.id, { src })}
                    onReplaceUpload={async (file) => {
                      if (!file) return
                      if (file.size > 6 * 1024 * 1024) return toast.error('Image too large (max 6MB)')
                      setUploading(true)
                      try {
                        const reader = new FileReader()
                        const dataUrl = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
                        const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
                        const result = await res.json()
                        if (result.url) { updateNode(selected.id, { src: result.url }); toast.success('Image replaced') }
                        else toast.error(result.error || 'Upload failed')
                      } catch (e) { toast.error('Upload failed: ' + e.message) }
                      finally { setUploading(false) }
                    }}
                  />
                )}
                {selected.type === 'shape' && (
                  <ShapeProperties node={selected} updateNode={updateNode} />
                )}
                {selected.type === 'gradient' && (
                  <GradientProperties node={selected} updateNode={updateNode} />
                )}

                <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                  <div><Label className="text-xs">X</Label><Input type="number" value={selected.x} onChange={(e) => updateNode(selected.id, { x: parseInt(e.target.value) || 0 })} /></div>
                  <div><Label className="text-xs">Y</Label><Input type="number" value={selected.y} onChange={(e) => updateNode(selected.id, { y: parseInt(e.target.value) || 0 })} /></div>
                  <div><Label className="text-xs">Width</Label><Input type="number" value={selected.width} onChange={(e) => {
                    const w = parseInt(e.target.value) || 0
                    if (selected.type === 'image' && selected.aspectRatio) {
                      updateNode(selected.id, { width: w, height: Math.max(20, Math.round(w / selected.aspectRatio)) })
                    } else updateNode(selected.id, { width: w })
                  }} /></div>
                  <div><Label className="text-xs">Height</Label><Input type="number" value={selected.height} onChange={(e) => {
                    const h = parseInt(e.target.value) || 0
                    if (selected.type === 'image' && selected.aspectRatio) {
                      updateNode(selected.id, { height: h, width: Math.max(20, Math.round(h * selected.aspectRatio)) })
                    } else updateNode(selected.id, { height: h })
                  }} /></div>
                  <div><Label className="text-xs text-pink-500">Max Width</Label><Input type="number" placeholder="none" value={selected.maxWidth || ''} onChange={(e) => updateNode(selected.id, { maxWidth: parseInt(e.target.value) || undefined })} /></div>
                  <div><Label className="text-xs text-pink-500">Max Height</Label><Input type="number" placeholder="none" value={selected.maxHeight || ''} onChange={(e) => updateNode(selected.id, { maxHeight: parseInt(e.target.value) || undefined })} /></div>
                  <div><Label className="text-xs">Rotation °</Label><Input type="number" value={selected.rotation || 0} onChange={(e) => updateNode(selected.id, { rotation: parseInt(e.target.value) || 0 })} /></div>
                </div>

                {selected.type !== 'text' && (
                  <div className="pt-3 border-t">
                    <Label className="text-xs">Class Name</Label>
                    <Input placeholder="e.g. .highlight" value={selected.className || ''} onChange={(e) => updateNode(selected.id, { className: e.target.value })} />
                    <p className="text-xs text-muted-foreground mt-1">Link this node to a custom class.</p>
                  </div>
                )}

                {(selected.type === 'text' || selected.type === 'image') && (
                  <div className="pt-3 border-t">
                    <Label className="text-xs flex items-center gap-2 mb-1">Dynamic Key <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
                    <Input placeholder="e.g. text_1" value={selected.dynamic_key || ''} onChange={(e) => updateNode(selected.id, { dynamic_key: e.target.value })} />
                    <p className="text-xs text-muted-foreground mt-1">Set this to make the element dynamic via the API.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Add Image dialog */}
      <Dialog open={imageDialog} onOpenChange={setImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Image</DialogTitle>
            <DialogDescription>From a URL or upload a file</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="url">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="url"><LinkIcon className="w-3.5 h-3.5 mr-2" />URL</TabsTrigger>
              <TabsTrigger value="upload"><Upload className="w-3.5 h-3.5 mr-2" />Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 pt-3">
              <Label className="text-xs">Image URL</Label>
              <Input placeholder="https://example.com/image.png" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && addImageByUrl()} />
              <Button onClick={addImageByUrl} className="w-full">Add Image</Button>
            </TabsContent>
            <TabsContent value="upload" className="space-y-3 pt-3">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Click to upload</p>
                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 6MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
              {uploading && <p className="text-sm text-center text-muted-foreground">Uploading...</p>}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Test render dialog */}
      <Dialog open={renderDialog} onOpenChange={setRenderDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Test Dynamic Render</DialogTitle>
            <DialogDescription>Provide JSON matching your dynamic keys. Auto-saves before rendering.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1">Request body (POST /api/render)</Label>
              <Textarea rows={14} className="font-mono text-xs" value={renderData} onChange={(e) => setRenderData(e.target.value)} />
              <Button onClick={testRender} disabled={rendering} className="mt-3 w-full">{rendering ? 'Rendering...' : 'Render'}</Button>
            </div>
            <div>
              <Label className="text-xs mb-1">Result</Label>
              <div className="aspect-square bg-muted rounded border flex items-center justify-center overflow-hidden">
                {renderResult ? <img src={renderResult} alt="rendered" className="max-w-full max-h-full" /> : <span className="text-xs text-muted-foreground">Render result will appear here</span>}
              </div>
              {renderResult && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Image URL:</p>
                  <a href={renderResult} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">{renderResult}</a>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API dialog */}
      <Dialog open={apiDialog} onOpenChange={setApiDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Usage</DialogTitle>
            <DialogDescription>Render this canvas dynamically via HTTP.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="json">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>
            <TabsContent value="json" className="space-y-3 pt-3">
              <div><Label className="text-xs mb-1">Endpoint</Label><pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">{`POST ${origin}/api/render`}</pre></div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Request Body</Label>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(curlBody); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</Button>
                </div>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">{curlBody}</pre>
              </div>
              <div><Label className="text-xs mb-1">Response</Label><pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">{JSON.stringify({ url: `${origin}/api/rendered/<render_id>`, render_id: '<uuid>' }, null, 2)}</pre></div>
            </TabsContent>
            <TabsContent value="curl" className="space-y-3 pt-3">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Run this in your terminal</Label>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(curlCmd); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</Button>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">{curlCmd}</pre>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const CANVAS_PRESETS = [
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Portrait 4:5', w: 1080, h: 1350 },
  { label: 'Story 9:16', w: 1080, h: 1920 },
  { label: 'Landscape 16:9', w: 1920, h: 1080 },
  { label: 'OG Image', w: 1200, h: 628 },
  { label: 'Twitter Header', w: 1500, h: 500 },
  { label: 'LinkedIn Banner', w: 1584, h: 396 },
  { label: 'A4 Portrait', w: 2480, h: 3508 },
]

function CanvasSettingsPanel({ canvas, setCanvas }) {
  return (
    <div>
      <p className="text-2xl leading-none mb-1" style={BEBAS}>CANVAS</p>
      <p className="text-[11px] uppercase tracking-widest text-foreground/60 mb-4">Size · background · color mode</p>
      <div className="space-y-3">
        <div>
          <Label className="text-[11px] uppercase tracking-widest font-semibold text-foreground/70 mb-1.5 block">Presets</Label>
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
            {CANVAS_PRESETS.map((p) => (
              <button key={p.label} onClick={() => setCanvas({ ...canvas, width: p.w, height: p.h })}
                className="whitespace-nowrap px-2.5 py-1 bg-card border-2 border-foreground/25 hover:bg-[#D4FF00] hover:border-foreground/90 rounded-full text-[10px] font-semibold uppercase tracking-wide transition">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Width</Label><Input type="number" value={canvas.width} onChange={(e) => setCanvas({ ...canvas, width: parseInt(e.target.value) || 1080 })} /></div>
          <div><Label className="text-xs">Height</Label><Input type="number" value={canvas.height} onChange={(e) => setCanvas({ ...canvas, height: parseInt(e.target.value) || 1080 })} /></div>
        </div>
        <div>
          <Label className="text-xs">Background</Label>
          <ColorInput value={canvas.background || '#ffffff'} onChange={(val) => setCanvas({ ...canvas, background: val })} />
        </div>
        <div>
          <Label className="text-xs flex items-center gap-2"><Wand2 className="w-3 h-3" />Color Mode</Label>
          <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
            value={canvas.colorMode || 'color'}
            onChange={(e) => setCanvas({ ...canvas, colorMode: e.target.value })}>
            <option value="color">Color (default)</option>
            <option value="grayscale">Grayscale / B&W</option>
            <option value="sepia">Sepia</option>
            <option value="invert">Invert</option>
            <option value="high-contrast">High Contrast</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">Applied to the entire final render.</p>
        </div>
        <div className="pt-3 border-t mt-3">
          <p className="text-xs text-muted-foreground">Tip: Set a <span className="font-mono bg-muted px-1 rounded">dynamic_key</span> on any element to make it dynamic via the API.</p>
        </div>
      </div>
    </div>
  )
}

function TextProperties({ node, updateNode, meta, canvas, editorRef, savedRangeRef, htmlToTags, editingId }) {
  const weights = meta?.weights || [400, 700]
  const supportsItalic = meta?.italic
  const ts = node.textShadow || { enabled: false, offsetX: 0, offsetY: 4, blur: 12, color: '#00000055' }

  const applyTextClassToCanvas = (className) => {
    // Only works while this node is being edited
    if (editingId !== node.id) return toast.error('Double-click the text on canvas to enter edit mode, then highlight text and click a class');
    const editor = editorRef?.current;
    if (!editor) return;

    // Restore the saved selection (editor may have lost focus when clicking the sidebar)
    const range = savedRangeRef?.current;
    if (!range) return toast.error('Highlight some text in the canvas editor first');

    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const span = document.createElement('span');
    span.className = className.startsWith('.') ? className.slice(1) : className;
    try {
      const content = range.extractContents();
      span.appendChild(content);
      range.insertNode(span);
      // Move cursor after the span
      const newRange = document.createRange();
      newRange.setStartAfter(span);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      // Save node text immediately
      if (htmlToTags) updateNode(node.id, { text: htmlToTags(editor.innerHTML) });
    } catch (e) {
      toast.error('Could not apply class to this selection');
    }
  }

  const clearTextClassFromCanvas = () => {
    if (editingId !== node.id) return toast.error('Double-click the text on canvas to enter edit mode, then highlight text and click Clear');
    const editor = editorRef?.current;
    if (!editor) return;

    const range = savedRangeRef?.current;
    if (!range) return toast.error('Highlight some text in the canvas editor first');

    let modified = false;

    if (range.collapsed) {
       let curr = range.startContainer;
       if (curr.nodeType === Node.TEXT_NODE) curr = curr.parentNode;
       while (curr && curr !== editor) {
         if (curr.tagName === 'SPAN' && curr.className) {
           curr.removeAttribute('class');
           modified = true;
           break;
         }
         curr = curr.parentNode;
       }
    } else {
       const spans = Array.from(editor.querySelectorAll('span[class]'));
       spans.forEach(span => {
         if (range.intersectsNode(span)) {
           span.removeAttribute('class');
           modified = true;
         }
       });
    }

    if (modified) {
      if (htmlToTags) updateNode(node.id, { text: htmlToTags(editor.innerHTML) });
    } else {
      toast.error('No class found on the selected text');
    }
  }

  const textClasses = Object.entries(canvas.classes || {}).filter(([_, c]) => c.type === 'text' || !c.type)

  return (
    <>
      <div>
        <Label className="text-[11px] uppercase tracking-widest font-semibold text-foreground/70 mb-1.5 block">Content</Label>
        <Textarea
          rows={5}
          className="text-sm resize-y min-h-[100px] font-normal leading-relaxed border-2 border-foreground/20 focus-visible:ring-[#D4FF00]"
          style={{ fontFamily: `'${node.fontFamily || 'Inter'}', sans-serif` }}
          value={plainTextFromStyled(node.text || '')}
          onChange={(e) => updateNode(node.id, { text: e.target.value })}
          placeholder="Enter text…"
        />
        <p className="text-[10px] text-muted-foreground mt-1.5">Edits plain text here. Double-click the layer on canvas for inline styles and classes.</p>
      </div>

      <div className="space-y-3 bg-muted/30 border p-3 rounded-lg">
        {/* Whole Node Class dropdown */}
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider block">Whole Node Class</Label>
          <select 
            className="w-full h-9 border rounded-md px-2 text-xs bg-background"
            value={node.className || ''} 
            onChange={(e) => updateNode(node.id, { className: e.target.value || undefined })}
          >
            <option value="">(None)</option>
            {textClasses.map(([name]) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Inline Selection Class list — wrapped in data-class-panel so click-outside handler ignores it */}
        {textClasses.length > 0 && (
          <div data-class-panel className="space-y-1.5 pt-2 border-t border-foreground/5">
            <Label className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider block">Apply Class to Selection</Label>
            <div className="flex flex-wrap gap-1">
              {textClasses.map(([name, _]) => (
                <button 
                  key={name}
                  onClick={() => applyTextClassToCanvas(name)}
                  title={`Apply ${name} to selected text on canvas`}
                  className="text-xs bg-card hover:bg-muted border border-foreground/10 px-2 py-0.5 rounded cursor-pointer transition-colors font-mono"
                >
                  {name}
                </button>
              ))}
              <button 
                onClick={clearTextClassFromCanvas}
                title="Remove class from selected text"
                className="text-xs bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20 px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">Font Family</Label>
        <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
          style={{ fontFamily: `'${node.fontFamily || 'Inter'}', sans-serif` }}
          value={node.fontFamily || 'Inter'}
          onChange={(e) => updateNode(node.id, { fontFamily: e.target.value })}>
          {Object.keys(FONT_META).map((f) => (
            <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>{f}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Font Size</Label>
          <Input type="number" value={node.fontSize || 48} onChange={(e) => updateNode(node.id, { fontSize: parseInt(e.target.value) || 48 })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Font Weight</Label>
        <div className="flex flex-wrap gap-1">
          {weights.map((w) => (
            <Button 
              key={w}
              variant={node.fontWeight === w ? 'default' : 'outline'} 
              size="sm" 
              className="text-xs"
              onClick={() => updateNode(node.id, { fontWeight: w })}
            >
              {WEIGHT_LABELS[w] || w}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant={node.fontStyle === 'italic' ? 'default' : 'outline'} 
          size="sm" 
          disabled={!supportsItalic}
          onClick={() => updateNode(node.id, { fontStyle: node.fontStyle === 'italic' ? 'normal' : 'italic' })}
          title={supportsItalic ? 'Toggle italic' : 'Italic not supported'}
        >
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button 
          variant={node.textDecoration === 'underline' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => updateNode(node.id, { textDecoration: node.textDecoration === 'underline' ? 'none' : 'underline' })}
          title="Toggle underline"
        >
          <Underline className="w-3.5 h-3.5" />
        </Button>
        <Button 
          variant={node.textDecoration === 'line-through' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => updateNode(node.id, { textDecoration: node.textDecoration === 'line-through' ? 'none' : 'line-through' })}
          title="Toggle strikethrough"
        >
          <span className="text-xs font-bold">S</span>
        </Button>
      </div>
      <div>
        <Label className="text-xs">Color</Label>
        <ColorInput value={node.color || '#000000'} onChange={(val) => updateNode(node.id, { color: val })} />
      </div>
      <div>
        <Label className="text-xs">Alignment</Label>
        <select className="w-full h-10 border rounded-md px-3 text-sm bg-background" value={node.textAlign || 'left'} onChange={(e) => updateNode(node.id, { textAlign: e.target.value })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <Label className="text-xs">Letter Spacing</Label>
          <Input type="number" value={node.letterSpacing || 0} onChange={(e) => updateNode(node.id, { letterSpacing: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Line Height</Label>
          <Input type="number" step="0.1" value={node.lineHeight || 1.2} onChange={(e) => updateNode(node.id, { lineHeight: parseFloat(e.target.value) || 1.2 })} />
        </div>
      </div>
      <div className="mt-3">
        <Label className="text-xs">Transform</Label>
        <select className="w-full h-10 border rounded-md px-3 text-sm bg-background" value={node.textTransform || 'none'} onChange={(e) => updateNode(node.id, { textTransform: e.target.value })}>
          <option value="none">None</option>
          <option value="uppercase">Uppercase</option>
          <option value="lowercase">Lowercase</option>
          <option value="capitalize">Capitalize</option>
        </select>
      </div>

      {/* Text Shadow */}
      <div className="pt-3 border-t">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs flex items-center gap-2"><Sparkles className="w-3 h-3" />Text Shadow</Label>
          <Switch checked={!!ts.enabled} onCheckedChange={(v) => updateNode(node.id, { textShadow: { ...ts, enabled: v } })} />
        </div>
        {ts.enabled && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Offset X</Label><Input type="number" value={ts.offsetX || 0} onChange={(e) => updateNode(node.id, { textShadow: { ...ts, offsetX: parseInt(e.target.value) || 0 } })} /></div>
              <div><Label className="text-xs">Offset Y</Label><Input type="number" value={ts.offsetY || 0} onChange={(e) => updateNode(node.id, { textShadow: { ...ts, offsetY: parseInt(e.target.value) || 0 } })} /></div>
            </div>
            <div>
              <Label className="text-xs">Blur</Label>
              <Input type="number" value={ts.blur || 0} onChange={(e) => updateNode(node.id, { textShadow: { ...ts, blur: parseInt(e.target.value) || 0 } })} />
            </div>
            <div>
              <Label className="text-[10px]">Shadow Color</Label>
              <ColorInput value={ts.color || '#000000'} onChange={(val) => updateNode(node.id, { textShadow: { ...ts, color: val } })} />
              <p className="text-xs text-muted-foreground mt-1">Use 8-digit hex (e.g. #00000080) for transparency.</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ImageProperties({ node, updateNode, setCropModeNodeId, onReplace, onReplaceUpload }) {
  const f = { ...DEFAULT_FILTERS, ...(node.filters || {}) }
  const setFilter = (key, value) => updateNode(node.id, { filters: { ...f, [key]: value } })
  const resetFilters = () => updateNode(node.id, { filters: { ...DEFAULT_FILTERS } })
  const replaceFileRef = useRef(null)
  const [replaceUrlInput, setReplaceUrlInput] = useState('')
  const [showReplaceUrl, setShowReplaceUrl] = useState(false)

  const FilterSlider = ({ name, label, min, max, step = 1, suffix = '' }) => (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{f[name]}{suffix}</span>
      </div>
      <Slider value={[f[name]]} min={min} max={max} step={step} onValueChange={(v) => setFilter(name, v[0])} />
    </div>
  )

  const SHAPES = [
    { value: 'none',          label: 'None',    css: { borderRadius: 0 } },
    { value: 'circle',        label: 'Circle',  css: { borderRadius: '50%' } },
    { value: 'rounded',       label: 'Round',   css: { borderRadius: 8 } },
    { value: 'pill',          label: 'Pill',    css: { borderRadius: 20 } },
    { value: 'triangle',      label: 'Tri ▲',   css: { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' } },
    { value: 'triangle-down', label: 'Tri ▼',   css: { clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' } },
    { value: 'diamond',       label: 'Diamond', css: { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' } },
    { value: 'pentagon',      label: 'Penta',   css: { clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' } },
    { value: 'hexagon',       label: 'Hex',     css: { clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' } },
    { value: 'star',          label: 'Star',    css: { clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' } },
    { value: 'arrow-right',   label: 'Arrow',   css: { clipPath: 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)' } },
    { value: 'parallelogram', label: 'Para',    css: { clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)' } },
  ]

  const currentMask = node.mask || 'none'

  return (
    <>
      {/* Replace image */}
      <div className="space-y-1.5">
        <Label className="text-xs">Image Source</Label>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="flex-1 border-2 text-xs h-8"
            onClick={() => replaceFileRef.current?.click()}>
            <Upload className="w-3 h-3 mr-1.5" />Replace
          </Button>
          <Button size="sm" variant="outline" className={`flex-1 border-2 text-xs h-8 ${showReplaceUrl ? 'border-foreground' : ''}`}
            onClick={() => setShowReplaceUrl(v => !v)}>
            <LinkIcon className="w-3 h-3 mr-1.5" />URL
          </Button>
          <input ref={replaceFileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { onReplaceUpload?.(f); e.target.value = '' } }} />
        </div>
        {showReplaceUrl && (
          <div className="flex gap-1.5">
            <Input className="h-8 text-xs flex-1" placeholder="https://..." value={replaceUrlInput}
              onChange={(e) => setReplaceUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && replaceUrlInput.trim()) { onReplace?.(replaceUrlInput.trim()); setReplaceUrlInput(''); setShowReplaceUrl(false) } }} />
            <Button size="sm" className="h-8 px-3" onClick={() => { if (replaceUrlInput.trim()) { onReplace?.(replaceUrlInput.trim()); setReplaceUrlInput(''); setShowReplaceUrl(false) } }}>
              <Check className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Shape / Mask */}
      <div className="pt-3 border-t">
        <Label className="text-xs mb-2 block">Shape / Mask</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map(({ value, label, css }) => {
            const active = currentMask === value
            return (
              <button key={value} type="button"
                onClick={() => updateNode(node.id, { mask: value })}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-colors ${
                  active ? 'border-foreground bg-[#D4FF00]/60' : 'border-foreground/15 hover:border-foreground/40 bg-muted/30'
                }`}
              >
                {/* Shape preview swatch */}
                <div style={{
                  width: 28, height: 28,
                  background: active ? '#111' : '#6366f1',
                  ...css,
                }} />
                <span className="text-[9px] font-medium leading-none">{label}</span>
              </button>
            )
          })}
        </div>
        {currentMask === 'none' && (
          <div className="mt-2">
            <Label className="text-xs">Corner Radius</Label>
            <Input type="number" value={node.borderRadius || 0} onChange={(e) => updateNode(node.id, { borderRadius: parseInt(e.target.value) || 0 })} />
          </div>
        )}
      </div>

      <div className="pt-3 border-t">
        <Label className="text-xs flex items-center gap-2"><Crop className="w-3.5 h-3.5" />Cut / Crop Image</Label>
        <div className="space-y-3 mt-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Left Crop</span>
              <span className="text-xs text-muted-foreground">{node.cropLeft || 0}%</span>
            </div>
            <Slider value={[node.cropLeft || 0]} min={0} max={90} step={1} onValueChange={(v) => {
              const newLeft = v[0];
              const currentRight = node.cropRight || 0;
              if (newLeft + currentRight < 100) updateNode(node.id, { cropLeft: newLeft });
            }} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Right Crop</span>
              <span className="text-xs text-muted-foreground">{node.cropRight || 0}%</span>
            </div>
            <Slider value={[node.cropRight || 0]} min={0} max={90} step={1} onValueChange={(v) => {
              const newRight = v[0];
              const currentLeft = node.cropLeft || 0;
              if (currentLeft + newRight < 100) updateNode(node.id, { cropRight: newRight });
            }} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Top Crop</span>
              <span className="text-xs text-muted-foreground">{node.cropTop || 0}%</span>
            </div>
            <Slider value={[node.cropTop || 0]} min={0} max={90} step={1} onValueChange={(v) => {
              const newTop = v[0];
              const currentBottom = node.cropBottom || 0;
              if (newTop + currentBottom < 100) updateNode(node.id, { cropTop: newTop });
            }} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bottom Crop</span>
              <span className="text-xs text-muted-foreground">{node.cropBottom || 0}%</span>
            </div>
            <Slider value={[node.cropBottom || 0]} min={0} max={90} step={1} onValueChange={(v) => {
              const newBottom = v[0];
              const currentTop = node.cropTop || 0;
              if (currentTop + newBottom < 100) updateNode(node.id, { cropBottom: newBottom });
            }} />
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs w-full border border-foreground/10 mt-1"
            onClick={() => updateNode(node.id, { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 })}>Reset Crop</Button>
          <Button size="sm" className="h-7 text-xs w-full mt-1 bg-amber-500 hover:bg-amber-600 text-black"
            onClick={() => setCropModeNodeId?.(node.id)}><Crop className="w-3 h-3 mr-1.5" />Crop on Canvas</Button>
        </div>
      </div>

      <div className="pt-3 border-t">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs flex items-center gap-2"><Wand2 className="w-3 h-3" />Image Filters</Label>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetFilters}>Reset</Button>
        </div>
        <div className="space-y-2.5">
          <FilterSlider name="brightness" label="Brightness" min={0} max={200} suffix="%" />
          <FilterSlider name="contrast" label="Contrast" min={0} max={200} suffix="%" />
          <FilterSlider name="saturate" label="Saturate" min={0} max={200} suffix="%" />
          <FilterSlider name="grayscale" label="Grayscale" min={0} max={100} suffix="%" />
          <FilterSlider name="sepia" label="Sepia" min={0} max={100} suffix="%" />
          <FilterSlider name="hueRotate" label="Hue Rotate" min={0} max={360} suffix="°" />
          <FilterSlider name="blur" label="Blur" min={0} max={20} suffix="px" />
          <FilterSlider name="opacity" label="Opacity" min={0} max={100} suffix="%" />
        </div>
      </div>
    </>
  )
}

function ShapeProperties({ node, updateNode }) {
  return (
    <>
      <div>
        <Label className="text-xs">Fill Color</Label>
        <ColorInput value={node.fill || '#6366f1'} onChange={(val) => updateNode(node.id, { fill: val })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Stroke</Label>
          <ColorInput value={node.stroke || '#000000'} onChange={(val) => updateNode(node.id, { stroke: val })} />
        </div>
        <div><Label className="text-xs">Stroke Width</Label><Input type="number" value={node.strokeWidth || 0} onChange={(e) => updateNode(node.id, { strokeWidth: parseInt(e.target.value) || 0 })} /></div>
      </div>
      {node.shape === 'rect' && (
        <div><Label className="text-xs">Corner Radius</Label><Input type="number" value={node.borderRadius || 0} onChange={(e) => updateNode(node.id, { borderRadius: parseInt(e.target.value) || 0 })} /></div>
      )}
    </>
  )
}

function GradientProperties({ node, updateNode }) {
  const stops = node.stops || []
  const addStop = () => {
    const lastPos = stops.length ? stops[stops.length - 1].position : 0
    updateNode(node.id, { stops: [...stops, { color: '#ffffff', position: Math.min(100, lastPos + 25), alpha: 100 }] })
  }
  const removeStop = (idx) => {
    const newStops = stops.filter((_, i) => i !== idx)
    if (newStops.length < 2) return toast.error('A gradient needs at least 2 stops')
    updateNode(node.id, { stops: newStops })
  }
  const updateStop = (idx, patch) => updateNode(node.id, { stops: stops.map((s, i) => (i === idx ? { ...s, ...patch } : s)) })
  const applyPreset = (preset) => updateNode(node.id, { stops: preset.stops, angle: preset.angle, gradientType: 'linear' })

  // Checkered background for transparency visualization
  const checker = 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

  return (
    <>
      <div className="rounded-md border h-16 relative overflow-hidden" style={{ background: checker }}>
        <div className="absolute inset-0" style={{ backgroundImage: buildGradientCssClient(node) }} />
      </div>
      <div>
        <Label className="text-xs">Type</Label>
        <select className="w-full h-10 border rounded-md px-3 text-sm bg-background" value={node.gradientType || 'linear'} onChange={(e) => updateNode(node.id, { gradientType: e.target.value })}>
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>
      {(node.gradientType || 'linear') === 'linear' && (
        <div>
          <div className="flex items-center justify-between"><Label className="text-xs">Angle</Label><span className="text-xs text-muted-foreground">{node.angle ?? 90}°</span></div>
          <Slider value={[node.angle ?? 90]} min={0} max={360} step={1} onValueChange={(v) => updateNode(node.id, { angle: v[0] })} />
        </div>
      )}
      <div>
        <Label className="text-xs">Shape</Label>
        <select className="w-full h-10 border rounded-md px-3 text-sm bg-background" value={node.shape || 'rect'} onChange={(e) => updateNode(node.id, { shape: e.target.value })}>
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
        </select>
      </div>
      {node.shape !== 'ellipse' && (
        <div><Label className="text-xs">Corner Radius</Label><Input type="number" value={node.borderRadius || 0} onChange={(e) => updateNode(node.id, { borderRadius: parseInt(e.target.value) || 0 })} /></div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Color Stops</Label>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addStop}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
        </div>
        <div className="space-y-2">
          {stops.map((stop, i) => (
            <div key={i} className="space-y-1 bg-muted/30 p-2 rounded border">
              <div className="flex items-center gap-2 mb-2">
                <ColorInput className="flex-1" value={stop.color} onChange={(val) => updateStop(i, { color: val })} />
                <div className="w-16"><Input type="number" className="h-8 text-xs px-1" value={stop.position} onChange={(e) => updateStop(i, { position: parseInt(e.target.value) || 0 })} /></div>
                <div className="w-16"><Input type="number" className="h-8 text-xs px-1" value={stop.alpha ?? 100} onChange={(e) => updateStop(i, { alpha: parseInt(e.target.value) || 0 })} /></div>
                <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-red-400 shrink-0" onClick={() => removeStop(i)}><Trash2 className="w-3 h-3" /></Button>
              </div>
              <div className="flex items-center gap-2 px-1">
                <Label className="text-[10px] uppercase text-muted-foreground w-10">Alpha</Label>
                <Slider value={[typeof stop.alpha === 'number' ? stop.alpha : 100]} min={0} max={100} step={1} onValueChange={(v) => updateStop(i, { alpha: v[0] })} className="flex-1" />
                <span className="text-[10px] text-muted-foreground w-9 text-right">{typeof stop.alpha === 'number' ? stop.alpha : 100}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs">Presets</Label>
        <div className="grid grid-cols-4 gap-1.5 mt-1">
          {GRADIENT_PRESETS.map((p) => (
            <button key={p.name} title={p.name} onClick={() => applyPreset(p)} className="h-10 rounded border hover:ring-2 hover:ring-primary transition relative overflow-hidden"
              style={{ background: 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 6px 6px' }}>
              <div className="absolute inset-0" style={{ backgroundImage: buildGradientCssClient({ stops: p.stops, angle: p.angle, gradientType: 'linear' }) }} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function GroupPropertiesPanel({ group, nodes, selectedIds, updateGroup, updateGroupGap, ungroupById, moveGroupMember }) {
  const gaps = normalizeGroupGaps(group)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const orderNodeId = selectedIds?.length === 1 && group.nodeIds.includes(selectedIds[0]) ? selectedIds[0] : null
  const orderIdx = orderNodeId != null ? group.nodeIds.indexOf(orderNodeId) : -1

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-3 border-b-2 border-foreground/15">
        <p className="text-2xl leading-none flex items-center gap-2" style={BEBAS}>
          <Folder className="w-5 h-5" /> GROUP
        </p>
        <Button variant="ghost" size="icon" className="hover:bg-destructive hover:text-destructive-foreground" onClick={() => ungroupById(group.id)} title="Ungroup">
          <Unlink className="w-4 h-4" />
        </Button>
      </div>

      <div>
        <Label className="text-xs">Group name</Label>
        <Input value={group.name} onChange={(e) => updateGroup(group.id, { name: e.target.value })} />
      </div>

      <div>
        <Label className="text-xs">Stack direction</Label>
        <select
          className="w-full h-10 border rounded-md px-3 text-sm bg-background"
          value={group.layout || 'horizontal'}
          onChange={(e) => updateGroup(group.id, { layout: e.target.value })}
        >
          <option value="horizontal">Horizontal (gap X between items)</option>
          <option value="vertical">Vertical (gap Y between items)</option>
        </select>
      </div>

      <div>
        <Label className="text-xs">
          {group.layout === 'vertical' ? 'Align items (X-axis)' : 'Align items (Y-axis)'}
        </Label>
        <select
          className="w-full h-10 border rounded-md px-3 text-sm bg-background"
          value={group.align || 'free'}
          onChange={(e) => updateGroup(group.id, { align: e.target.value })}
        >
          <option value="free">Free (manual positioning)</option>
          <option value="left">{group.layout === 'vertical' ? 'Left' : 'Top'}</option>
          <option value="center">Center</option>
          <option value="right">{group.layout === 'vertical' ? 'Right' : 'Bottom'}</option>
        </select>
      </div>

      {orderNodeId && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 border-2"
            disabled={orderIdx <= 0}
            onClick={() => moveGroupMember(group.id, orderNodeId, 'up')}
          >
            Move earlier
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 border-2"
            disabled={orderIdx < 0 || orderIdx >= group.nodeIds.length - 1}
            onClick={() => moveGroupMember(group.id, orderNodeId, 'down')}
          >
            Move later
          </Button>
        </div>
      )}

      <div className="pt-2 border-t border-foreground/15 space-y-3">
        <p className="text-[11px] uppercase tracking-widest font-semibold text-foreground/70">Spacing between items</p>
        <p className="text-[10px] text-muted-foreground">Each gap can differ. First item stays anchored; others reflow.</p>
        {gaps.map((gap, i) => {
          const a = nodeMap.get(group.nodeIds[i])
          const b = nodeMap.get(group.nodeIds[i + 1])
          const labelA = a ? nodeLayerLabel(a).slice(0, 12) : '?'
          const labelB = b ? nodeLayerLabel(b).slice(0, 12) : '?'
          return (
            <div key={i} className="p-2 rounded-lg border border-foreground/15 bg-muted/20 space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground truncate">{labelA} → {labelB}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Gap X (px)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={gap.gapX ?? 0}
                    onChange={(e) => updateGroupGap(group.id, i, 'gapX', e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Gap Y (px)</Label>
                  <Input
                    type="number"
                    step={1}
                    value={gap.gapY ?? 0}
                    onChange={(e) => updateGroupGap(group.id, i, 'gapY', e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Button variant="outline" className="w-full" onClick={() => ungroupById(group.id)}>
        <Unlink className="w-4 h-4 mr-2" />Ungroup all
      </Button>
    </div>
  )
}

export default Editor

function ClassesPanel({ canvas, setCanvas }) {
  const classes = canvas.classes || {}
  const [newClassName, setNewClassName] = useState('')
  const [newClassType, setNewClassType] = useState('text')

  const addClass = () => {
    let name = newClassName.trim()
    if (!name) return
    if (!name.startsWith('.')) name = '.' + name
    if (resolveCanvasClass(classes, name)) return toast.error('Class already exists')
    
    let defaults = { type: newClassType }
    if (newClassType === 'image') defaults.filters = {}
    if (newClassType === 'gradient') defaults.stops = [{color: '#6366f1', position: 0, alpha: 100}, {color: '#ec4899', position: 100, alpha: 100}]

    setCanvas({ ...canvas, classes: { ...classes, [name]: defaults } })
    setNewClassName('')
  }

  const removeClass = (name) => {
    const updated = { ...classes }
    delete updated[name]
    setCanvas({ ...canvas, classes: updated })
  }

  const updateClass = (name, key, value) => {
    const updated = { ...classes }
    if (value === undefined || value === '' || Number.isNaN(value)) {
      delete updated[name][key]
    } else {
      updated[name] = { ...updated[name], [key]: value }
    }
    setCanvas({ ...canvas, classes: updated })
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wide">Custom Classes</p>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <select className="h-8 border rounded text-xs px-2 bg-background w-24" value={newClassType} onChange={e => setNewClassType(e.target.value)}>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="shape">Shape</option>
            <option value="gradient">Gradient</option>
          </select>
          <Input placeholder="Name e.g. .highlight" value={newClassName} onChange={e => setNewClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addClass()} className="text-xs h-8 flex-1" />
          <Button size="sm" className="h-8" onClick={addClass}><Plus className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="space-y-4">
        {Object.keys(classes).map(name => {
          const cls = classes[name] || {}
          const type = cls.type || 'text'
          
          return (
            <div key={name} className="border border-foreground/10 p-3 rounded-lg bg-background shadow-sm">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-foreground/10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{name}</span>
                  <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase tracking-wider">{type}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeClass(name)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="space-y-2">
                
                {type === 'text' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px]">Text Color</Label>
                        <ColorInput value={cls.color || '#000000'} onChange={val => updateClass(name, 'color', val)} />
                      </div>
                      <div><Label className="text-[10px]">Background</Label>
                        <ColorInput value={cls.background || cls.backgroundColor || '#transparent'} onChange={val => updateClass(name, 'background', val)} />
                      </div>
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] shrink-0"
                        onClick={() => updateClass(name, 'background', undefined)}
                        title="Remove background (invisible at 0 padding)"
                      >
                        None
                      </Button>
                      <p className="text-[9px] text-muted-foreground mt-0.5">Pad 0 hides the box. Use 1+ for a visible highlight.</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Underline</Label>
                      <select className="w-full h-7 border rounded text-[10px]" value={cls.textDecoration || 'none'} onChange={e => updateClass(name, 'textDecoration', e.target.value)}>
                        <option value="none">None</option>
                        <option value="underline">Underline</option>
                        <option value="line-through">Line Through</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Letter Spacing (px)</Label>
                      <Input type="number" className="h-7 text-[10px]" value={cls.letterSpacing ?? ''} onChange={e => updateClass(name, 'letterSpacing', parseFloat(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Text Transform</Label>
                      <select className="w-full h-7 border rounded text-[10px]" value={cls.textTransform || 'none'} onChange={e => updateClass(name, 'textTransform', e.target.value)}>
                        <option value="none">None</option>
                        <option value="uppercase">Uppercase</option>
                        <option value="lowercase">Lowercase</option>
                        <option value="capitalize">Capitalize</option>
                      </select>
                    </div>
                    {/* Padding & Corner Radius */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Pad X (px)</Label>
                        <Input type="number" min={0} step={1} className="h-7 text-[10px]" value={cls.paddingX ?? ''} onChange={e => {
                          if (e.target.value === '') { updateClass(name, 'paddingX', undefined); return }
                          const v = Number(e.target.value)
                          if (!Number.isNaN(v) && v >= 0) updateClass(name, 'paddingX', v)
                        }} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Pad Y (px)</Label>
                        <Input type="number" min={0} step={1} className="h-7 text-[10px]" value={cls.paddingY ?? ''} onChange={e => {
                          if (e.target.value === '') { updateClass(name, 'paddingY', undefined); return }
                          const v = Number(e.target.value)
                          if (!Number.isNaN(v) && v >= 0) updateClass(name, 'paddingY', v)
                        }} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Radius</Label>
                        <Input type="number" className="h-7 text-[10px]" value={cls.borderRadius ?? ''} onChange={e => updateClass(name, 'borderRadius', parseInt(e.target.value))} placeholder="0" />
                      </div>
                    </div>
                    {/* Background Box Shadow */}
                    <div className="pt-2 border-t border-foreground/10">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[10px] uppercase font-bold">Bg Shadow</Label>
                        <Switch checked={!!cls.boxShadow?.enabled} onCheckedChange={(v) => updateClass(name, 'boxShadow', { ...(cls.boxShadow || {}), enabled: v })} />
                      </div>
                      {cls.boxShadow?.enabled && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div><Label className="text-[9px]">Offset X</Label><Input type="number" className="h-6 text-[10px]" value={cls.boxShadow.offsetX || 0} onChange={(e) => updateClass(name, 'boxShadow', { ...cls.boxShadow, offsetX: parseInt(e.target.value) || 0 })} /></div>
                            <div><Label className="text-[9px]">Offset Y</Label><Input type="number" className="h-6 text-[10px]" value={cls.boxShadow.offsetY || 0} onChange={(e) => updateClass(name, 'boxShadow', { ...cls.boxShadow, offsetY: parseInt(e.target.value) || 0 })} /></div>
                            <div><Label className="text-[9px]">Blur</Label><Input type="number" className="h-6 text-[10px]" value={cls.boxShadow.blur || 0} onChange={(e) => updateClass(name, 'boxShadow', { ...cls.boxShadow, blur: parseInt(e.target.value) || 0 })} /></div>
                          </div>
                          <div>
                            <Label className="text-[10px]">Shadow Color</Label>
                            <ColorInput value={(cls.boxShadow.color || '#000000').slice(0, 7)} onChange={(val) => updateClass(name, 'boxShadow', { ...cls.boxShadow, color: val })} />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {type === 'image' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Mask</Label>
                        <select className="w-full h-7 border rounded text-[10px]" value={cls.mask || 'none'} onChange={e => updateClass(name, 'mask', e.target.value)}>
                          <option value="none">None</option>
                          <option value="circle">Circle</option>
                          <option value="pill">Pill</option>
                          <option value="rounded">Rounded</option>
                          <option value="soft">Soft</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Radius</Label>
                        <Input type="number" className="h-7 text-[10px]" value={cls.borderRadius ?? ''} onChange={e => updateClass(name, 'borderRadius', parseInt(e.target.value))} placeholder="0" />
                      </div>
                    </div>
                    <div className="pt-1">
                      <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Filters</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[9px]">Brightness %</Label>
                          <Input type="number" className="h-6 text-[10px]" value={cls.filters?.brightness ?? ''} placeholder="100" 
                            onChange={e => updateClass(name, 'filters', { ...(cls.filters || {}), brightness: parseInt(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-[9px]">Contrast %</Label>
                          <Input type="number" className="h-6 text-[10px]" value={cls.filters?.contrast ?? ''} placeholder="100" 
                            onChange={e => updateClass(name, 'filters', { ...(cls.filters || {}), contrast: parseInt(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-[9px]">Saturate %</Label>
                          <Input type="number" className="h-6 text-[10px]" value={cls.filters?.saturate ?? ''} placeholder="100" 
                            onChange={e => updateClass(name, 'filters', { ...(cls.filters || {}), saturate: parseInt(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-[9px]">Sepia %</Label>
                          <Input type="number" className="h-6 text-[10px]" value={cls.filters?.sepia ?? ''} placeholder="0" 
                            onChange={e => updateClass(name, 'filters', { ...(cls.filters || {}), sepia: parseInt(e.target.value) })} />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {type === 'shape' && (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div><Label className="text-[10px]">Fill Color</Label>
                        <ColorInput value={cls.fill || '#6366f1'} onChange={val => updateClass(name, 'fill', val)} />
                      </div>
                      <div><Label className="text-[10px]">Stroke Color</Label>
                        <ColorInput value={cls.stroke || '#000000'} onChange={val => updateClass(name, 'stroke', val)} />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Stroke W.</Label>
                        <Input type="number" className="h-7 text-[10px]" value={cls.strokeWidth ?? ''} onChange={e => updateClass(name, 'strokeWidth', parseInt(e.target.value))} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Radius</Label>
                        <Input type="number" className="h-7 text-[10px]" value={cls.borderRadius ?? ''} onChange={e => updateClass(name, 'borderRadius', parseInt(e.target.value))} placeholder="0" />
                      </div>
                    </div>
                  </>
                )}

                {type === 'gradient' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                        <select className="w-full h-7 border rounded text-[10px]" value={cls.gradientType || 'linear'} onChange={e => updateClass(name, 'gradientType', e.target.value)}>
                          <option value="linear">Linear</option>
                          <option value="radial">Radial</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Angle</Label>
                        <Input type="number" className="h-7 text-[10px]" value={cls.angle ?? 90} onChange={e => updateClass(name, 'angle', parseInt(e.target.value))} placeholder="90" />
                      </div>
                    </div>
                  </>
                )}

              </div>
            </div>
          )
        })}
        {Object.keys(classes).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No custom classes defined. Create one to use special inline styles.</p>
        )}
      </div>
    </div>
  )
}
