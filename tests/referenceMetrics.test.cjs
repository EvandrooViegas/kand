const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const sharp = require('sharp')
const { stripTypeScriptTypes } = require('node:module')
const source = stripTypeScriptTypes(fs.readFileSync('lib/designs/global/referenceMetrics.ts', 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''))
const { measureReference, applyReferenceMetrics } = new Function('sharp', source + ';return { measureReference, applyReferenceMetrics }')(sharp)
const { types, study, generation } = require('./globalDesigns.test.cjs')

// A line of "words": white (or coloured) bars with word gaps, like set type seen at low resolution.
const words = (x, y, widths, fill = '#ffffff', h = 50) => { let cx = x; return widths.map(w => { const r = `<rect x="${cx}" y="${y}" width="${w}" height="${h}" fill="${fill}"/><rect x="${cx + 14}" y="${y + 14}" width="${Math.max(4, w - 28)}" height="${h - 28}" fill="#111111"/>`; cx += w + 22; return r }).join('') }
const centred = (y, widths, fill) => { const total = widths.reduce((a, b) => a + b, 0) + 22 * (widths.length - 1); return words(Math.round(540 - total / 2), y, widths, fill) }
const image = async body => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#151515"/>${body}</svg>`)).png().toBuffer()

test('measures centred copy, an outlined accent box around the headline, and no coloured copy', async () => {
  const m = await measureReference(await image(`${centred(860, [140, 90, 210, 120, 80])}<rect x="110" y="940" width="860" height="160" fill="none" stroke="#d4a72c" stroke-width="7"/>${centred(990, [260, 300])}${centred(1150, [120, 160, 90])}`))
  assert.equal(m.align, 'center')
  assert.ok(m.box && Math.abs(m.box.x - .1) < .02 && Math.abs(m.box.width - .8) < .03, JSON.stringify(m.box))
  assert.equal(m.coloredText, false)
  assert.equal(m.rules, 0, 'the box edges are not separate rules')
})

test('measures left-aligned copy, a separate accent rule, coloured words, and ignores a saturated sky', async () => {
  const left = await measureReference(await image(`<rect x="0" y="0" width="1080" height="300" fill="#2f6fd6"/>${words(110, 700, [200, 120, 160])}${words(110, 780, [90, 260])}${words(110, 860, [150, 110, 70, 130])}<rect x="110" y="960" width="420" height="6" fill="#d4a72c"/>`))
  assert.equal(left.align, 'left')
  assert.equal(left.box, null, 'the sky is not a box')
  assert.ok(left.rules >= 1, 'the thin rule is found')
  const coloured = await measureReference(await image(`${centred(700, [200, 160], '#2ecc71')}${centred(780, [180, 220], '#2ecc71')}`))
  assert.equal(coloured.coloredText, true)
})

test('measurements correct the study: alignment, a headline box on the boxed reference only, no invented emphasis or rules', () => {
  const study = {
    composition: 'The text is always left-aligned and anchored to the bottom edge.', typography: 'Heavy condensed headline.', hierarchy: 'Headline, subtitle.', decorative: 'A thin accent rule.',
    familyRules: ['Text must be left-aligned and anchored to the bottom.', 'Headlines are heavy and condensed.'], variantRules: [], avoid: ['Centering the text block.', 'Serif fonts.'],
    grammar: { alignment: ['left'], emphasis: 'color', headline: { frame: 'none' }, decorations: [{ kind: 'line' }, { kind: 'glow' }],
      references: [{ composition: 'image-led', align: 'left' }, { composition: 'image-led', align: 'left' }, { composition: 'image-led', align: 'left' }] },
  }
  const metrics = [{ align: 'center', box: { x: .1, y: .8, width: .8, height: .1 }, rules: 0, coloredText: false, lines: [] }, { align: 'center', box: null, rules: 0, coloredText: false, lines: [] }, { align: null, box: null, rules: 0, coloredText: false, lines: [] }]
  const fixed = applyReferenceMetrics(study, metrics)
  assert.deepEqual(fixed.grammar.alignment, ['center'])
  assert.deepEqual(fixed.grammar.references.map(r => [r.align, r.frame]), [['center', true], ['center', false], ['center', false]], 'the unmeasured reference follows the others')
  assert.equal(fixed.grammar.headline.frame, 'outline')
  assert.equal(fixed.grammar.emphasis, 'none')
  assert.deepEqual(fixed.grammar.decorations.map(d => d.kind), ['glow'], 'the "rule" was the box edges')
  assert.match(fixed.composition, /centred/)
  assert.ok(!fixed.familyRules.some(r => /left-aligned/.test(r)) && fixed.familyRules.includes('Copy is centred on the canvas.'))
  assert.deepEqual(fixed.avoid, ['Serif fonts.'])
  // Disagreeing references leave the model's alignment alone.
  assert.deepEqual(applyReferenceMetrics(study, [{ ...metrics[0], align: 'left' }, metrics[1]]).grammar.alignment, ['left'])
})

test('only slides that follow a boxed reference get the headline box', () => {
  const family = study.reconcileStudy(types.familySchema.parse({
    id: 'industrial', schemaVersion: 1, version: 1, name: 'Industrial', description: 'd', tags: [], width: 1080, height: 1350,
    typography: { headingFallback: 'Inter', bodyFallback: 'Inter' }, referenceStyle: { primary: '#d4a72c', secondary: '#111111', accent: '#d4a72c', background: '#111111', textPrimary: '#ffffff' },
    referenceImages: [1, 2].map(i => ({ id: `r${i}`, url: `/api/uploads/ref-${i}`, name: `r${i}.png`, width: 1080, height: 1350 })), analysis: '', variants: [],
    study: { personality: 'p', composition: 'c', spaceDensity: 's', typography: 't', colorContrast: 'cc', colorRoles: {}, imagery: { mode: 'none' }, decorative: 'd', hierarchy: 'h', logoPlacement: 'l', distinctive: [], familyRules: [], variantRules: [], avoid: [],
      grammar: { compositions: ['statement'], headline: { scale: 'large', weight: 'black', frame: 'outline' }, alignment: ['center'], anchors: ['bottom'], surfaces: ['dark'],
        references: [{ composition: 'statement', align: 'center', anchor: 'bottom', frame: true }, { composition: 'statement', align: 'center', anchor: 'bottom', frame: false }] } },
  }))
  const post = generation.renderGlobalPost(family, { name: 'PRUMO' }, { format: 'carousel', slides: [{ headline: 'Sumol+Compal' }, { headline: 'Montagem de andaimes' }, { headline: 'Fachada' }] }, { slots: [] }, { id: 'global-x' }, crypto.randomUUID)
  assert.deepEqual(post.pages.map(p => p.nodes.some(n => n.designRole === 'headline-frame')), [true, false, false])
})
