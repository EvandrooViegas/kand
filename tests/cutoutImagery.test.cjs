const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { load, seeds, types, generation, study } = require('./globalDesigns.test.cjs')

const STUDY = { personality: 'p', composition: 'c', spaceDensity: 's', typography: 't', colorContrast: 'cc', colorRoles: {}, decorative: 'd', hierarchy: 'h', logoPlacement: 'Small top-left anchor', distinctive: [], familyRules: [], variantRules: [], avoid: [] }
// Shaped like the published "Deep Forest" study: the mode says fullBleed, the prose describes a cutout.
const FOREST_IMAGERY = { mode: 'fullBleed', usage: 'Large photographic cutout that runs off the bottom and side edges, overlapping the text zone', placement: 'bottom, full width', cropBehavior: 'full-bleed, runs off canvas edges', frequency: 'some' }
const family = (imagery, grammarImagery = {}) => study.reconcileStudy(types.familySchema.parse({
  id: 'forest', schemaVersion: 1, version: 1, name: 'Forest', description: 'Dark field with a large subject.', tags: [], width: 1080, height: 1350,
  typography: { headingFallback: 'Inter', bodyFallback: 'Inter' }, referenceStyle: { primary: '#123b26', secondary: '#0b2a1a', accent: '#b6f23a', background: '#0b2a1a', textPrimary: '#ffffff' },
  referenceImages: [{ id: 'r1', url: '/api/uploads/ref-1', name: 'r1.png', width: 1080, height: 1350 }], analysis: '', variants: [],
  study: { ...STUDY, imagery, grammar: { compositions: ['statement', 'stacked', 'image-led', 'list', 'closing'], headline: { scale: 'large', weight: 'black' }, alignment: ['left'], anchors: ['top'], surfaces: ['dark'],
    imagery: { scale: 'dominant', positions: ['bottom', 'full'], shape: 'rect', overlap: 'text', dominance: 'dominates', overlay: 'none', frequency: 'every', tone: 'color', ...grammarImagery } } },
}))
const brand = { id: 'kachica', name: 'KACHICA', designTokens: { primary: '#a62800', accent: '#a62800', background: '#ffffff', textPrimary: '#111827' }, fonts: ['Oswald', 'Space Grotesk'] }
const copy = { format: 'carousel', slides: [
  { headline: 'Ainda faz tudo à mão?', body: 'A automação liberta horas todos os dias.', design: { composition: 'image-led', image: { subject: 'hand holding a smartphone' } } },
  { headline: 'Menos tarefas repetidas', body: 'Agendamentos e lembretes correm sozinhos.', design: { composition: 'stacked', image: { subject: 'laptop with an open calendar' } } },
  { headline: 'Fale connosco', body: 'Veja a diferença no primeiro mês.', cta: 'Fale connosco', design: { composition: 'closing', image: null } },
] }

test('cutout studies are recognised from their imagery prose even when the mode label says fullBleed or mixed', () => {
  const of = (imagery, grammar) => study.familyCutouts({ study: { imagery, ...(grammar ? { grammar: { imagery: grammar } } : {}) }, variants: [] })
  assert.equal(of(FOREST_IMAGERY), 'always')
  assert.equal(of({ mode: 'mixed', usage: 'When present, it consists of high-contrast, monochrome or desaturated cutouts of subjects (like hands).' }), 'always')
  assert.equal(of({ mode: 'mixed', usage: 'Background photos on covers; isolated product cutouts on content slides.' }), 'some')
  assert.equal(of({ mode: 'cutout' }), 'always')
  assert.equal(of({ mode: 'background', usage: 'Every slide is a full-bleed photograph.' }), 'never')
  assert.equal(of({ mode: 'contained', usage: 'Framed photos only, never cutouts.' }), 'never')
  assert.equal(of({ mode: 'none', usage: 'Typography with cutout shapes.' }), 'never')
  assert.equal(of(FOREST_IMAGERY, { cutout: 'never' }), 'never', 'a stated grammar value wins over the prose')
  assert.equal(family(FOREST_IMAGERY).study.grammar.imagery.cutout, 'always', 'reconciling a study states the inferred value so the editor shows it')
})

