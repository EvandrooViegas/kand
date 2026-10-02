module.exports = request => {
  if (request.messages[0].content.startsWith('Extract')) return { name: 'Golden Editorial', description: 'Angular motifs and oversized typography.', tags: ['editorial'], typography: { headingFallback: 'DM Sans', bodyFallback: 'Inter' }, referenceStyle: { primary: '#ffffff', secondary: '#111111', accent: '#ffe05b', background: '#ffffff', textPrimary: '#111111' }, identity: { typography: 'Bold 90px headlines, 30px body.', placement: 'Asymmetric upper grid.', colorUsage: 'Pale field with yellow accents.', decoration: 'Small rotated diamonds.', shadows: 'Soft black shadow, blur 8, offset 2, opacity .2.', contrast: 'Dark copy on pale panels.', imagery: 'Large focal subject with quiet text zones.', signature: 'Angular diamond rhythm with oversized left typography.' } }
  const mode = request.messages[0].content.match(/Required imagery: (\w+)/)[1]
  const requested = request.messages[0].content.match(/Variation number: (\d+)/)?.[1]
  return { variants: (requested ? [Number(requested) - 1] : [0, 1, 2]).map(i => ({ name: `${mode} composition ${i}`, rationale: 'Angular motifs with asymmetric text and yellow accents.', background: 'brand.background', nodes: [
    { id: 'headline', type: 'text', text: '{{headline}}', x: 80 + i * 20, y: 100 + i * 30, width: 700, height: 200, fontFamily: 'brand.headingFont', fontSize: 70, color: 'brand.textPrimary' },
    ...(i ? [{ id: 'body', type: 'text', text: '{{body}}', x: 80, y: 370, width: 800, height: 180, fontFamily: 'brand.bodyFont', fontSize: 30, color: 'brand.textPrimary' }] : []),
    { id: 'motif', type: 'shape', shape: 'rect', x: 850, y: 100, width: 40, height: 40, rotation: 45, fill: 'brand.accent', shadow: { color: 'brand.overlay', blur: 8, offsetX: 2, offsetY: 2, opacity: .2 } },
    ...(mode === 'none' ? [] : [{ id: 'photo', type: 'image', src: '{{image.primary}}', imageType: mode, x: 80, y: 620, width: 900, height: 650, objectFit: mode === 'cutout' ? 'contain' : 'cover' }]),
  ] })) }
}
