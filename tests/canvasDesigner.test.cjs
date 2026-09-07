const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/handlers/canvasDesignerHandler.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace('export async function', 'async function')
const engine = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({validateDesignSpec,renderDesignSpec,fitText,fitTextLayout,normalizeDesignSystem,buildStrategyPalette,ensureContrast,contrastRatio,parseArtDirection,buildSingleCanvas,buildCarouselCanvas,buildPrompt,handleDesignCanvas})', {
  uuidv4: require('node:crypto').randomUUID, console, process: { env: {} },
  NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) }, corsify: response => response,
})
test('global art direction supplies consistent typography, palette, and visual defaults', () => {
  const carousel = { format: 'carousel', slots: [slot, { ...slot, slot_id: 'two' }] }
  const image = { type: 'image', assetId: 'one', x: 700, y: 90, width: 200, height: 300 }
  const global = { typography: { heading: 'Oswald', body: 'Lato', headingWeight: 600 }, palette_strategy: 'monochromatic', spacing: 'generous', image_treatment: 'warm', radius: 'rounded', density: 'sparse', decoration: 'rich' }
  const dir = engine.parseArtDirection(JSON.stringify({ global, slides: [{ ...spec, elements: [text, image] }, { ...spec, slot_id: 'two' }] }), carousel, { colors: ['#d97706'] })
  assert.equal(dir.slides[0].heading_font, 'Oswald')
  assert.equal(dir.slides[1].design.elements[0].font, 'Oswald')
  assert.deepEqual(dir.slides[0].palette, dir.slides[1].palette)
  assert.equal(dir.slides[0].design.elements[0].x, 88)
  assert.equal(dir.slides[0].design.elements[1].radius, 36)
  assert.equal(dir.slides[0].design.elements[1].treatment, 'warm')
})
test('all palette strategies derive valid colors with readable text', () => {
  const accents = new Set()
  for (const palette_strategy of ['analogous','complementary','split_complementary','monochromatic','neutral_brand']) {
    const palette = engine.buildStrategyPalette(['#d97706'], engine.normalizeDesignSystem({ palette_strategy }))
    assert.equal(palette.primary, '#d97706')
    for (const value of Object.values(palette)) assert.match(value, /^#[0-9a-f]{6}$/i)
    assert.ok(engine.contrastRatio(palette.text, palette.bg) >= 4.5)
    assert.ok(engine.contrastRatio(palette.mutedText, palette.bg) >= 4.5)
    accents.add(palette.accent)
  }
  assert.equal(accents.size, 5)
})
test('adaptive fitting adjusts height and line height and honors minimum font size', () => {
  const result = engine.fitTextLayout({ text: 'Hello', width: 500, height: 85, preferredSize: 70, minSize: 60, lineHeight: 1.5 })
  assert.equal(result.fontSize, 70)
  assert.ok(result.lineHeight < 1.5)
  assert.ok(result.height <= 85)
  const short = engine.fitTextLayout({ text: 'Hello', width: 500, height: 300, preferredSize: 70 })
  assert.ok(short.height < 300)
  assert.throws(() => engine.fitTextLayout({ text: 'Impossible', width: 20, height: 30, preferredSize: 70, minSize: 60 }))
})
test('composite primitives emit only supported KAND nodes and preserve badge copy', () => {
  const elements = [text, { type: 'badge', role: 'cta', x: 80, y: 600, width: 300, height: 90 },
    ...['floating_card','decorative_number','dot_pattern','gradient_scrim','image_frame','ellipse','accent_stripe'].map((type, i) => ({ type, x: 750, y: 80 + i * 100, width: 180, height: 70 }))]
  const d = direction({ ...spec, elements }).slides[0]
  const output = engine.renderDesignSpec(d.design, { d, headline: 'Title', body: '', eyebrow: '', cta: 'Explore', slideNumber: 2 })
  assert.ok(output.nodes.every(n => ['text','image','shape','gradient'].includes(n.type)))
  assert.ok(output.nodes.some(n => n.text === 'Explore'))
  assert.ok(output.nodes.some(n => n.text === '03'))
  assert.ok(output.nodes.some(n => n.type === 'gradient' && n.stops[1].alpha === 0))
})
test('positioned logo uses the trusted URL, no duplicate automatic logo', () => {
  const d = direction({ ...spec, elements: [text, { type: 'logo', x: 600, y: 700, width: 140, height: 70, src: 'https://untrusted.invalid' }] }).slides[0]
  Object.assign(d, { logo_url: 'https://example.com/logo.png', logo_placement: 'bottom_right', logo_pill: false })
  const output = engine.renderDesignSpec(d.design, { d, headline: 'Title', body: '', cta: '', eyebrow: '' })
  const logos = output.nodes.filter(n => n.type === 'image')
  assert.equal(logos.length, 1)
  assert.equal(logos[0].x, 600)
  assert.equal(logos[0].src, d.logo_url)
})
test('invalid global numbers and fonts normalize; duplicate slide IDs use fallback', () => {
  const global = engine.normalizeDesignSystem({ typography: { heading: {}, headingWeight: 'heavy', bodySize: Infinity }, spacing: {} })
  assert.equal(global.typography.heading, 'Inter')
  assert.ok(Number.isFinite(global.typography.bodySize))
  const dir = engine.parseArtDirection(JSON.stringify({ slides: [spec, spec] }), plan, {})
  assert.equal(dir.slides[0].design, undefined)
})
test('malformed design and oversized copy cannot break legacy fallback generation', () => {
  const dir = engine.parseArtDirection(JSON.stringify({ slides: [{ ...spec, elements: [{ ...text, width: 1, height: 1 }] }] }), plan, {})
  const canvas = engine.buildSingleCanvas({ headline: 'Very long headline '.repeat(100) }, plan, dir, 'Fallback')
  assert.ok(canvas.nodes.length > 0)
})
test('API fallback persists existing canvas contract without a Groq key', async () => {
  let saved
  const db = { collection: name => { assert.equal(name, 'canvases'); return { insertOne: async value => { saved = value; value._id = 'database-id' } } } }
  const response = await engine.handleDesignCanvas(db, { copy: { headline: 'Title' }, resolvedPlan: plan, brandContext: {} })
  assert.equal(response.status, 200)
  assert.equal(saved.type, 'single'); assert.equal(saved.width, 1080)
  assert.ok(saved.nodes.length > 0)
  assert.equal(response.body._id, undefined)
  const invalid = await engine.handleDesignCanvas(db, { copy: { headline: 'Title' }, resolvedPlan: { slots: [] } })
  assert.equal(invalid.status, 400)
})
const slot = { slot_id: 'one', resolvedAsset: { url: 'https://example.com/photo.png' } }
const plan = { format: 'single', slots: [slot] }
const text = { type: 'text', role: 'headline', x: 80, y: 170, width: 500, height: 250 }
const spec = { slot_id: 'one', background: { type: 'solid' }, elements: [text] }
function direction(slide = spec) { return engine.parseArtDirection(JSON.stringify({ slides: [slide] }), plan, { colors: ['#d97706'] }) }
test('AI coordinates reach canvas and copy is bound by role', () => {
  const canvas = engine.buildSingleCanvas({ headline: 'Sustainable construction' }, plan, direction(), 'test')
  const node = canvas.nodes.find(n => n.type === 'text')
  assert.equal(node.x, 80); assert.equal(node.y, 170); assert.equal(node.width, 500)
  assert.equal(node.text, 'Sustainable construction')
})
test('untrusted geometry, duplicate roles and foreign assets are sanitized', () => {
  const validated = engine.validateDesignSpec({ elements: [text, text, { ...text, x: NaN }, { type: 'image', assetId: 'foreign', x: 0, y: 0, width: 100, height: 100 }] }, slot)
  assert.equal(validated.elements.length, 1)
  assert.equal(engine.validateDesignSpec({ elements: [] }, slot), undefined)
  assert.equal(engine.validateDesignSpec({ elements: Array(41).fill(text) }, slot), undefined)
})
test('long copy shrinks, explicit newlines wrap, impossible text fails', () => {
  const short = engine.fitText('Short headline', 500, 250, 90)
  const long = engine.fitText('How sustainable construction is changing the future of Portuguese infrastructure', 500, 250, 90)
  assert.ok(long < short)
  assert.ok(engine.fitText('One\nTwo\nThree', 500, 150, 90) < 50)
  assert.throws(() => engine.fitText('x'.repeat(10000), 100, 20, 90))
})
test('contrast meets AA while preserving color instead of snapping to white', () => {
  const adjusted = engine.ensureContrast('#d97706', '#ffffff')
  assert.ok(engine.contrastRatio(adjusted, '#ffffff') >= 4.5)
  assert.notEqual(adjusted, '#000000'); assert.notEqual(adjusted, '#ffffff')
})
test('missing copy and colliding text invalidate the layout', () => {
  const d = direction().slides[0]
  const input = { d, headline: 'Title', body: 'Body', cta: '', eyebrow: '', imageUrl: slot.resolvedAsset.url }
  assert.throws(() => engine.renderDesignSpec(d.design, input), /Missing copy/)
  const collision = engine.validateDesignSpec({ elements: [text, { ...text, role: 'body' }] }, slot)
  assert.throws(() => engine.renderDesignSpec(collision, input), /collide/)
})
test('image-backed copy gets a contrast surface; decoration cannot hide text', () => {
  const d = direction({ ...spec, background: { type: 'image' }, elements: [text, { type: 'ring', x: 700, y: 100, width: 100, height: 100, layer: 20 }] }).slides[0]
  const result = engine.renderDesignSpec(d.design, { d, headline: 'Title', body: '', cta: '', eyebrow: '', imageUrl: slot.resolvedAsset.url })
  assert.equal(result.nodes.at(-1).type, 'text')
  assert.equal(result.nodes.at(-2).type, 'shape')
  assert.equal(result.nodes.find(n => n.shape === 'ellipse').fill, '#00000000')
})
test('carousel matches slot IDs even when AI reorders slides', () => {
  const carousel = { format: 'carousel', slots: [slot, { ...slot, slot_id: 'two' }] }
  const d = engine.parseArtDirection(JSON.stringify({ slides: [{ ...spec, slot_id: 'two', elements: [{ ...text, x: 300 }] }, spec] }), carousel, {})
  assert.equal(d.slides[0].design.elements[0].x, 80)
  assert.equal(d.slides[1].design.elements[0].x, 300)
})
test('prompt includes body and CTA and malformed JSON retains fallback', () => {
  const prompt = JSON.parse(engine.buildPrompt({}, { headline: 'Title', supportingText: 'Body', cta: 'Visit' }, plan))
  assert.equal(prompt.slides[0].body, 'Body'); assert.equal(prompt.slides[0].cta, 'Visit')
  assert.equal(engine.parseArtDirection('{', plan, {}).slides.length, 1)
})
test('logo moves away from occupied text', () => {
  const d = direction({ ...spec, elements: [{ ...text, x: 740, y: 940, width: 270, height: 70 }] }).slides[0]
  Object.assign(d, { logo_url: 'https://example.com/logo.png', logo_placement: 'bottom_right', logo_size: 100 })
  const result = engine.renderDesignSpec(d.design, { d, headline: 'Title', body: '', cta: '', eyebrow: '', imageUrl: null })
  assert.ok(result.nodes.at(-1).x < 200)
})
test('fallback preserves all supplied copy', () => {
  const copy = { headline: 'A sustainable future', supportingText: 'Building better places for everyone.', cta: 'Learn more' }
  const d = engine.parseArtDirection('{}', plan, {})
  const canvas = engine.buildSingleCanvas(copy, plan, d, 'Fallback')
  for (const value of Object.values(copy)) assert.ok(canvas.nodes.some(n => n.text === value))
})