test('cutout slides ask for a transparent PNG subject, never a photograph, and photo slides may fall back to a cutout', () => {
  const forest = family(FOREST_IMAGERY)
  const slots = generation.globalLayoutPlan(forest, 'global-forest', copy).slots
  const pictured = slots.filter(s => s.needs_visual)
  assert.ok(pictured.length >= 2)
  for (const slot of pictured) {
    assert.equal(slot.treatment, 'isolated_subject'); assert.equal(slot.imageMode, 'cutout'); assert.equal(slot.cutoutFallback, false)
    assert.match(slot.brief, /Transparent PNG cutout/); assert.match(slot.brief, /no background/)
    assert.ok(slot.frame.height < 1350, 'a cutout never fills the canvas behind the copy')
  }
  assert.match(pictured[0].brief, /cut off by the bottom edge/, 'a grounded subject may rise from the bottom edge')
  const photo = study.reconcileStudy(seeds[2])
  const photoSlots = generation.globalLayoutPlan(photo, 'global-photo', { format: 'single', headline: 'Escape the routine', supportingText: 'Go somewhere quiet.' }).slots
  assert.equal(photoSlots[0].treatment, 'environmental'); assert.equal(photoSlots[0].cutoutFallback, true)
})

test('a cutout keeps its proportions, stands on the lower edge and never sits under the copy', () => {
  const forest = family(FOREST_IMAGERY)
  const layout = generation.globalLayoutPlan(forest, 'global-forest', copy)
  const resolved = { slots: layout.slots.map(s => ({ slot_id: s.slot_id, treatment: s.treatment, resolvedAsset: s.needs_visual ? { url: `/api/uploads/gen-${s.slot_id}`, width: 1024, height: 1536, subject: { url: `/api/uploads/cut-${s.slot_id}`, width: 600, height: 900 } } : null })) }
  const post = generation.renderGlobalPost(forest, brand, copy, resolved, { id: 'global-forest' }, crypto.randomUUID)
  for (const [i, page] of post.pages.entries()) {
    const image = page.nodes.find(n => n.designRole === 'image')
    if (!layout.slots[i].needs_visual) { assert.equal(image, undefined); continue }
    assert.equal(image.src, `/api/uploads/cut-${layout.slots[i].slot_id}`, 'the trimmed transparent derivative is used')
    assert.equal(image.objectFit, 'contain'); assert.equal(image.mask, undefined)
    assert.ok(Math.abs(image.width / image.height - 600 / 900) < .01, 'the node hugs the subject')
    assert.equal(image.y + image.height, 1350, 'stands on the bottom edge')
    assert.equal(page.nodes.some(n => n.designRole === 'overlay'), false, 'no photo overlay behind a cutout')
    for (const text of page.nodes.filter(n => n.type === 'text' && ['headline', 'body'].includes(n.designRole))) assert.ok(text.y + text.height <= image.y + 1, `${text.designRole} stays above the subject`)
  }
})

test('a photo slot filled with a generated cutout is composed as a cutout, and a slide without any image keeps its typography', () => {
  const photo = study.reconcileStudy(seeds[2])
  const single = { format: 'single', headline: 'Escape the routine', supportingText: 'Go somewhere quiet.' }
  const fallback = generation.renderGlobalPost(photo, brand, single, { slots: [{ slot_id: 'single_main', treatment: 'isolated_subject', source: 'ai_generated', resolvedAsset: { url: '/api/uploads/gen', subject: { url: '/api/uploads/cut', width: 500, height: 700 } } }] }, { id: 'global-photo' }, crypto.randomUUID)
  const image = fallback.nodes.find(n => n.designRole === 'image')
  assert.equal(image.src, '/api/uploads/cut'); assert.equal(image.objectFit, 'contain')
  assert.ok(image.width < 1080 && image.y + image.height === 1350)
  const missing = generation.renderGlobalPost(photo, brand, single, { slots: [{ slot_id: 'single_main', resolvedAsset: null, warning: 'quota' }] }, { id: 'global-photo' }, crypto.randomUUID)
  assert.equal(missing.nodes.some(n => n.type === 'image' && n.designRole === 'image'), false)
  assert.ok(missing.nodes.some(n => n.designRole === 'headline'))
  assert.match(missing.validation.warnings.join(' '), /no fitting image was available \(quota\)/)
})

