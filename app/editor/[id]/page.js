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
  AlignLeft, AlignCenter, AlignRight, Sparkles, Wand2, GripVertical, Undo2, Redo2
} from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { KandMark } from '@/components/logo'
import { parseStyledText, renderStyledText, resolveCanvasClass } from '@/lib/styleParser'
import { createElement } from 'react'

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

const MASK_PRESETS = [
  { value: 'none', label: 'None' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'soft', label: 'Soft' },
  { value: 'pill', label: 'Pill' },
  { value: 'circle', label: 'Circle' },
]

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

function maskRadius(node) {
  const w = node.width, h = node.height
  switch (node.mask) {
    case 'circle': return Math.max(w, h)
    case 'pill': return Math.min(w, h) / 2
    case 'rounded': return Math.min(w, h) * 0.15
    case 'soft': return Math.min(w, h) * 0.08
    case 'square':
    case 'none':
    default: return node.borderRadius || 0
  }
}

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0, sepia: 0, hueRotate: 0, opacity: 100 }

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
    setCanvasState(prev)
    setHistoryTick(t => t + 1)
  }
  const redo = () => {
    if (historyRef.current.future.length === 0) return
    const next = historyRef.current.future.pop()
    historyRef.current.past.push(canvasRefObj.current)
    setCanvasState(next)
    setHistoryTick(t => t + 1)
  }
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [scale, setScale] = useState(0.5)
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

  useEffect(() => {
    if (!canvas) return
    const updateScale = () => {
      const w = window.innerWidth - 720
      const h = window.innerHeight - 180
      const sx = w / canvas.width, sy = h / canvas.height
      setScale(Math.min(sx, sy, 0.7))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [canvas?.width, canvas?.height])

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

      if (!selectedId) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteNode(selectedId) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId])

  const selected = canvas?.nodes?.find((n) => n.id === selectedId)
  const updateNode = (nodeId, patch, skipHistory = false) => setCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }), skipHistory)
  const deleteNode = (nodeId) => { setCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== nodeId) })); setSelectedId(null) }

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
      const visual = c.nodes.slice().reverse()
      const dragIdx = visual.findIndex((n) => n.id === draggedId)
      const tgtIdx = visual.findIndex((n) => n.id === targetId)
      if (dragIdx === -1 || tgtIdx === -1) return c
      const [item] = visual.splice(dragIdx, 1)
      const newTgt = visual.findIndex((n) => n.id === targetId)
      visual.splice(newTgt, 0, item)
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
      el.style.lineHeight = '1.2'
      el.style.whiteSpace = 'pre-wrap'
      el.style.wordBreak = 'break-word'
      el.innerHTML = (n.text && n.text.length > 0) ? tagsToHtml(n.text) : 'M'
      const h = Math.max(40, Math.ceil(el.getBoundingClientRect().height))
      if (h !== n.height) updates.push({ id: n.id, height: h })
    }
    if (updates.length) {
      setCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => {
        const u = updates.find((x) => x.id === n.id)
        return u ? { ...n, height: u.height } : n
      }) }))
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
    setSelectedId(newNode.id)
  }

  const addShape = (shape) => {
    const newNode = {
      id: uuidv4(), type: 'shape', shape,
      x: Math.round((canvas.width - 300) / 2), y: Math.round((canvas.height - 300) / 2),
      width: 300, height: 300, fill: '#6366f1', stroke: '#000000', strokeWidth: 0,
      borderRadius: shape === 'rect' ? 0 : 9999,
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedId(newNode.id)
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
    setSelectedId(newNode.id)
  }

  const openImageDialog = () => { setImageUrl(''); setImageDialog(true) }
  const insertImageNode = (src) => {
    const newNode = {
      id: uuidv4(), type: 'image',
      x: Math.round((canvas.width - 500) / 2), y: Math.round((canvas.height - 500) / 2),
      width: 500, height: 500, src, borderRadius: 0, mask: 'none',
      filters: { ...DEFAULT_FILTERS },
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedId(newNode.id)
    setImageDialog(false)
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
    e.stopPropagation(); e.preventDefault(); setSelectedId(node.id)
    dragState.current = { nodeId: node.id, startX: e.clientX, startY: e.clientY, orig: { x: node.x, y: node.y, width: node.width, height: node.height, maxWidth: node.maxWidth || node.width, maxHeight: node.maxHeight || node.height, rotation: node.rotation || 0 }, mode, initialCanvas: canvasRefObj.current, hasMoved: false }
    const onMove = (e) => {
      const ds = dragState.current; if (!ds) return
      const dx = (e.clientX - ds.startX) / scale, dy = (e.clientY - ds.startY) / scale
      if (ds.mode === 'move') {
        let rawX = Math.round(ds.orig.x + dx)
        let rawY = Math.round(ds.orig.y + dy)
        const nodeW = ds.orig.width
        const nodeH = ds.orig.height
        const centerXV = rawX + nodeW / 2
        const centerYV = rawY + nodeH / 2
        
        let newX = rawX
        let newY = rawY
        const lines = []
        const SNAP = 8
        const cCenterX = canvas.width / 2
        const cCenterY = canvas.height / 2
        
        if (Math.abs(centerXV - cCenterX) < SNAP) { newX = cCenterX - nodeW / 2; lines.push({ type: 'v', pos: cCenterX }) }
        if (Math.abs(centerYV - cCenterY) < SNAP) { newY = cCenterY - nodeH / 2; lines.push({ type: 'h', pos: cCenterY }) }
        if (Math.abs(rawX) < SNAP) { newX = 0; lines.push({ type: 'v', pos: 0 }) }
        if (Math.abs(rawY) < SNAP) { newY = 0; lines.push({ type: 'h', pos: 0 }) }
        if (Math.abs(rawX + nodeW - canvas.width) < SNAP) { newX = canvas.width - nodeW; lines.push({ type: 'v', pos: canvas.width }) }
        if (Math.abs(rawY + nodeH - canvas.height) < SNAP) { newY = canvas.height - nodeH; lines.push({ type: 'h', pos: canvas.height }) }

        // We do not check other nodes if they are not loaded yet or to keep it fast, 
        // but since nodes are few, we can iterate:
        for (const n of canvas.nodes || []) {
           if (n.id === ds.nodeId) continue
           const nCenterX = n.x + n.width / 2
           const nCenterY = n.y + n.height / 2
           if (Math.abs(centerXV - nCenterX) < SNAP && !lines.find(l => l.type === 'v' && l.pos === nCenterX)) { newX = nCenterX - nodeW / 2; lines.push({ type: 'v', pos: nCenterX }) }
           if (Math.abs(centerYV - nCenterY) < SNAP && !lines.find(l => l.type === 'h' && l.pos === nCenterY)) { newY = nCenterY - nodeH / 2; lines.push({ type: 'h', pos: nCenterY }) }
           if (Math.abs(rawX - n.x) < SNAP) { newX = n.x; lines.push({ type: 'v', pos: n.x }) }
           if (Math.abs(rawY - n.y) < SNAP) { newY = n.y; lines.push({ type: 'h', pos: n.y }) }
           if (Math.abs(rawX + nodeW - (n.x + n.width)) < SNAP) { newX = n.x + n.width - nodeW; lines.push({ type: 'v', pos: n.x + n.width }) }
           if (Math.abs(rawY + nodeH - (n.y + n.height)) < SNAP) { newY = n.y + n.height - nodeH; lines.push({ type: 'h', pos: n.y + n.height }) }
        }

        setSnapLines(lines)
        updateNode(ds.nodeId, { x: newX, y: newY }, true) // skip history
        ds.hasMoved = true
      }
      else if (ds.mode === 'resize') {
        const isText = canvasRefObj.current?.nodes?.find((n) => n.id === ds.nodeId)?.type === 'text'
        const n = canvasRefObj.current?.nodes?.find((n) => n.id === ds.nodeId)
        
        const angle = (ds.orig.rotation || 0) * (Math.PI / 180)
        const u = { x: Math.cos(angle), y: Math.sin(angle) }
        const v = { x: -Math.sin(angle), y: Math.cos(angle) }
        
        const cx = ds.orig.x + ds.orig.width / 2
        const cy = ds.orig.y + ds.orig.height / 2
        
        const TL = {
           x: cx - (ds.orig.width/2)*u.x - (ds.orig.height/2)*v.x,
           y: cy - (ds.orig.width/2)*u.y - (ds.orig.height/2)*v.y
        }
        
        const BR = {
           x: cx + (ds.orig.width/2)*u.x + (ds.orig.height/2)*v.x,
           y: cy + (ds.orig.width/2)*u.y + (ds.orig.height/2)*v.y
        }
        
        const newBR = { x: BR.x + dx, y: BR.y + dy }
        const diag = { x: newBR.x - TL.x, y: newBR.y - TL.y }
        
        let rawW = diag.x * u.x + diag.y * u.y
        let rawH = diag.x * v.x + diag.y * v.y
        
        rawW = Math.max(isText ? 40 : 20, Math.round(rawW))
        rawH = Math.max(20, Math.round(rawH))
        
        if (n?.maxWidth) rawW = Math.min(rawW, n.maxWidth)
        if (n?.maxHeight) rawH = Math.min(rawH, n.maxHeight)

        const lines = []
        const SNAP = 8
        if (Math.abs(angle) < 0.01) {
           const rightEdge = ds.orig.x + rawW
           const bottomEdge = ds.orig.y + rawH
           if (Math.abs(rightEdge - canvas.width) < SNAP) { rawW = canvas.width - ds.orig.x; lines.push({ type: 'v', pos: canvas.width }) }
           if (Math.abs(bottomEdge - canvas.height) < SNAP) { rawH = canvas.height - ds.orig.y; lines.push({ type: 'h', pos: canvas.height }) }
           
           for (const peer of canvasRefObj.current?.nodes || []) {
              if (peer.id === ds.nodeId) continue
              if (Math.abs(rightEdge - peer.x) < SNAP) { rawW = peer.x - ds.orig.x; lines.push({ type: 'v', pos: peer.x }) }
              if (Math.abs(rightEdge - (peer.x + peer.width)) < SNAP) { rawW = (peer.x + peer.width) - ds.orig.x; lines.push({ type: 'v', pos: peer.x + peer.width }) }
              if (!isText && Math.abs(bottomEdge - peer.y) < SNAP) { rawH = peer.y - ds.orig.y; lines.push({ type: 'h', pos: peer.y }) }
              if (!isText && Math.abs(bottomEdge - (peer.y + peer.height)) < SNAP) { rawH = (peer.y + peer.height) - ds.orig.y; lines.push({ type: 'h', pos: peer.y + peer.height }) }
           }
        }
        setSnapLines(lines)

        const newCx = TL.x + (rawW/2)*u.x + (rawH/2)*v.x
        const newCy = TL.y + (rawW/2)*u.y + (rawH/2)*v.y
        const newX = Math.round(newCx - rawW/2)
        const newY = Math.round(newCy - rawH/2)

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
      outline: selectedId === node.id ? '3px solid #6366f1' : 'none', outlineOffset: 2,
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
      return { ...base, borderRadius: maskRadius(node) }
    }
    return base
  }

  const layerIcon = (n) =>
    n.type === 'text' ? <Type className="w-3.5 h-3.5" /> :
    n.type === 'image' ? <ImageIcon className="w-3.5 h-3.5" /> :
    n.type === 'gradient' ? <Palette className="w-3.5 h-3.5" /> :
    n.shape === 'ellipse' ? <Circle className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />
  const layerLabel = (n) =>
    n.dynamic_key ? `{${n.dynamic_key}}` :
    n.type === 'text' ? ((n.text || '').slice(0, 18) || 'Text') :
    n.type === 'image' ? 'Image' :
    n.type === 'gradient' ? 'Gradient' :
    n.shape === 'ellipse' ? 'Circle' : 'Rectangle'

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
        if (bg) css += `background-color: ${bg} !important; `;
        if (cls.fontWeight) css += `font-weight: ${cls.fontWeight} !important; `;
        if (cls.fontStyle) css += `font-style: ${cls.fontStyle} !important; `;
        if (cls.letterSpacing) css += `letter-spacing: ${cls.letterSpacing}px !important; `;
        if (cls.textTransform) css += `text-transform: ${cls.textTransform} !important; `;
        if (cls.textDecoration) css += `text-decoration: ${cls.textDecoration} !important; `;
        if (cls.textShadow?.enabled) css += `text-shadow: ${cls.textShadow.offsetX||0}px ${cls.textShadow.offsetY||0}px ${cls.textShadow.blur||0}px ${cls.textShadow.color||'#000'} !important; `;
        if (cls.paddingX || cls.paddingY) css += `padding: ${cls.paddingY||0}px ${cls.paddingX||0}px !important; `;
        if (cls.borderRadius) css += `border-radius: ${cls.borderRadius}px !important; `;
        if (cls.boxShadow?.enabled) css += `box-shadow: ${cls.boxShadow.offsetX||0}px ${cls.boxShadow.offsetY||0}px ${cls.boxShadow.blur||0}px ${cls.boxShadow.color||'#000'} !important; `;
        css += `box-decoration-break: clone; -webkit-box-decoration-break: clone; `;
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
            className="bg-card shadow-2xl border border-foreground/10 rounded-xl px-2 py-1.5 flex gap-0.5 items-center"
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
              <label className="w-5 h-5 rounded border cursor-pointer flex-shrink-0 relative overflow-hidden block" style={{ background: textFormat.color || nodeColor }}>
                <input
                  type="color"
                  value={textFormat.color && /^#[0-9a-fA-F]{3,6}$/.test(textFormat.color) ? (textFormat.color.length === 4 ? '#' + textFormat.color[1] + textFormat.color[1] + textFormat.color[2] + textFormat.color[2] + textFormat.color[3] + textFormat.color[3] : textFormat.color) : '#000000'}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTextFormat(prev => ({ ...prev, color: val }));
                    applyAdHocStyle('color', val);
                  }}
                />
              </label>
              <input
                type="text"
                maxLength={7}
                placeholder={nodeColor}
                value={textFormat.color || ''}
                className="w-[68px] h-7 text-[10px] border rounded bg-background px-1.5 font-mono"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const v = e.target.value.trim();
                    if (/^#[0-9a-fA-F]{3,6}$/.test(v)) { applyAdHocStyle('color', v); }
                  }
                }}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setTextFormat(prev => ({ ...prev, color: v }));
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
        <div className="absolute inset-0 z-[100] bg-primary/20 border-4 border-primary border-dashed flex items-center justify-center pointer-events-none transition-all">
          <div className="bg-background px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center">
            <Upload className="w-12 h-12 text-primary mb-3 animate-bounce" />
            <h2 className="text-xl font-bold">Drop images to upload</h2>
          </div>
        </div>
      )}
      <div ref={measureRef} aria-hidden="true" style={{ position: 'fixed', visibility: 'hidden', pointerEvents: 'none', left: -99999, top: -99999, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
      <div className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="text-foreground"><KandMark size={28} /></div>
          <Input value={canvas.name} onChange={(e) => setCanvas({ ...canvas, name: e.target.value })} className="w-64 font-medium border-foreground/20" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={undo} disabled={historyRef.current.past.length === 0} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={historyRef.current.future.length === 0} title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => setApiDialog(true)}><Code2 className="w-4 h-4 mr-2" />API</Button>
          <Button variant="outline" size="sm" onClick={() => setRenderDialog(true)}><Play className="w-4 h-4 mr-2" />Test Render</Button>
          <Button size="sm" onClick={save} disabled={!hasChanges} className={!hasChanges ? "bg-muted text-muted-foreground" : ""}><Save className="w-4 h-4 mr-2" />{hasChanges ? 'Save' : 'Saved'}</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Tabs defaultValue="design" className="w-64 border-r-2 border-foreground/90 bg-card flex flex-col">
          <TabsList className="grid grid-cols-2 rounded-none border-b-2 border-foreground/90 h-11 bg-background">
            <TabsTrigger value="design" className="rounded-none data-[state=active]:bg-card data-[state=active]:border-b-2 data-[state=active]:border-[#D4FF00] font-bold tracking-widest text-xs uppercase">Design</TabsTrigger>
            <TabsTrigger value="classes" className="rounded-none data-[state=active]:bg-card data-[state=active]:border-b-2 data-[state=active]:border-[#D4FF00] font-bold tracking-widest text-xs uppercase">Classes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="design" className="flex-1 flex flex-col p-3 m-0 space-y-1 min-h-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">Add Elements</p>
          <div className="space-y-1.5">
            <Button variant="outline" className="w-full justify-start" onClick={addText}><Type className="w-4 h-4 mr-2" /> Add Text</Button>
            <Button variant="outline" className="w-full justify-start" onClick={openImageDialog}><ImageIcon className="w-4 h-4 mr-2" /> Add Image</Button>
            <Button variant="outline" className="w-full justify-start" onClick={addGradient}><Palette className="w-4 h-4 mr-2" /> Add Gradient</Button>
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => addShape('rect')}><Square className="w-4 h-4 mr-1" /> Rect</Button>
              <Button variant="outline" size="sm" onClick={() => addShape('ellipse')}><Circle className="w-4 h-4 mr-1" /> Circle</Button>
            </div>
          </div>
          <div className={`mt-5 pt-4 border-t flex-col ${sessionImages.length > 0 ? 'flex-[0.5]' : 'flex-1'} min-h-0 flex`}>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">Layers</p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {(canvas.nodes || []).slice().reverse().map((n) => (
                <div key={n.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', n.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={(e) => { e.preventDefault(); if (dragOverId !== n.id) setDragOverId(n.id) }}
                  onDragLeave={(e) => { if (dragOverId === n.id) setDragOverId(null) }}
                  onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setDragOverId(null); reorderByDrag(id, n.id) }}
                  onDragEnd={() => setDragOverId(null)}
                  onClick={() => setSelectedId(n.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing text-sm transition relative ${selectedId === n.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'} ${dragOverId === n.id ? 'border-t-2 border-[#9AB800]' : ''}`}>
                  <GripVertical className="w-3 h-3 text-muted-foreground opacity-60" />
                  {layerIcon(n)}
                  <span className="truncate flex-1">{layerLabel(n)}</span>
                  {n.dynamic_key && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">DYN</span>}
                </div>
              ))}
            </div>
          </div>

          {sessionImages.length > 0 && (
            <div className="mt-3 pt-3 border-t flex-[0.5] min-h-0 flex flex-col">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide flex items-center justify-between">
                <span>Dropped Images</span>
                <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">{sessionImages.length}</span>
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

        <div className="flex-1 overflow-auto flex items-center justify-center p-6"
          style={{ background: 'repeating-conic-gradient(hsl(var(--muted)) 0% 25%, hsl(var(--background)) 0% 50%) 50% / 24px 24px' }}
          onMouseDown={() => setSelectedId(null)}>
          <div ref={canvasRef} className="relative shadow-2xl"
            style={{ width: canvas.width * scale, height: canvas.height * scale, background: canvas.background || '#ffffff', filter: canvasColorFilter }}>
            <div style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
              {(canvas.nodes || []).map((node) => (
                <div key={node.id} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {selectedId === node.id && (node.maxWidth || node.maxHeight) && (
                    <div style={{
                      position: 'absolute', left: node.x, top: node.y,
                      width: node.maxWidth || node.width, height: node.maxHeight || node.height,
                      border: '2px dashed #ec4899', pointerEvents: 'none', zIndex: 10,
                      transform: `rotate(${node.rotation || 0}deg)`, transformOrigin: 'top left', // Note: maxbox aligns with node x,y so origin must be top left if we wanted it to rotate exactly with the node, but wait: the node rotates around center!
                      // If node rotates around center, top-left is not the same. 
                      // Simpler: don't rotate the max box, or rotate it with the same center.
                    }} />
                  )}
                  {selectedId === node.id && (node.maxWidth || node.maxHeight) && (
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
                        const currentIdx = nodeIds.indexOf(selectedId)
                        if (currentIdx !== -1 && currentIdx + 1 < nodeIds.length) setSelectedId(nodeIds[currentIdx + 1])
                        else setSelectedId(nodeIds[0])
                      } else {
                        setSelectedId(node.id)
                      }
                    } else {
                      setSelectedId(node.id) 
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (node.type === 'text') setEditingId(node.id)
                  }}
                   className={node.className ? (node.className.startsWith('.') ? node.className.slice(1) : node.className) : ''}
                  style={{...nodeBoxStyle(node), opacity: editingId === node.id ? 0 : 1}}>
                  {node.type === 'text' ? renderStyledText(parseStyledText(node.text || '', canvas.classes || {}), createElement) :
                   node.type === 'image' && node.src ? (
                    <img src={node.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: buildFilterCss(node.filters) }} draggable={false} />
                   ) :
                   node.type === 'image' ? <div style={{ width: '100%', height: '100%', background: '#e5e7eb' }} /> : null}
                  {/* Handles and Drag surface are now moved to the Selection Overlay below */}
                </div>
                </div>
              ))}
              
              {/* Selection Overlay (handles drag, resize, rotate, and stays on top!) */}
              {selectedId && canvas.nodes?.find(n => n.id === selectedId) && editingId !== selectedId && (
                (() => {
                  const node = canvas.nodes.find(n => n.id === selectedId)
                  return (
                    <div style={{
                      position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
                      transform: `rotate(${node.rotation || 0}deg)`, transformOrigin: 'center center',
                      pointerEvents: 'none', zIndex: 50 // Handles and drag surface are always on top!
                    }}>
                      {/* Drag overlay - catches clicks for dragging even if node is behind */}
                      <div 
                        data-node-id={node.id}
                        onMouseDown={(e) => handleMouseDown(e, node, 'move')}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          if (node.type === 'text') setEditingId(node.id)
                        }}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (e.altKey) {
                            const elements = document.elementsFromPoint(e.clientX, e.clientY)
                            const nodeIds = elements.map(el => el.getAttribute('data-node-id')).filter(Boolean)
                            if (nodeIds.length > 1) {
                              const currentIdx = nodeIds.indexOf(selectedId)
                              if (currentIdx !== -1 && currentIdx + 1 < nodeIds.length) setSelectedId(nodeIds[currentIdx + 1])
                              else setSelectedId(nodeIds[0])
                            } else {
                              setSelectedId(node.id)
                            }
                          }
                        }}
                        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'move' }} 
                      />

                      {/* Resize handle */}
                      <div onMouseDown={(e) => handleMouseDown(e, node, 'resize')}
                        style={{ position: 'absolute', right: -8, bottom: -8, width: 20, height: 20, background: '#6366f1', borderRadius: 4, cursor: 'nwse-resize', border: '2px solid white', pointerEvents: 'auto' }} />
                      
                      {/* Rotate handle */}
                      <div onMouseDown={(e) => handleMouseDown(e, node, 'rotate')}
                        style={{ position: 'absolute', left: '50%', top: -36, width: 16, height: 16, marginLeft: -8, background: '#fff', borderRadius: '50%', cursor: 'grab', border: '2px solid #6366f1', pointerEvents: 'auto' }} />
                      <div style={{ position: 'absolute', left: '50%', top: -20, width: 2, height: 20, marginLeft: -1, background: '#6366f1', pointerEvents: 'none' }} />
                    </div>
                  )
                })()
              )}
              
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

        <div className="w-80 border-l bg-card p-4 overflow-y-auto">
          {!selected ? (
            <CanvasSettingsPanel canvas={canvas} setCanvas={setCanvas} />
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  {selected.type === 'text' ? 'Text' : selected.type === 'image' ? 'Image' : selected.type === 'gradient' ? 'Gradient' : 'Shape'} Properties
                </p>
                <Button variant="ghost" size="icon" onClick={() => deleteNode(selected.id)}><Trash2 className="w-4 h-4" /></Button>
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
                  <ImageProperties node={selected} updateNode={updateNode} />
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
                  <div><Label className="text-xs">Width</Label><Input type="number" value={selected.width} onChange={(e) => updateNode(selected.id, { width: parseInt(e.target.value) || 0 })} /></div>
                  <div><Label className="text-xs">Height</Label><Input type="number" value={selected.height} onChange={(e) => updateNode(selected.id, { height: parseInt(e.target.value) || 0 })} /></div>
                  <div><Label className="text-xs text-pink-500">Max Width</Label><Input type="number" placeholder="none" value={selected.maxWidth || ''} onChange={(e) => updateNode(selected.id, { maxWidth: parseInt(e.target.value) || undefined })} /></div>
                  <div><Label className="text-xs text-pink-500">Max Height</Label><Input type="number" placeholder="none" value={selected.maxHeight || ''} onChange={(e) => updateNode(selected.id, { maxHeight: parseInt(e.target.value) || undefined })} /></div>
                  <div><Label className="text-xs">Rotation °</Label><Input type="number" value={selected.rotation || 0} onChange={(e) => updateNode(selected.id, { rotation: parseInt(e.target.value) || 0 })} /></div>
                </div>

                {selected.type !== 'text' && (
                  <div className="pt-3 border-t">
                    <Label className="text-xs mb-1">Class Name</Label>
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
      </div>

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
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wide">Canvas Settings</p>
      <div className="space-y-3">
        <div>
          <Label className="text-xs mb-1 block">Size Presets</Label>
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
            {CANVAS_PRESETS.map((p) => (
              <button key={p.label} onClick={() => setCanvas({ ...canvas, width: p.w, height: p.h })}
                className="whitespace-nowrap px-2 py-1 bg-muted hover:bg-muted/80 rounded text-[10px] font-medium transition">
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
          <div className="flex gap-2">
            <Input type="color" className="w-14 p-1 h-10" value={canvas.background || '#ffffff'} onChange={(e) => setCanvas({ ...canvas, background: e.target.value })} />
            <Input value={canvas.background || '#ffffff'} onChange={(e) => setCanvas({ ...canvas, background: e.target.value })} />
          </div>
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
        <div>
          <Label className="text-xs">Weight</Label>
          <select className="w-full h-10 border rounded-md px-3 text-sm bg-background" value={node.fontWeight || 400} onChange={(e) => updateNode(node.id, { fontWeight: parseInt(e.target.value) })}>
            {weights.map((w) => <option key={w} value={w}>{w} {WEIGHT_LABELS[w] ? `· ${WEIGHT_LABELS[w]}` : ''}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant={node.fontStyle === 'italic' ? 'default' : 'outline'} size="sm" disabled={!supportsItalic}
          onClick={() => updateNode(node.id, { fontStyle: node.fontStyle === 'italic' ? 'normal' : 'italic' })}>
          <Italic className="w-3.5 h-3.5 mr-1" /> Italic
        </Button>
        {!supportsItalic && <span className="text-xs text-muted-foreground">No italic for this font</span>}
      </div>
      <div>
        <Label className="text-xs">Color</Label>
        <div className="flex gap-2">
          <Input type="color" className="w-14 p-1 h-10" value={node.color || '#000000'} onChange={(e) => updateNode(node.id, { color: e.target.value })} />
          <Input value={node.color || '#000000'} onChange={(e) => updateNode(node.id, { color: e.target.value })} />
        </div>
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
              <Label className="text-xs">Shadow Color</Label>
              <div className="flex gap-2">
                <Input type="color" className="w-14 p-1 h-10" value={(ts.color || '#000000').slice(0, 7)} onChange={(e) => updateNode(node.id, { textShadow: { ...ts, color: e.target.value } })} />
                <Input value={ts.color || '#000000'} onChange={(e) => updateNode(node.id, { textShadow: { ...ts, color: e.target.value } })} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Use 8-digit hex (e.g. #00000080) for transparency.</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ImageProperties({ node, updateNode }) {
  const f = { ...DEFAULT_FILTERS, ...(node.filters || {}) }
  const setFilter = (key, value) => updateNode(node.id, { filters: { ...f, [key]: value } })
  const resetFilters = () => updateNode(node.id, { filters: { ...DEFAULT_FILTERS } })

  const FilterSlider = ({ name, label, min, max, step = 1, suffix = '' }) => (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{f[name]}{suffix}</span>
      </div>
      <Slider value={[f[name]]} min={min} max={max} step={step} onValueChange={(v) => setFilter(name, v[0])} />
    </div>
  )

  return (
    <>
      <div><Label className="text-xs">Image URL</Label><Input value={node.src || ''} onChange={(e) => updateNode(node.id, { src: e.target.value })} /></div>
      <div>
        <Label className="text-xs">Mask / Shape</Label>
        <div className="grid grid-cols-5 gap-1.5 mt-1">
          {MASK_PRESETS.map((m) => (
            <button key={m.value} onClick={() => updateNode(node.id, { mask: m.value })}
              className={`h-12 rounded border text-xs hover:ring-2 hover:ring-primary transition ${node.mask === m.value || (!node.mask && m.value === 'none') ? 'ring-2 ring-primary' : ''}`}>
              <div className="w-7 h-7 mx-auto bg-gradient-to-br from-indigo-400 to-pink-400" style={{
                borderRadius: m.value === 'circle' ? 9999 : m.value === 'pill' ? 14 : m.value === 'rounded' ? 5 : m.value === 'soft' ? 3 : 0
              }} />
              <span className="block text-[10px] mt-0.5 text-muted-foreground">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div><Label className="text-xs">Custom Corner Radius</Label><Input type="number" value={node.borderRadius || 0} onChange={(e) => updateNode(node.id, { borderRadius: parseInt(e.target.value) || 0, mask: 'none' })} /></div>

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
        <div className="flex gap-2">
          <Input type="color" className="w-14 p-1 h-10" value={node.fill || '#6366f1'} onChange={(e) => updateNode(node.id, { fill: e.target.value })} />
          <Input value={node.fill || '#6366f1'} onChange={(e) => updateNode(node.id, { fill: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Stroke</Label><Input type="color" className="w-full p-1 h-10" value={node.stroke || '#000000'} onChange={(e) => updateNode(node.id, { stroke: e.target.value })} /></div>
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
              <div className="flex items-center gap-1.5">
                <Input type="color" className="w-10 h-8 p-1 shrink-0" value={stop.color} onChange={(e) => updateStop(i, { color: e.target.value })} />
                <Input value={stop.color} onChange={(e) => updateStop(i, { color: e.target.value })} className="text-xs font-mono h-8" />
                <Input type="number" min={0} max={100} value={stop.position} onChange={(e) => updateStop(i, { position: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-14 h-8" />
                <span className="text-xs text-muted-foreground">%</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeStop(i)}><X className="w-3.5 h-3.5" /></Button>
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
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Color</Label>
                        <Input type="color" className="h-6 w-full p-0 border-0" value={cls.color || '#000000'} onChange={e => updateClass(name, 'color', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Background</Label>
                        <Input type="color" className="h-6 w-full p-0 border-0" value={cls.background || '#ffffff'} onChange={e => updateClass(name, 'background', e.target.value)} />
                      </div>
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
                        <Input type="number" className="h-7 text-[10px]" value={cls.paddingX ?? ''} onChange={e => updateClass(name, 'paddingX', parseInt(e.target.value))} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Pad Y (px)</Label>
                        <Input type="number" className="h-7 text-[10px]" value={cls.paddingY ?? ''} onChange={e => updateClass(name, 'paddingY', parseInt(e.target.value))} placeholder="0" />
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
                            <Label className="text-[9px]">Color</Label>
                            <div className="flex gap-2">
                              <Input type="color" className="w-10 p-0 h-6 border-0" value={(cls.boxShadow.color || '#000000').slice(0, 7)} onChange={(e) => updateClass(name, 'boxShadow', { ...cls.boxShadow, color: e.target.value })} />
                              <Input className="h-6 text-[10px]" value={cls.boxShadow.color || '#000000'} onChange={(e) => updateClass(name, 'boxShadow', { ...cls.boxShadow, color: e.target.value })} />
                            </div>
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
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Fill</Label>
                        <Input type="color" className="h-6 w-full p-0 border-0" value={cls.fill || '#6366f1'} onChange={e => updateClass(name, 'fill', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Stroke</Label>
                        <Input type="color" className="h-6 w-full p-0 border-0" value={cls.stroke || '#000000'} onChange={e => updateClass(name, 'stroke', e.target.value)} />
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
