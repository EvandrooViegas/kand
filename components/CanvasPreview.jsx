export function buildGradientCssClient(node) {
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

export function buildFilterCssClient(filters) {
  if (!filters) return 'none'
  const f = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0, sepia: 0, hueRotate: 0, opacity: 100, ...filters }
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) hue-rotate(${f.hueRotate}deg) blur(${f.blur}px) opacity(${f.opacity}%)`
}

export function CanvasPreview({ canvas, containerWidth = 320 }) {
  if (!canvas) return null;
  const w = canvas.width || 1080
  const scale = containerWidth / w
  const colorFilter =
    canvas.colorMode === 'grayscale' ? 'grayscale(100%)' :
    canvas.colorMode === 'sepia' ? 'sepia(80%) saturate(120%)' :
    canvas.colorMode === 'invert' ? 'invert(100%)' :
    canvas.colorMode === 'high-contrast' ? 'contrast(160%)' : 'none'
  
  const isCarousel = canvas.type === 'carousel'
  const firstPage = isCarousel ? canvas.pages?.[0] : null
  const nodes = (isCarousel ? firstPage?.nodes : canvas.nodes) || []
  const bg = (isCarousel ? firstPage?.background : canvas.background) || '#ffffff'

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: bg, filter: colorFilter }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: canvas.height || 1080, position: 'relative' }}>
        {nodes.map((n) => {
          const base = {
            position: 'absolute', left: n.x, top: n.y, width: n.width, height: n.height,
            display: 'flex', alignItems: 'center',
            justifyContent: n.textAlign === 'center' ? 'center' : n.textAlign === 'right' ? 'flex-end' : 'flex-start',
            overflow: n.type === 'text' ? 'visible' : 'hidden',
          }
          let style = base
          if (n.type === 'text') {
            style = { ...base, color: n.color || '#000', fontSize: n.fontSize || 48, fontWeight: n.fontWeight || 400,
              fontStyle: n.fontStyle === 'italic' ? 'italic' : 'normal',
              fontFamily: `'${n.fontFamily || 'Inter'}', sans-serif`,
              textShadow: n.textShadow?.enabled ? `${n.textShadow.offsetX || 0}px ${n.textShadow.offsetY || 0}px ${n.textShadow.blur || 0}px ${n.textShadow.color || '#000'}` : 'none' }
          } else if (n.type === 'shape') {
            style = { ...base, background: n.fill || '#6366f1',
              borderRadius: n.shape === 'ellipse' ? Math.max(n.width, n.height) : (n.borderRadius || 0),
              border: n.strokeWidth ? `${n.strokeWidth}px solid ${n.stroke || '#000'}` : 'none' }
          } else if (n.type === 'gradient') {
            style = { ...base, backgroundImage: buildGradientCssClient(n),
              borderRadius: n.shape === 'ellipse' ? Math.max(n.width, n.height) : (n.borderRadius || 0) }
          } else if (n.type === 'image') {
            const br = n.borderRadius || 0
            const cL = n.cropLeft || 0
            const cR = n.cropRight || 0
            const cT = n.cropTop || 0
            const cB = n.cropBottom || 0
            const hasClip = cL > 0 || cR > 0 || cT > 0 || cB > 0
            style = {
              ...base,
              borderRadius: br,
              ...(hasClip ? { clipPath: `inset(${cT}% ${cR}% ${cB}% ${cL}% round ${br}px)` } : {}),
            }
          }
          return (
            <div key={n.id} style={style}>
              {n.type === 'text' ? (n.text || '') : n.type === 'image' && n.src ? (
                <img src={n.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: buildFilterCssClient(n.filters) }} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