function planner(writeCopy, planAssets) {
  return load('lib/handlers/postPlanHandler.ts', ['handlePlanPost', 'designPlanningPrompt', 'sanitizeDesignPlan', 'galleryCutouts', 'cutoutLabel'], {
    NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) }, corsify: r => r,
    loadGenerationBrandContext: async (_db, body) => ({ id: 'kachica', name: 'KACHICA', ...body.brandContext }),
    chooseBrandFamily: async (_db, b) => b.family ? { family: b.family, design: { id: 'global-' + b.family.id } } : null,
    studyForPlanning: study.studyForPlanning, familyGrammar: study.familyGrammar, familyImagery: study.familyImagery, familyCutouts: study.familyCutouts,
    writeCopy, copyErrorResponse: error => ({ body: { error: error.message }, status: error.status || 500 }), planAssets,
  })
}
const GALLERY = [{ ref: 'g1', id: 'generated-phone', description: 'hand holding a smartphone' }, { ref: 'g2', id: 'generated-laptop', description: 'laptop with an open calendar' }]

test('the copy plan reuses a fitting gallery cutout by reference, at most once per post, and only for cutout studies', () => {
  const forest = family(FOREST_IMAGERY)
  const { designPlanningPrompt, sanitizeDesignPlan } = planner()
  const prompt = designPlanningPrompt(forest, GALLERY)
  assert.match(prompt, /transparent cutout/); assert.match(prompt, /BRAND GALLERY CUTOUTS/); assert.match(prompt, /g1 = "hand holding a smartphone"/)
  const photoPrompt = designPlanningPrompt(study.reconcileStudy(seeds[2]))
  assert.doesNotMatch(photoPrompt, /GALLERY|"reuse"/); assert.match(photoPrompt, /English stock search/)
  const plan = sanitizeDesignPlan(forest, { format: 'carousel', slides: [
    { headline: 'One', design: { composition: 'image-led', image: { reuse: 'g1' } } },
    { headline: 'Two', design: { composition: 'stacked', image: { subject: 'a hand with a phone', reuse: 'g1' } } },
    { headline: 'Three', design: { composition: 'image-led', image: { subject: 'a desk lamp', reuse: 'g9' } } },
    { headline: 'Four', design: { composition: 'stacked', image: { subject: 'saved copy', reuse: 'generated-laptop' } } },
  ] }, GALLERY)
  const images = plan.slides.map(s => s.design.image)
  assert.deepEqual(images[0], { subject: 'hand holding a smartphone', queries: [], kind: 'cutout', reuse: 'generated-phone' })
  assert.equal(images[1].reuse, undefined, 'the same cutout is not reused twice in one post')
  assert.equal(images[2].reuse, undefined, 'unknown refs are dropped')
  assert.equal(images[3].reuse, 'generated-laptop', 're-planning saved copy keeps a real gallery id')
})

test('planning loads the brand cutouts once and threads the chosen reuse into the asset plan', async () => {
  const forest = family(FOREST_IMAGERY)
  const queries = []
  const db = { collection: name => ({ find: query => { queries.push([name, query]); return { sort: () => ({ limit: () => ({ toArray: async () => [{ id: 'generated-phone', subject_description: 'hand holding a smartphone' }] }) }) } } }) }
  let prompt = '', planned
  const { handlePlanPost } = planner(async (_brand, _idea, design) => { prompt = design.prompt; return { copy: { format: 'single', headline: 'Ainda faz tudo à mão?', design: { composition: 'image-led', image: { reuse: 'g1' } } } } }, async (_db, input) => { planned = input.copy; return { slots: [] } })
  const result = await handlePlanPost(db, { brandContext: { family: forest }, idea: { topic: 'Automação' } })
  assert.equal(result.status, 200)
  assert.deepEqual(queries, [['assets', { brand_id: 'brand_kachica', source: 'ai_generated', status: 'ready', treatment: 'isolated_subject' }]])
  assert.match(prompt, /g1 = "hand holding a smartphone"/)
  assert.equal(planned.design.image.reuse, 'generated-phone')
  const photoQueries = queries.length
  await planner(async () => ({ copy: { format: 'single', headline: 'Escape', design: { composition: 'statement', image: null } } }), async () => ({ slots: [] })).handlePlanPost(db, { brandContext: { family: study.reconcileStudy(seeds[2]) }, idea: { topic: 'x' } })
  assert.equal(queries.length, photoQueries, 'photo studies never read the cutout gallery')
})

test('saved cutouts are offered by subject: instruction-like descriptions and duplicates are skipped', async () => {
  // Real descriptions saved by the older pipeline for one brand.
  const saved = [
    'professional typing at a desktop workstation in three-quarter view',
    'Choose one concrete visual subject that directly explains this slide: Diagnóstico detalhado das necessidades. Prefer the actual object',
    'Object-only: a rolled blueprint with a hard hat and tape measure, no people, no hands, no table or workbench',
    'professional typing at a desktop workstation in three-quarter view',
    'Carrossel de 4 slides: 1) número de desperdício de orçamento em destaque',
  ].map((subject_description, i) => ({ id: `generated-${i}`, subject_description }))
  const db = { collection: () => ({ find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => saved }) }) }) }) }
  const { galleryCutouts } = planner()
  assert.deepEqual(await galleryCutouts(db, 'kachica'), [
    { ref: 'g1', id: 'generated-0', description: 'professional typing at a desktop workstation in three-quarter view' },
    { ref: 'g2', id: 'generated-2', description: 'a rolled blueprint with a hard hat and tape measure' },
  ])
  assert.deepEqual(await galleryCutouts(null, 'kachica'), [])
})

test('a brand logo replaces the website link and always reads on its surface', () => {
  const forest = family(FOREST_IMAGERY)
  const single = { format: 'single', headline: 'Métricas que importam', supportingText: 'Veja o que medir.' }
  const variants = { source: '/api/uploads/logo', inkLightness: .95, originalTransparent: 'orig', whiteTransparent: 'white', blackTransparent: 'black' }
  const page = (b, surfaces) => {
    const f = { ...forest, study: { ...forest.study, grammar: { ...forest.study.grammar, surfaces, branding: { logo: 'top-left', slideNumber: 'none', handle: 'top-right' } } } }
    return generation.renderGlobalPost(f, b, single, { slots: [{ slot_id: 'single_main', treatment: 'isolated_subject', resolvedAsset: { url: '/g', subject: { url: '/c', width: 500, height: 700 } } }] }, { id: 'global-forest' }, crypto.randomUUID)
  }
  const withLogo = { ...brand, logo: '/api/uploads/logo', logoVariants: variants, website: 'https://kachica.pt' }
  const light = page(withLogo, ['light'])
  assert.equal(light.nodes.some(n => n.designRole === 'handle'), false, 'no website link when the logo is shown')
  assert.equal(light.nodes.find(n => n.designRole === 'logo').src, 'black', 'a white logo becomes its dark silhouette on a light slide')
  assert.equal(page(withLogo, ['dark']).nodes.find(n => n.designRole === 'logo').src, 'orig', 'the original artwork is kept where it reads')
  const red = { ...withLogo, logoVariants: { ...variants, inkLightness: .08 } }
  assert.equal(page(red, ['light']).nodes.find(n => n.designRole === 'logo').src, 'orig')
  assert.equal(page(red, ['dark']).nodes.find(n => n.designRole === 'logo').src, 'white')
  // Without a logo the website link stays; a study with no logo position puts the logo where the link was.
  const noLogo = page({ ...brand, website: 'https://kachica.pt' }, ['light'])
  assert.ok(noLogo.nodes.some(n => n.designRole === 'handle') && noLogo.nodes.some(n => n.designRole === 'brand-name'))
  const f = { ...forest, study: { ...forest.study, grammar: { ...forest.study.grammar, surfaces: ['light'], branding: { logo: 'none', slideNumber: 'none', handle: 'top-right' } } } }
  const moved = generation.renderGlobalPost(f, withLogo, single, { slots: [{ slot_id: 'single_main', treatment: 'isolated_subject', resolvedAsset: { url: '/g', subject: { url: '/c', width: 500, height: 700 } } }] }, { id: 'global-forest' }, crypto.randomUUID)
  const logo = moved.nodes.find(n => n.designRole === 'logo')
  assert.ok(logo && logo.x > 540 && !moved.nodes.some(n => n.designRole === 'handle'), 'the logo takes the website link position')
})

test('a slide shows only its own CTA: the post-level CTA is not pushed onto the last slide', () => {
  const photo = study.reconcileStudy(seeds[1])
  const carousel = { format: 'carousel', cta: 'Saiba mais', slides: [{ headline: 'Primeiro ponto claro' }, { headline: 'Segundo ponto claro' }, { headline: 'Conclusão simples', body: 'O essencial em uma frase.' }] }
  const post = generation.renderGlobalPost(photo, brand, carousel, { slots: [] }, { id: 'global-x' }, crypto.randomUUID)
  assert.equal(post.pages.some(p => p.nodes.some(n => n.designRole === 'cta')), false)
  const withCta = { ...carousel, slides: carousel.slides.map((s, i) => i === 2 ? { ...s, cta: 'Guarde este post' } : s) }
  const last = generation.renderGlobalPost(photo, brand, withCta, { slots: [] }, { id: 'global-x' }, crypto.randomUUID).pages.at(-1)
  assert.equal(last.nodes.find(n => n.designRole === 'cta').text.replace(' →', ''), 'Guarde este post')
})

test('the logo is sized by its mark and lines up with the copy; CTAs are text, and texts in shapes sit centred', () => {
  const textOnly = study.reconcileStudy(seeds[1])
  const g = textOnly.study.grammar
  const f = { ...textOnly, study: { ...textOnly.study, grammar: { ...g, cta: 'pill', branding: { logo: 'top-left', slideNumber: 'top-right', handle: 'none' }, list: { marker: 'number', shape: 'circle', fill: 'solid', color: 'accent' } } } }
  const square = { ...brand, logo: '/api/uploads/logo', logoVariants: { source: '/api/uploads/logo', inkLightness: .5, imageAspect: 1, bounds: { x: 0, y: 0, width: 1, height: 1 }, originalTransparent: 'orig', whiteTransparent: 'white', blackTransparent: 'black' } }
  const carousel = { format: 'carousel', slides: [{ headline: 'Comércio eletrónico em Angola', body: 'Uma plataforma local.' }, { headline: 'Três razões', body: '1. Pagamentos locais\n2. Suporte presencial\n3. Dados no país' }, { headline: 'Comece hoje', body: 'Crie a sua loja.', cta: 'Guarde este post' }] }
  const post = generation.renderGlobalPost(f, square, carousel, { slots: [] }, { id: 'global-x' }, crypto.randomUUID)
  for (const page of post.pages) {
    const logo = page.nodes.find(n => n.designRole === 'logo'), headline = page.nodes.find(n => n.designRole === 'headline')
    assert.equal(logo.x, headline.x, 'the mark starts on the copy edge')
    assert.ok(logo.height >= 80 && logo.width === logo.height, `a square mark is about 8% of the width tall (${logo.height})`)
    assert.ok(logo.y + logo.height < headline.y, 'the larger logo row still clears the copy')
    const number = page.nodes.find(n => n.designRole === 'slide-number')
    assert.ok(Math.abs((number.y + number.height / 2) - (logo.y + logo.height / 2)) <= 2, 'branding items share one centre line')
  }
  const last = post.pages.at(-1).nodes
  assert.equal(last.some(n => /cta-(button|underline)/.test(n.designRole)), false, 'no button shape behind a CTA')
  const cta = last.find(n => n.designRole === 'cta')
  assert.equal(cta.text, 'Guarde este post'); assert.ok(cta.height <= cta.fontSize * 1.15 + 3, 'one line, boxed to the line')
  const list = post.pages[1].nodes
  for (const glyph of list.filter(n => n.designRole === 'marker-glyph')) {
    const marker = list.find(n => n.designRole === 'marker' && n.x === glyph.x && Math.abs(n.y - glyph.y) < n.height)
    assert.ok(Math.abs((glyph.y + glyph.height / 2) - (marker.y + marker.height / 2)) <= 1, 'number centred in its circle')
    assert.ok(glyph.height < marker.height)
  }
})
