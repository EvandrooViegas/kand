const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/handlers/canvasDesignerHandler.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export async function/g, 'async function')
const copyTools = vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname, '../lib/services/copyText.ts'), 'utf8').replace(/export /g, '')) + '\n({withoutEmoji,cleanCopy})')
const engine = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({assembleSlide,librarySpec,fitResolvedSlide,splitBodyBlocks,splitDesignSteps,emphasizeHeadline,recoverDesignInput,handleSwitchDesign,validateDesignSpec,renderDesignSpec,fitText,fitTextLayout,normalizeDesignSystem,buildStrategyPalette,ensureContrast,contrastRatio,parseArtDirection,buildSingleCanvas,buildCarouselCanvas,buildPrompt,handleDesignCanvas,designIssues})', {
  ...vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname, '../lib/designs/library.ts'),'utf8').replace(/export /g,''))+'\n({DESIGN_LIBRARY,librarySpec,splitBulletItems})'),
  ...vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/palettes.ts'),'utf8').replace(/export /g,''))+'\n({PALETTE_PICKS,paletteColors,choosePalette,constrainBrandPalette})'),
  ...vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/brandBlueprint.ts'),'utf8').replace(/export /g,''))+'\n({blueprintSpec,complementaryAccent})'),
  ...vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/postLayout.ts'),'utf8').replace(/^import .*$/gm,'').replace(/export /g,''))+'\n({arrangeReadableBody,backgroundCompositionForDesign,fitResolvedSlide,fitPlannedLayout,subjectOverlaps,parseDesignSequence,parseDesignBullets,planPostLayout})'),
  // These fixtures exercise the retained legacy branch; global integration is covered separately.
  chooseBrandFamily: async () => null,
  canvasBrand: async (db,canvas)=>canvas.designInput?.brandContext||canvas.brandContext||{}, withoutEmoji: copyTools.withoutEmoji, prepareSubjectAssets: async (db, plan) => plan, hydrateSubjectCrops: async (db, plan) => plan, persistInlineImages: async (db, value) => value, uuidv4: require('node:crypto').randomUUID, console, process: { env: {} },
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
test('background photo stays full bleed with a dark gradient behind white copy', () => {
  const d = direction({ ...spec, background: { type: 'image' }, elements: [text, { type: 'ring', x: 700, y: 100, width: 100, height: 100, layer: 20 }] }).slides[0]
  const result = engine.renderDesignSpec(d.design, { d, headline: 'Title', body: '', cta: '', eyebrow: '', imageUrl: slot.resolvedAsset.url })
  assert.equal(result.nodes.at(-1).type, 'text')
  const scrim=result.nodes.at(-2)
  assert.equal(scrim.type, 'gradient')
  assert.equal(scrim.width,1080);assert.equal(scrim.angle,180)
  assert.equal(result.nodes.at(-1).color,'#ffffff')
  assert.ok(scrim.stops[1].alpha>=60&&scrim.stops[1].alpha<=65)
  assert.ok(scrim.y+scrim.height*scrim.stops[1].position/100<=text.y)
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

test('brand brief, fonts and secondary colors survive art direction', () => {
  const brand = { name: 'Studio', description: 'Playful ceramics', audience: 'Collectors', colors: ['#b84324','#386c5f'], fonts: ['Lato','Oswald'] }
  const prompt = JSON.parse(engine.buildPrompt(brand, { headline: 'Title' }, plan))
  assert.equal(prompt.brand.description, brand.description)
  assert.equal(prompt.brand.audience, brand.audience)
  const dir = engine.parseArtDirection(JSON.stringify({ global: { typography: { heading: 'Poppins' } }, slides: [spec] }), plan, brand)
  assert.equal(dir.slides[0].heading_font, 'Lato')
  assert.equal(dir.slides[0].body_font, 'Oswald')
  assert.equal(dir.slides[0].palette.accent, '#386c5f')
})
test('detects repeated geometry and accepts substantially different compositions', () => {
  const carousel = { format: 'carousel', slots: [slot, { ...slot, slot_id: 'two' }] }
  const copy = { slides: [{ headline: 'One' }, { headline: 'Two' }] }
  const repeated = engine.parseArtDirection(JSON.stringify({ slides: [spec, { ...spec, slot_id: 'two' }] }), carousel, {})
  assert.ok(engine.designIssues(repeated, copy, carousel).some(issue => issue.includes('too similar')))
  const varied = engine.parseArtDirection(JSON.stringify({ slides: [spec, { ...spec, slot_id: 'two', palette_variant: 'brand', elements: [{ ...text, x: 400, y: 450, width: 600 }, { ...text, role: 'eyebrow', x: 80, y: 80, width: 200, height: 60 }] }] }), carousel, { colors: ['#b84324'] })
  assert.equal(engine.designIssues(varied, copy, carousel).length, 0)
  assert.equal(varied.slides[1].palette.bg, varied.slides[0].palette.bg)
})

test('readable tonal gradients do not acquire hard text panels', () => {
  const d = direction({ ...spec, background: { type: 'gradient', color: 'bg', to: 'surface' } }).slides[0]
  d.palette.bg = '#081c12'; d.palette.surface = '#183c29'; d.palette.text = '#e6f3e9'
  const result = engine.renderDesignSpec(d.design, { d, headline: 'Make your next move', body: '', cta: '', eyebrow: '' })
  assert.equal(result.nodes.length, 2)
  assert.equal(result.nodes[0].type, 'gradient')
  assert.equal(result.nodes[1].type, 'text')
})
test('missing AI produces a layered photo-led fallback with all supplied copy', () => {
  const d = engine.parseArtDirection('{}', plan, { colors: ['#3b7a44'] })
  const copy = { headline: 'Make your next move', supportingText: 'Build something meaningful.', cta: 'Find out more' }
  const canvas = engine.buildSingleCanvas(copy, plan, d, 'Social')
  assert.ok(canvas.nodes.some(n => n.type === 'image' && n.height >= 300))
  assert.ok(canvas.nodes.some(n => n.type === 'gradient' || n.type === 'shape'))
  assert.ok(canvas.nodes.some(n => n.type === 'shape'))
  for (const content of Object.values(copy)) assert.ok(canvas.nodes.some(n => n.text === content))
})

test('transparent subject is contained without cropping and cannot be covered by headline', () => {
  const subject = { url: '/api/uploads/subject-test', width: 400, height: 800 }
  const subjectPlan = { ...plan, slots: [{ ...slot, resolvedAsset: { ...slot.resolvedAsset, subject } }] }
  const specWithSubject = { ...spec, elements: [text, { type: 'image', image_variant: 'subject', assetId: 'one', x: 600, y: 100, width: 400, height: 800 }] }
  const d = engine.parseArtDirection(JSON.stringify({ slides: [specWithSubject] }), subjectPlan, {}).slides[0]
  const input = { d, subject, headline: 'Title', body: '', cta: '', eyebrow: '', imageUrl: slot.resolvedAsset.url }
  const result = engine.renderDesignSpec(d.design, input)
  const image = result.nodes.find(n => n.src === subject.url)
  assert.ok(image)
  assert.equal(image.width / image.height, .5)
  assert.equal(image.mask, 'none')
  d.design.elements[0].x = 650
  assert.throws(() => engine.renderDesignSpec(d.design, input), /foreground subject/)
})

test('emoji removal preserves ordinary numbered steps and Portuguese accents', () => {
  assert.equal(copyTools.withoutEmoji('1\ufe0f\u20e3 Criar \ud83d\ude80 2\ufe0f\u20e3 A\u00e7\u00e3o'), '1 Criar 2 A\u00e7\u00e3o')
  const prompt = JSON.parse(engine.buildPrompt({}, { headline: 'Hello \ud83d\ude80', cta: 'Go \u2705' }, plan))
  assert.equal(prompt.slides[0].headline, 'Hello'); assert.equal(prompt.slides[0].cta, 'Go')
})
test('image-free fallback varies hierarchy while retaining the campaign palette', () => {
 const plan = { format: 'carousel', slots: [0,1,2].map(i => ({slot_id:String(i),resolvedAsset:null})) }
 const copy = { slides: plan.slots.map(() => ({headline:'Build your next idea',body:'A clear supporting message.'})) }
 const dir = engine.parseArtDirection('{}',plan,{colors:['#23764b','#96c54b'],fonts:['Inter']})
 const canvas = engine.buildCarouselCanvas(copy,plan,dir,'Diverse')
 assert.equal(new Set(canvas.pages.map(p => p.background)).size,1)
 assert.equal(new Set(canvas.pages.map(p => {const n=p.nodes.find(n=>n.text==='Build your next idea');return [n.x,n.y,n.width].join(',')})).size,3)
 assert.ok(canvas.pages.every(p => !p.nodes.some(n=>n.type==='shape' && n.width>300 && n.height>300)))
})

test('one slide can combine only trusted assets from the campaign', () => {
 const portrait = {url:'/api/uploads/portrait',width:400,height:700}
 const plan2 = {format:'carousel',slots:[slot,{slot_id:'two',resolvedAsset:{url:'https://example.com/product.png',subject:portrait}}]}
 const design = {...spec,elements:[text,{type:'image',assetId:'two',image_variant:'subject',x:620,y:300,width:360,height:630},{type:'grid',x:600,y:450,width:400,height:500}]}
 const dir=engine.parseArtDirection(JSON.stringify({global:{visual_theme:'technical'},slides:[design,{...spec,slot_id:'two'}]}),plan2,{})
 const d=dir.slides[0]
 assert.equal(d.design.elements.find(e=>e.type==='image').imageVariant,'subject')
 const rendered=engine.renderDesignSpec(d.design,{d,headline:'Title',body:'',eyebrow:'',cta:'',imageUrl:slot.resolvedAsset.url,assets:Object.fromEntries(plan2.slots.map(s=>[s.slot_id,s.resolvedAsset]))})
 assert.ok(rendered.nodes.some(n=>n.src===portrait.url))
 assert.ok(rendered.nodes.filter(n=>n.type==='shape').length>5)
})
test('campaign themes create distinct stages while preserving brand anchors', () => {
 const colors = ['#8b2338','#df5972']
 const backgrounds = new Set()
 for(const visual_theme of ['atmospheric','studio','vibrant']) {
  const system=engine.normalizeDesignSystem({visual_theme})
  const palette=engine.buildStrategyPalette(colors,system)
  assert.equal(palette.primary,colors[0]);assert.equal(palette.accent,colors[1])
  backgrounds.add(palette.bg)
 }
 assert.equal(backgrounds.size,3)
})

test('later readability surfaces cannot cover earlier copy', () => {
  const d = direction({ ...spec, background: { type: 'image' }, elements: [text, { ...text, role: 'body', x: 610, y: 390, width: 380, height: 300 }] }).slides[0]
  const result = engine.renderDesignSpec(d.design, { d, headline: 'Title', body: 'Supporting explanation', cta: '', eyebrow: '', imageUrl: slot.resolvedAsset.url })
  const firstCopy = result.nodes.findIndex(n => n.type === 'text')
  assert.ok(firstCopy > 0)
  assert.ok(result.nodes.slice(firstCopy).every(n => n.type === 'text'))
})
test('different posts receive diverse campaign concepts, stable within a post', () => {
  const concepts = new Set()
  for (let i = 0; i < 30; i++) {
    const p = { ...plan, post_id: 'post-' + i }
    const a = JSON.parse(engine.buildPrompt({}, {}, p)).design_brief.campaign_concept
    assert.equal(a, JSON.parse(engine.buildPrompt({}, {}, p)).design_brief.campaign_concept)
    concepts.add(a)
  }
  assert.ok(concepts.size >= 5)
})

test('successive posts avoid the five most recent campaign directions', async () => {
  const saved = []
  const db = { collection: () => ({
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => saved.slice(-5).reverse() }) }) }),
    insertOne: async value => saved.push(value),
  }) }
  for (let i = 0; i < 6; i++) {
    const result = await engine.handleDesignCanvas(db, { brandContext: { name: 'Campaign test', colors: ['#35724c'] }, copy: { headline: 'A new idea', supportingText: 'A short explanation.' }, resolvedPlan: { ...plan, post_id: 'post-' + i } })
    assert.equal(result.status, 200)
  }
  assert.equal(new Set(saved.map(c => c.designCampaign.index)).size, 6)
})

test('all ten library designs render brand copy and explicit choice bypasses AI', async () => {
  const library = vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/library.ts'),'utf8').replace(/export /g,''))+'\nDESIGN_LIBRARY')
  const layouts = new Set()
  for (const design of library) {
    let writes=0
    const db={collection:()=>({find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})}),insertOne:async()=>{writes++}})}
    const result=await engine.handleDesignCanvas(db,{brandContext:{name:'Test',colors:['#35724c'],fonts:['Inter']},copy:{headline:'A smarter business',supportingText:'Tools that help your team grow.',cta:'Learn more'},resolvedPlan:plan,designId:design.id},false)
    assert.equal(result.status,200)
    assert.equal(result.body.designSelection.id,design.id)
    assert.equal(writes,0)
    assert.equal(result.body.designCampaign.issues.length,0,design.id)
    layouts.add(JSON.stringify(result.body.nodes.filter(n=>n.type==='text').map(n=>[n.x,n.y,n.width,n.height])))
  }
  assert.equal(layouts.size,10)
})

test('older canvases recover content and switch without inserting a duplicate', async () => {
  const current={id:'old',name:'Older post',type:'single',nodes:[
    {type:'text',text:'Headline',fontSize:70,fontFamily:'Inter',color:'#35724c',x:80,y:100},
    {type:'text',text:'Supporting copy',fontSize:28,fontFamily:'Inter',x:80,y:400},
    {type:'image',src:'https://example.com/photo.png',width:500,height:600},
  ]}
  const input=engine.recoverDesignInput(current)
  assert.equal(input.copy.headline,'Headline')
  assert.equal(input.copy.supportingText,'Supporting copy')
  assert.equal(input.resolvedPlan.slots[0].resolvedAsset.url,'https://example.com/photo.png')
  const db={collection:()=>({findOne:async()=>current,find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})}),insertOne:async()=>{throw Error('Must not insert')}})}
  const result=await engine.handleSwitchDesign(db,'old',{designId:'editorial'})
  assert.equal(result.status,200)
  assert.equal(result.body.designSelection.id,'editorial')
  assert.ok(result.body.designInput)
})

test('every library family varies carousel chapters and keeps cutouts clear of copy', () => {
  const lib = vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/library.ts'),'utf8').replace(/export /g,''))+'\n({DESIGN_LIBRARY,librarySpec})')
  for (const design of lib.DESIGN_LIBRARY) {
    const layouts = new Set()
    for (let index=0;index<5;index++) {
      const assetSlot = {...slot,resolvedAsset:{...slot.resolvedAsset,subject:{url:'https://example.com/cutout.png',width:500,height:800}}}
      const content = {headline:'A better way to grow',body:'Build your business with tools that work together.',cta:'Start today',eyebrow:index?'02':''}
      const system=engine.normalizeDesignSystem({visual_theme:design.theme,spacing:'compact'})
      const raw=lib.librarySpec(design,assetSlot,content,index,5)
      const spec=engine.validateDesignSpec(raw,assetSlot,system)
      const d={...direction().slides[0],palette:engine.buildStrategyPalette(['#35724c','#a7ce78'],system)}
      assert.doesNotThrow(()=>engine.renderDesignSpec(spec,{d,...content,subject:assetSlot.resolvedAsset.subject,imageUrl:assetSlot.resolvedAsset.url,slideNumber:index,totalSlides:5}),design.id+' chapter '+index)
      layouts.add(JSON.stringify(raw.elements.filter(e=>e.type==='text'&&e.role==='headline').map(e=>[e.x,e.y,e.width,e.size])))
    }
    assert.ok(layouts.size>=4,design.id)
  }
})

test('subtle grid does not create full-width readability bands',()=>{
 const system=engine.normalizeDesignSystem({visual_theme:'technical',spacing:'compact'})
 const palette=engine.buildStrategyPalette(['#35724c'],system)
 const spec=engine.validateDesignSpec({background:{type:'solid',color:'bg'},elements:[{type:'grid',x:40,y:120,width:1000,height:800,color:'primary',opacity:5},{type:'text',role:'headline',x:570,y:180,width:440,height:310,size:66}]},slot,system)
 const result=engine.renderDesignSpec(spec,{d:{palette,logo_placement:'none'},headline:'A better business',body:'',cta:'',eyebrow:''})
 assert.equal(result.nodes.filter(n=>n.type==='gradient').length,0)
})

test('numbered copy is separated without confusing numbers inside sentences',()=>{
 const steps=engine.splitDesignSteps('1 Cria o catálogo digital → 2 Integra os produtos → 3 O cliente recebe o pedido.')
 assert.equal(steps.length,3)
 assert.equal(steps[1].text,'Integra os produtos')
 assert.equal(engine.splitDesignSteps('Poupe 30 dias e cresça 2 vezes.').length,0)
 assert.match(engine.emphasizeHeadline('Comece a vender sem armazém'),/textDecoration=underline/)
})

test('headline emphasis supports underline, color and readable background without changing words',()=>{
 const text='Build a better business'
 assert.match(engine.emphasizeHeadline(text,0),/textDecoration=underline/)
 assert.match(engine.emphasizeHeadline(text,1,'#82bd60'),/color=#82bd60/)
 const marked=engine.emphasizeHeadline(text,2,'#82bd60','#102019')
 assert.match(marked,/backgroundColor=#102019/)
 assert.match(marked,/color=#ffffff/)
 assert.equal(marked.replace(/<%inline:[^:]+:([^]*?)%>/g,'$1'),text)
 assert.equal(engine.emphasizeHeadline('Hi',2),'Hi')
})

test('emphasis respects sentence boundaries and supports contrasting fonts',()=>{
 const title='Quer abrir a sua loja online em menos de um mês? Descubra como!'
 const marked=engine.emphasizeHeadline(title,2,'#aabbcc','#112233')
 assert.ok(marked.includes('mês? <%inline:'))
 assert.ok(marked.endsWith(':Descubra como!%>'))
 assert.match(engine.emphasizeHeadline(title,3),/fontFamily=Playfair Display/)
 assert.match(engine.emphasizeHeadline(title,3,'#fff','#000','Playfair Display'),/fontFamily=Inter/)
 assert.doesNotMatch(engine.emphasizeHeadline(title,3),/textDecoration|backgroundColor|color=/)
})

test('palette randomization covers every choice and preserves explicit selection',()=>{
 const lib=vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/palettes.ts'),'utf8').replace(/export /g,''))+'\n({choosePalette,PALETTE_PICKS})')
 lib.PALETTE_PICKS.forEach((p,i)=>assert.equal(lib.choosePalette(undefined,()=> (i+.5)/lib.PALETTE_PICKS.length).id,p.id))
 assert.equal(lib.choosePalette('dark',()=>{throw Error('Must not randomize explicit choice')}).id,'dark')
 assert.equal(lib.choosePalette('invalid'),undefined)
})

test('bulleted benefits become four separate cards without changing their copy',()=>{
 const lib=vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/library.ts'),'utf8').replace(/export /g,''))+'\n({DESIGN_LIBRARY,librarySpec,splitBulletItems})')
 const body='• Lower storage costs\n• Faster launch\n• Focus on growth\n• Secure deliveries'
 const system=engine.normalizeDesignSystem({spacing:'compact'})
 const raw=lib.librarySpec(lib.DESIGN_LIBRARY[2],slot,{headline:'Benefits',body},1,5)
 assert.equal(raw.elements.some(e=>e.type==='image'),false)
 const spec=engine.validateDesignSpec(raw,slot,system)
 const result=engine.renderDesignSpec(spec,{d:{library:true,palette:engine.buildStrategyPalette(['#35724c'],system),logo_placement:'none'},headline:'Benefits',body,cta:'',eyebrow:'',slideNumber:1,totalSlides:5})
 for(const item of lib.splitBulletItems(body))assert.ok(result.nodes.some(n=>n.type==='text'&&n.text===item))
 assert.equal(result.nodes.some(n=>n.type==='text'&&n.text.includes('•')),false)
 assert.equal(lib.splitBulletItems('A cost-effective option.').length,0)
})
test('explanatory paragraphs become separate readable text blocks preserving content',()=>{
 const body='Without a warehouse, inventory depends on your system. If levels are not updated promptly, unavailable products can be sold, causing cancellations and dissatisfaction. The platform synchronizes stock automatically between your catalogue and fulfilment.'
 const blocks=engine.splitBodyBlocks(body)
 assert.equal(blocks.join(' '),body);assert.ok(blocks.length>1)
 assert.deepEqual(Array.from(engine.splitBodyBlocks('A short explanation.')),[])
 const system=engine.normalizeDesignSystem({spacing:'compact'})
 const spec=engine.validateDesignSpec({elements:[{type:'text',role:'headline',x:72,y:100,width:936,height:220},{type:'text',role:'body',x:72,y:400,width:600,height:500,size:30}]},slot,system)
 const result=engine.renderDesignSpec(spec,{d:{library:true,palette:engine.buildStrategyPalette(['#35724c'],system),logo_placement:'none'},headline:'Keep stock current',body,cta:'',eyebrow:'',slideNumber:1,totalSlides:5})
 const textNodes=result.nodes.filter(n=>n.type==='text'&&blocks.includes(n.text))
 assert.equal(textNodes.length,blocks.length)
 assert.ok(textNodes.every(n=>n.fontSize>=22))
 for(let i=1;i<textNodes.length;i++){
  const gap=textNodes[i].y-textNodes[i-1].y-textNodes[i-1].height
  assert.ok(gap>=12&&gap<=20)
 }
})
test('block presentation varies without changing explanation content',()=>{
 const body='Inventory must reflect the products available for sale. Outdated stock levels cause cancellations and frustration for customers. Synchronizing the catalogue and fulfilment avoids those problems and keeps the business running smoothly.'
 const system=engine.normalizeDesignSystem({spacing:'compact'})
 const spec=engine.validateDesignSpec({elements:[{type:'text',role:'headline',x:72,y:100,width:936,height:220},{type:'text',role:'body',x:72,y:400,width:650,height:500,size:30}]},slot,system)
 const counts=new Set()
 for(const block_style of ['markers','icons','cards','plain']) {
  const result=engine.renderDesignSpec(spec,{d:{library:true,block_style,palette:engine.buildStrategyPalette(['#35724c'],system),logo_placement:'none'},headline:'Stock',body,cta:'',eyebrow:'',slideNumber:1,totalSlides:5})
  const blocks=engine.splitBodyBlocks(body)
  assert.equal(result.nodes.filter(n=>n.type==='text'&&blocks.includes(n.text)).map(n=>n.text).join(' '),body)
  counts.add(result.nodes.filter(n=>n.type==='shape').length)
  if(block_style==='plain')assert.equal(result.nodes.some(n=>n.type==='shape'),false)
 }
 assert.ok(counts.size>=3)
})

test('saved brand preset applies its family and palette and remains identifiable',async()=>{
 const brand={name:'Test brand',colors:['#35724c'],fonts:['Inter'],designs:[{id:'brand-test',baseId:'editorial',paletteId:'light',name:'Quiet confidence',tags:['calm']}]}
 const db={collection:()=>({find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})})})}
 const result=await engine.handleDesignCanvas(db,{brandContext:brand,copy:{headline:'A smarter business',supportingText:'Tools for your team.'},resolvedPlan:plan,designId:'brand-test'},false)
 assert.equal(result.status,200)
 assert.equal(result.body.designSelection.id,'brand-test')
 assert.equal(result.body.designSelection.name,'Quiet confidence')
 assert.equal(result.body.designSelection.paletteId,'light')
})

test('personalized compositions render distinct layouts without obscuring copy',async()=>{
 const positions=new Set()
 for(const composition of ['split','stage','diagonal']) {
 const brand={name:'Studio',colors:['#35724c'],designs:[{id:'brand-test',baseId:'editorial',paletteId:'light',name:composition,artDirection:{composition,lighting:'dramatic',motif:'beam'}}]}
 const db={collection:()=>({find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})})})}
 const result=await engine.handleDesignCanvas(db,{brandContext:brand,copy:{headline:'Make room for more',supportingText:'A fresh direction for your business.'},resolvedPlan:plan,designId:'brand-test'},false)
 assert.equal(result.status,200,composition)
 positions.add(JSON.stringify(result.body.nodes.filter(n=>n.type==='text').map(n=>[n.x,n.y,n.width])))
 }
 assert.equal(positions.size,3)
})

test('saved identity composes locally and retains layered styling',async()=>{
 const template={background:{type:'gradient',color:'bg',to:'surface',angle:37},elements:[{type:'text',role:'headline',x:92,y:110,width:820,height:250,size:76,shadow:true},{type:'text',role:'body',x:92,y:450,width:600,height:260,size:30},{type:'text',role:'cta',x:92,y:960,width:700,height:64,size:26},{type:'circle',x:820,y:640,width:140,height:140,color:'accent',opacity:45,shadow:true,layer:-1}]}
 const brand={name:'Blueprint test',colors:['#35724c'],fonts:['Inter'],designs:[{id:'brand-authored',baseId:'editorial',paletteId:'light',name:'Original geometry',blueprint:{version:1,theme:'studio',spacing:'compact',highlight:'gradient_text',imagery:{placement:'none',style:'drawing'},templates:{cover:template,content:template,closing:template}}}]}
 const db={collection:()=>({find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})})})}
 const result=await engine.handleDesignCanvas(db,{brandContext:brand,copy:{headline:'Make room for more',supportingText:'A fresh perspective.'},resolvedPlan:plan,designId:'brand-authored'},false)
 assert.equal(result.status,200)
 const headline=result.body.nodes.find(n=>n.type==='text'&&n.text.includes('Make room'))
 assert.equal(headline.x,72)
 assert.equal(headline.textShadow.enabled,true)
 assert.ok(headline.text.includes('backgroundClip=text'))
 assert.equal(result.body.designSelection.id,'brand-authored')
})

test('resolved portrait and wide assembly receive independent image-led compositions',()=>{
 const base={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:130,width:420,height:300,size:76},{type:'text',role:'body',x:72,y:470,width:420,height:400,size:30},{type:'image',x:650,y:600,width:250,height:250}]}
 const content={headline:'Registe-se na plataforma Ikarus Pay',body:'Crie a sua conta em poucos minutos. Insira os seus dados e aceda ao painel de controlo onde pode gerir todo o seu negócio.'}
 const fitted=[{width:500,height:800},{width:1000,height:650}].map(dimensions=>engine.fitResolvedSlide(base,{slot_id:'a',resolvedAsset:{url:'photo',subject:{url:'subject',...dimensions}}},content,engine.fitTextLayout))
 const images=fitted.map(s=>s.elements.find(e=>e.type==='image'))
 assert.notDeepEqual(images[0],images[1])
 for(let i=0;i<fitted.length;i++){
  const image=images[i],title=fitted[i].elements.find(e=>e.role==='headline'),body=fitted[i].elements.find(e=>e.role==='body')
  assert.ok(image.width*image.height>250*250*3)
  assert.ok(Math.abs(image.y+image.height-1080)<1)
  assert.ok(body.y-title.y-title.height>=24&&body.y-title.y-title.height<=28)
  assert.ok(image.y>=0)
 }
 assert.equal(base.elements.at(-1).width,250)
})

test('cutout source side crop aligns with canvas boundary',()=>{
 const base={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:130,width:936,height:220,size:76},{type:'text',role:'body',x:72,y:400,width:450,height:350,size:30},{type:'image',x:600,y:600,width:240,height:240}]}
 const result=engine.fitResolvedSlide(base,{slot_id:'a',resolvedAsset:{subject:{url:'cutout',width:480,height:800,cropEdges:{left:true}}}},{headline:'Crie a sua conta',body:'Insira os dados da sua empresa.'},engine.fitTextLayout)
 const image=result.elements.find(e=>e.type==='image')
 assert.equal(image.x,0);assert.equal(image.y+image.height,1080)
})

test('left and right cropped cutouts stay on their canvas corners with closing copy and CTA',()=>{
 for(const edge of ['left','right']){
  const asset={url:'photo',subject:{url:'cutout',width:600,height:800,cropEdges:{[edge]:true,bottom:true}}}
  const slot={slot_id:'a',resolvedAsset:asset}
  const content={headline:'Expanda o seu negócio em todo o país',body:'Descubra como a Ikarus Pay simplifica a logística e permite que você alcance clientes em qualquer canto de Angola.',cta:'Conheça a plataforma'}
  const base={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:500,width:936,height:220,size:76},{type:'text',role:'body',x:72,y:750,width:936,height:180,size:30},{type:'text',role:'cta',x:72,y:970,width:680,height:54,size:26},{type:'image',assetId:'a',x:390,y:100,width:300,height:300}]}
  const fitted=engine.fitResolvedSlide(base,slot,content,engine.fitTextLayout)
  const image=fitted.elements.find(e=>e.type==='image')
  assert.ok(edge==='left'?image.x===0:Math.abs(image.x+image.width-1080)<1)
  assert.ok(Math.abs(image.y+image.height-1080)<1)
  const system=engine.normalizeDesignSystem({spacing:'compact'})
  const normalized=engine.validateDesignSpec(fitted,slot,system)
  const d={...direction().slides[0],design:normalized}
  const rendered=engine.renderDesignSpec(normalized,{d,...content,eyebrow:'',imageUrl:asset.url,subject:asset.subject,assets:{a:asset}})
  const node=rendered.nodes.find(n=>n.src==='cutout')
  assert.ok(edge==='left'?node.x===0:Math.abs(node.x+node.width-1080)<=1)
 }
})

test('failed badge/card layout recovers to a large corner cutout rather than legacy blurred card',()=>{
 for(const edge of ['left','right']){
  const asset={url:'photo',subject:{url:'cutout',width:600,height:800,cropEdges:{[edge]:true,bottom:true}}},slot={slot_id:'a',resolvedAsset:asset}
  const content={headline:'Expanda o seu negócio em todo o país',body:'Descubra como a Ikarus Pay simplifica a logística e permite que você alcance clientes em qualquer canto de Angola.',cta:'Conheça a plataforma',eyebrow:''}
  const system=engine.normalizeDesignSystem({spacing:'compact'})
  const broken=engine.validateDesignSpec({background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:500,width:936,height:220,size:76},{type:'text',role:'body',x:72,y:750,width:936,height:180,size:30},{type:'badge',role:'cta',x:72,y:970,width:680,height:30,size:26,minSize:26},{type:'image',assetId:'a',x:390,y:100,width:300,height:300}]},slot,system)
  const d={...direction().slides[0],composition:'centered_card',library:true,design:broken}
  const result=engine.assembleSlide({d,...content,imageUrl:asset.url,subject:asset.subject,assets:{a:asset},slideNumber:4,totalSlides:5})
  const images=result.nodes.filter(n=>n.type==='image')
  assert.equal(images.length,1)
  const image=images[0]
  assert.equal(image.src,'cutout');assert.ok(image.width>=450)
  assert.ok(edge==='left'?image.x===0:Math.abs(image.x+image.width-1080)<=1)
  assert.ok(Math.abs(image.y+image.height-1080)<=1)
 }
})

test('closing badge is measured with padding and survives final rendering',()=>{
 const asset={url:'photo',subject:{url:'cutout',width:600,height:800,cropEdges:{left:true,bottom:true}}},slot={slot_id:'a',resolvedAsset:asset}
 const content={headline:'Expanda o seu negócio em todo o país',body:'Descubra como a Ikarus Pay simplifica a logística e permite alcançar clientes em qualquer canto de Angola.',cta:'Conheça a plataforma',eyebrow:''}
 const raw={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:500,width:936,height:220,size:76},{type:'text',role:'body',x:72,y:750,width:936,height:180,size:30},{type:'badge',role:'cta',x:72,y:970,width:680,height:64,size:26,minSize:24},{type:'image',assetId:'a',x:390,y:100,width:300,height:300}]}
 const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,slot,system)
 const d={...direction().slides[0],design:spec}
 const result=engine.renderDesignSpec(spec,{d,...content,imageUrl:asset.url,subject:asset.subject,assets:{a:asset}})
 assert.ok(result.nodes.some(n=>n.type==='text'&&n.text===content.cta))
 assert.equal(result.nodes.filter(n=>n.type==='image').length,1)
 assert.equal(fitted.background.type,'solid')
})

test('silhouette-aware fitting fills space with larger type, narrower body and corner imagery',()=>{
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:130,width:936,height:100,size:76},{type:'text',role:'body',x:72,y:330,width:460,height:300,size:30},{type:'image',assetId:'a',x:564,y:564,width:516,height:516}]}
 const content={headline:'Rede de parceiros locais',body:'Colaboramos com transportadoras regionais e agentes de entrega que conhecem o terreno, garantindo cobertura nacional sem burocracia.',cta:'',eyebrow:''}
 const asset={url:'photo',subject:{url:'cutout',width:800,height:800,cropEdges:{right:true,bottom:true},silhouette:[{top:0,bottom:.4,left:.58,right:1},{top:.4,bottom:.65,left:.35,right:1},{top:.65,bottom:1,left:0,right:1}]}}
 const slot={slot_id:'a',resolvedAsset:asset}
 const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 const image=fitted.elements.find(e=>e.type==='image'),title=fitted.elements.find(e=>e.role==='headline'),body=fitted.elements.find(e=>e.role==='body')
 assert.ok(image.width>516);assert.ok(title.size>76);assert.ok(body.width<460)
 assert.ok(Math.abs(image.x+image.width-1080)<1)
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,slot,system)
 const d={...direction().slides[0],library:true,design:spec}
 const result=engine.renderDesignSpec(spec,{d,...content,imageUrl:asset.url,subject:asset.subject,assets:{a:asset}})
 assert.ok(result.nodes.some(n=>n.src==='cutout'))
 const withLogo=engine.renderDesignSpec(spec,{d:{...d,logo_url:'brand-logo',logo_placement:'bottom_right',logo_size:96,logo_pill:false},...content,imageUrl:asset.url,subject:asset.subject,assets:{a:asset}})
 const logo=withLogo.nodes.find(n=>n.src==='brand-logo')
 assert.ok(logo.x<image.x)
})

test('text-only slides fill space with larger copy, tight grouping and a corner circle',()=>{
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:120,y:240,width:840,height:160,size:76},{type:'text',role:'body',x:120,y:560,width:840,height:200,size:30},{type:'ring',x:480,y:640,width:300,height:300,color:'primary',opacity:12},{type:'line',x:120,y:200,width:840,height:2,color:'primary'}]}
 const content={headline:'Rastreamento em tempo real',body:'A plataforma mostra a localização exata do pedido, notificações automáticas e previsão de chegada, aumentando a confiança do cliente.',cta:'',eyebrow:''}
 const result=engine.fitResolvedSlide(raw,{slot_id:'a'},content,engine.fitTextLayout)
 const title=result.elements.find(e=>e.role==='headline'),body=result.elements.find(e=>e.role==='body'),circle=result.elements.find(e=>e.type==='ring')
 assert.ok(title.size>76);assert.ok(body.size>30)
 assert.equal(body.y-title.y-title.height,24)
 assert.ok(circle.width>300);assert.equal(circle.x+circle.width,1080);assert.equal(circle.y+circle.height,1080)
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(result,{slot_id:'a'},system)
 const d={...direction().slides[0],design:spec,library:false}
 const rendered=engine.renderDesignSpec(spec,{d,...content,imageUrl:null})
 assert.ok(rendered.nodes.some(n=>n.text===content.headline));assert.ok(rendered.nodes.some(n=>n.text===content.body))
 assert.equal(raw.elements[2].width,300)
})

test('text-only fitting adapts to longer copy and keeps a closing badge readable',()=>{
 const base={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:150,width:936,height:200,size:76},{type:'text',role:'body',x:72,y:440,width:936,height:470,size:30},{type:'badge',role:'cta',x:72,y:960,width:680,height:64,size:26},{type:'circle',x:700,y:700,width:250,height:250,color:'primary',opacity:12}]}
 const common={headline:'Uma plataforma para o seu negócio',cta:'Conheça a plataforma',eyebrow:''}
 const short={...common,body:'Acompanhe os pedidos e receba notificações automáticas.'}
 const long={...common,body:'Acompanhe os pedidos e receba notificações automáticas. A equipa mantém os dados atualizados e permite consultar a localização de cada entrega. Consulte os detalhes do pedido e a previsão de chegada para responder aos seus clientes. Tenha uma visão clara da operação e mantenha os clientes informados em cada etapa do processo.'}
 const fitted=[short,long].map(content=>engine.fitResolvedSlide(base,{slot_id:'a'},content,engine.fitTextLayout))
 assert.notDeepEqual(fitted[0].elements.find(e=>e.role==='body'),fitted[1].elements.find(e=>e.role==='body'))
 for(let i=0;i<2;i++){
  const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted[i],{slot_id:'a'},system)
  const d={...direction().slides[0],design:spec,library:false}
  const rendered=engine.renderDesignSpec(spec,{d,...[short,long][i],imageUrl:null})
  assert.ok(rendered.nodes.some(n=>n.text===common.cta))
  assert.ok(fitted[i].elements.find(e=>e.role==='cta').y+fitted[i].elements.find(e=>e.role==='cta').height<=1008)
 }
})

test('cutouts cropped on both sides prioritize visibility at a primary corner',()=>{
 for(const bottom of [true,false]){
  const asset={url:'photo',subject:{url:'cutout',width:600,height:800,cropEdges:{left:true,right:true,bottom}}},slot={slot_id:'a',resolvedAsset:asset}
  const content={headline:'Expanda o seu negócio',body:'Alcance clientes em todo o país com parceiros locais.',cta:'Conheça a plataforma',eyebrow:''}
  const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:150,width:936,height:250,size:76},{type:'text',role:'body',x:72,y:430,width:720,height:300,size:30},{type:'text',role:'cta',x:72,y:960,width:720,height:70,size:26},{type:'image',assetId:'a',x:300,y:100,width:300,height:300}]}
  const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
  assert.ok(fitted.elements.find(e=>e.type==='image').width>=450)
  const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,slot,system)
  const d={...direction().slides[0],library:true,design:spec}
  const result=engine.assembleSlide({d,...content,imageUrl:asset.url,subject:asset.subject,assets:{a:asset},slideNumber:3,totalSlides:5})
  const image=result.nodes.find(n=>n.src==='cutout')
  assert.equal(image.x,0);assert.ok(image.width>=450)
  assert.ok(image.y>0);assert.ok(image.y+image.height>=1080)
  assert.ok((1080-image.y)/image.height>=.85)
  assert.ok(result.nodes.some(n=>n.text===content.cta))
 }
})

test('occupied image corners use a compact brand plate without failing the slide',()=>{
 const asset={url:'photo',subject:{url:'cutout',width:1080,height:600,cropEdges:{left:true,right:true,bottom:true}}},slot={slot_id:'a',resolvedAsset:asset}
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:48,y:48,width:984,height:220,size:76},{type:'text',role:'body',x:48,y:300,width:984,height:120,size:30},{type:'image',assetId:'a',image_variant:'subject',x:0,y:480,width:1080,height:600}]}
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(raw,slot,system)
 const d={...direction().slides[0],design:spec,logo_url:'brand-logo',logo_size:96,logo_placement:'bottom_right',logo_pill:false}
 const result=engine.renderDesignSpec(spec,{d,headline:'Delivery partners',body:'Local partners deliver orders.',cta:'',eyebrow:'',imageUrl:asset.url,subject:asset.subject,assets:{a:asset}})
 const logo=result.nodes.find(n=>n.src==='brand-logo')
 assert.ok(logo);assert.ok(logo.width<=64)
 assert.ok(result.nodes.some(n=>n.type==='shape'&&n.x===logo.x-6&&n.width===logo.width+12))
 assert.ok(result.nodes.some(n=>n.src==='cutout'))
})

test('a slide with no safe logo space retains its content instead of throwing',()=>{
 const system=engine.normalizeDesignSystem({spacing:'compact'})
 const spec=engine.validateDesignSpec({elements:[{type:'text',role:'headline',x:48,y:48,width:984,height:984,size:76}]},{slot_id:'a'},system)
 const d={...direction().slides[0],design:spec,logo_url:'brand-logo',logo_size:96,logo_placement:'bottom_right'}
 const result=engine.renderDesignSpec(spec,{d,headline:'Example',body:'',cta:'',eyebrow:'',imageUrl:null})
 assert.ok(result.nodes.some(n=>n.text==='Example'))
 assert.equal(result.nodes.filter(n=>n.src==='brand-logo').length,0)
})

test('image assemblies keep their lower props visible instead of rewarding off-canvas size',()=>{
 const content={headline:'Catálogo atualizado em tempo real',body:'A Ikarus Pay sincroniza automaticamente o inventário virtual com os fornecedores, mostrando ao cliente apenas o stock real.',cta:'',eyebrow:''}
 const asset={url:'photo',subject:{url:'cutout',width:1000,height:1200,cropEdges:{left:true,right:true,bottom:true},silhouette:[{top:0,bottom:.4,left:.6,right:1},{top:.4,bottom:.7,left:.35,right:1},{top:.7,bottom:1,left:0,right:1}]}}
 const slot={slot_id:'a',resolvedAsset:asset}
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:130,width:936,height:250,size:76},{type:'text',role:'body',x:72,y:430,width:520,height:300,size:30},{type:'image',assetId:'a',x:0,y:450,width:1080,height:1296,bleed_bottom:true}]}
 const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 const image=fitted.elements.find(e=>e.type==='image')
 assert.ok((Math.min(1080,image.y+image.height)-image.y)/image.height>=.85)
 assert.equal(image.crop_alignment,'right')
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,slot,system)
 const d={...direction().slides[0],library:true,design:spec}
 const result=engine.assembleSlide({d,...content,imageUrl:asset.url,subject:asset.subject,assets:{a:asset},slideNumber:2,totalSlides:5})
 const node=result.nodes.find(n=>n.src==='cutout')
 assert.ok((Math.min(1080,node.y+node.height)-node.y)/node.height>=.84)
 assert.equal(node.x+node.width,1080)
 const visibleProps=Math.max(0,Math.min(1080,node.y+node.height)-(node.y+node.height*.7))/(node.height*.3)
 assert.ok(visibleProps>=.5)
})

test('unnumbered arrow sequence becomes a connected four-stage flow',()=>{
 const content={headline:'Como a automação da Ikarus Pay funciona',body:'Registo automático do pedido → Atualização instantânea de stock → Notificação imediata ao cliente → Preparação e envio pelo fulfilment Ikarus',cta:'',eyebrow:''}
 const steps=engine.splitDesignSteps(content.body)
 assert.equal(steps.length,4)
 assert.equal(steps.map(s=>s.text).join(' → '),content.body)
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:150,width:936,height:250,size:76},{type:'text',role:'body',x:72,y:560,width:936,height:200,size:30}]}
 const fitted=engine.fitResolvedSlide(raw,{slot_id:'a'},content,engine.fitTextLayout)
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,{slot_id:'a'},system)
 const d={...direction().slides[0],library:true,block_style:'plain',design:spec}
 const result=engine.renderDesignSpec(spec,{d,...content,imageUrl:null})
 assert.equal(result.nodes.filter(n=>n.type==='text'&&steps.some(s=>s.text===n.text)).length,4)
 assert.equal(result.nodes.filter(n=>n.type==='text'&&['01','02','03','04'].includes(n.text)).length,4)
 assert.ok(result.nodes.some(n=>n.type==='shape'&&n.width===2&&n.height>100))
 assert.ok(!result.nodes.some(n=>n.text===content.body))
})

test('numbered explanations keep internal arrows inside three readable flow stages',()=>{
 const content={headline:'Como funciona a sincronização',body:'1. Produto adicionado ao catálogo → atualização automática de stock.\n2. Pedido confirmado → informação de entrega enviada ao parceiro logístico.\n3. Logística coleta e entrega → status atualizado em tempo real para o cliente.',cta:'',eyebrow:''}
 const steps=engine.splitDesignSteps(content.body)
 assert.equal(steps.length,3);assert.ok(steps.every(s=>s.text.includes('→')))
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:120,y:250,width:840,height:200,size:76},{type:'text',role:'body',x:120,y:560,width:840,height:160,size:26}]}
 const fitted=engine.fitResolvedSlide(raw,{slot_id:'a'},content,engine.fitTextLayout)
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,{slot_id:'a'},system)
 const d={...direction().slides[0],library:true,block_style:'cards',design:spec}
 const result=engine.renderDesignSpec(spec,{d,...content,imageUrl:null})
 const stages=result.nodes.filter(n=>steps.some(s=>s.text===n.text))
 assert.equal(stages.length,3);assert.ok(stages.every(n=>n.fontSize>=24))
 assert.ok(fitted.elements.find(e=>e.role==='body').height>300)
})

test('testimonial fitting expands type and preserves a single quotation',()=>{
 const content={headline:'Cliente satisfeito',body:'“Desde que passei a usar a Ikarus Pay, meus carrinhos abandonados reduziram pela metade. O processo está sempre sincronizado e os clientes recebem os produtos rapidamente.” – João, dono da LojaTech.',cta:'',eyebrow:''}
 assert.equal(engine.splitBodyBlocks(content.body).length,0)
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:600,y:160,width:400,height:220,size:76},{type:'text',role:'body',x:600,y:560,width:400,height:260,size:26},{type:'number',x:72,y:400,width:400,height:300}]}
 const fitted=engine.fitResolvedSlide(raw,{slot_id:'a'},content,engine.fitTextLayout)
 const body=fitted.elements.find(e=>e.role==='body')
 assert.ok(body.width>=760);assert.ok(body.size>30)
 assert.ok(!fitted.elements.some(e=>e.type==='number'))
})

test('gradient emphasis has two readable tonal stops on the actual surface',()=>{
 for(const surface of ['#13220c','#f7f8f4']){
  const marked=engine.emphasizeHeadline('A falta de sincronização afasta clientes?',4,'#9cd475','#294222','Inter','Inter',surface)
  const stops=marked.match(/linear-gradient\(110deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)/i)
  assert.ok(stops)
  assert.ok(engine.contrastRatio(stops[1],surface)>=4.5);assert.ok(engine.contrastRatio(stops[2],surface)>=4.5)
 }
})

test('large corner decorations become editable brand-colored abstract petals',()=>{
 const system=engine.normalizeDesignSystem({spacing:'compact'}),slot={slot_id:'a'}
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:150,width:900,height:240,size:76},{type:'ring',x:550,y:550,width:500,height:500,color:'primary',opacity:10,layer:-6}]}
 const spec=engine.validateDesignSpec(raw,slot,system),d={...direction().slides[0],design:spec}
 const result=engine.renderDesignSpec(spec,{d,headline:'Brand story',body:'',cta:'',eyebrow:'',imageUrl:null})
 const petals=result.nodes.filter(n=>n.type==='shape'&&n.shape==='ellipse')
 assert.ok(petals.length>=4);assert.ok(petals.some(n=>n.rotation>0))
 assert.ok(petals.every(n=>n.fill.startsWith(d.palette.primary)||n.stroke.startsWith(d.palette.primary)))
})

test('testimonial renders a readable panel with separate attribution',()=>{
 const content={headline:'Cliente satisfeito',body:'“Desde que passei a usar a Ikarus Pay, meus carrinhos abandonados reduziram pela metade. O processo está sempre sincronizado e os clientes recebem os produtos rapidamente.” – João, dono da LojaTech.',cta:'',eyebrow:''}
 const raw={background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:150,width:936,height:240,size:90},{type:'text',role:'body',x:72,y:440,width:936,height:470,size:42}]}
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(raw,{slot_id:'a'},system)
 const d={...direction().slides[0],library:true,design:spec}
 const result=engine.renderDesignSpec(spec,{d,...content,imageUrl:null})
 const author=result.nodes.find(n=>n.text==='João, dono da LojaTech.')
 const quote=result.nodes.find(n=>n.text?.startsWith('Desde que passei'))
 assert.ok(author);assert.ok(quote);assert.equal(author.fontWeight,700)
 assert.ok(author.y>=quote.y+quote.height)
 const panel=result.nodes.find(n=>n.type==='shape'&&n.width===936&&n.height===470)
 assert.ok(panel);assert.ok(engine.contrastRatio(quote.color,panel.fill)>=4.5)
 assert.ok(!result.nodes.some(n=>n.text===content.body))
})

test('reviews vary between accent cards, editorial quotes and centered frames',()=>{
 const content={headline:'Cliente satisfeito',body:'“O processo está sempre sincronizado e os clientes recebem os produtos rapidamente.” – João',cta:'',eyebrow:''}
 const spec=engine.validateDesignSpec({background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:100,width:936,height:220,size:76},{type:'text',role:'body',x:72,y:400,width:936,height:470,size:42}]},{slot_id:'a'},engine.normalizeDesignSystem({spacing:'compact'}))
 const d={...direction().slides[0],library:true,design:spec}
 const outputs=[0,1,2].map(slideNumber=>engine.renderDesignSpec(spec,{d,...content,imageUrl:null,slideNumber}).nodes)
 assert.equal(outputs.filter(nodes=>nodes.some(n=>n.text==='“')).length,1)
 assert.equal(outputs.filter(nodes=>nodes.some(n=>n.text==='João'&&n.textAlign==='center')).length,1)
 for(const nodes of outputs){
  const quote=nodes.find(n=>n.text?.startsWith('O processo'))
  const author=nodes.find(n=>n.text==='João')
  assert.ok(quote&&author);assert.ok(author.y>=quote.y+quote.height)
 }
})

test('framed environmental photos preserve their mask and fill the frame',()=>{
 const asset={url:'scene',width:1400,height:700,subject:{url:'unused-cutout',width:400,height:800}}
 const slot={slot_id:'a',treatment:'environmental',resolvedAsset:asset}
 const spec=engine.validateDesignSpec({background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:80,width:900,height:220,size:70},{type:'image',assetId:'a',image_variant:'photo',mask:'rounded',radius:48,x:520,y:400,width:480,height:550}]},slot,engine.normalizeDesignSystem({spacing:'compact'}))
 const d={...direction().slides[0],slot_id:'a',design:spec}
 const result=engine.renderDesignSpec(spec,{d,headline:'Photo story',body:'',cta:'',eyebrow:'',imageUrl:asset.url,assets:{a:asset}})
 const image=result.nodes.find(n=>n.src==='scene')
 assert.ok(image);assert.equal(image.mask,'rounded');assert.equal(image.objectFit,'cover')
 assert.equal(image.width,480);assert.equal(image.height,550)
 assert.ok(!result.nodes.some(n=>n.src==='unused-cutout'))
})

test('inline numbered analysis becomes four flow rows outside library mode',()=>{
 const body='1. Limpe os dados – elimine duplicados e erros. 2. Segmente por cliente, produto ou canal. 3. Compare métricas ao longo do tempo. 4. Detecte padrões e lacunas.'
 const content={headline:'Passo a passo da análise',body,cta:'',eyebrow:''}
 const raw={background:{type:'solid',color:'bg'},elements:[{type:'text',role:'headline',x:72,y:150,width:936,height:220,size:80},{type:'text',role:'body',x:72,y:420,width:936,height:480,size:36}]}
 const fitted=engine.fitResolvedSlide(raw,{slot_id:'a'},content,engine.fitTextLayout)
 const spec=engine.validateDesignSpec(fitted,{slot_id:'a'},engine.normalizeDesignSystem({spacing:'compact'}))
 const d={...direction().slides[0],library:false,design:spec}
 const result=engine.renderDesignSpec(spec,{d,...content,imageUrl:null})
 assert.equal(engine.splitDesignSteps(body).length,4)
 assert.equal(result.nodes.filter(n=>['01','02','03','04'].includes(n.text)).length,4)
 assert.ok(!result.nodes.some(n=>n.text===body))
})

test('background photo KPI copy fits together over a full-canvas image',()=>{
 const content={headline:'CAC – Custo de Aquisição de Cliente',body:'Valor médio gasto para conquistar um novo cliente. Exemplo: soma dos investimentos em campanhas dividido pelo número de clientes adquiridos no mesmo período.',cta:'',eyebrow:''}
 const raw={background:{type:'image',color:'bg'},elements:[{type:'text',role:'headline',x:72,y:620,width:936,height:170,size:80},{type:'text',role:'body',x:72,y:814,width:936,height:130,size:34}]}
 const slot={slot_id:'a',treatment:'environmental',resolvedAsset:{url:'office',width:600,height:1200}}
 const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 const system=engine.normalizeDesignSystem({spacing:'compact'}),spec=engine.validateDesignSpec(fitted,slot,system)
 const d={...direction().slides[0],slot_id:'a',library:true,design:spec}
 const result=engine.assembleSlide({d,...content,imageUrl:'office',assets:{a:slot.resolvedAsset},slideNumber:1,totalSlides:5})
 const image=result.nodes.find(n=>n.src==='office')
 assert.equal(image.x,0);assert.equal(image.y,0);assert.equal(image.width,1080);assert.equal(image.height,1080);assert.equal(image.mask,'none')
 const title=fitted.elements.find(e=>e.role==='headline'),body=fitted.elements.find(e=>e.role==='body')
 assert.equal(body.y-title.y-title.height,12);assert.ok(body.y+body.height<=1008);assert.ok(body.size>=24)
 assert.ok(result.nodes.some(n=>n.type==='gradient'&&n.angle===180))
})

test('older background plans recover the carousel eyebrow before rendering',()=>{
 const content={headline:'Customer acquisition',body:'Measure the cost of each new customer.',cta:'',eyebrow:'01'}
 const slot={slot_id:'a',treatment:'environmental',resolvedAsset:{url:'photo'}}
 const raw={background:{type:'image',color:'bg'},elements:[{type:'text',role:'headline',x:72,y:620,width:936,height:170,size:80},{type:'text',role:'body',x:72,y:814,width:936,height:130,size:34}]}
 const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 assert.equal(raw.elements.some(e=>e.role==='eyebrow'),false)
 const spec=engine.validateDesignSpec(fitted,slot,engine.normalizeDesignSystem({spacing:'compact'}))
 const d={...direction().slides[0],slot_id:'a',library:true,design:spec}
 const result=engine.assembleSlide({d,...content,imageUrl:'photo',slideNumber:1,totalSlides:3})
 assert.equal(result.nodes.filter(n=>n.text==='01').length,1)
 assert.ok(result.nodes.some(n=>n.src==='photo'&&n.width===1080))
 const again=engine.fitResolvedSlide(fitted,slot,content,engine.fitTextLayout)
 assert.equal(again.elements.filter(e=>e.role==='eyebrow').length,1)
})

test('introductory sentence and bullets become separate introduction and three cards',()=>{
 const content={headline:'Da análise à estratégia',body:'Transformamos os insights em ações concretas:\n• Estratégia de conteúdo segmentado\n• Otimização de campanhas de mídia\n• Automação de processos de vendas',cta:'',eyebrow:''}
 const raw={background:{type:'solid',color:'bg'},elements:[{type:'text',role:'headline',x:72,y:150,width:936,height:240,size:96},{type:'text',role:'body',x:72,y:420,width:936,height:470,size:42}]}
 const slot={slot_id:'a'},fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 const spec=engine.validateDesignSpec(fitted,slot,engine.normalizeDesignSystem({spacing:'compact'}))
 const d={...direction().slides[0],library:false,design:spec}
 const result=engine.assembleSlide({d,...content,imageUrl:null})
 assert.equal(result.nodes.filter(n=>n.text==='Transformamos os insights em ações concretas:').length,1)
 for(const text of content.body.split('\n').slice(1).map(s=>s.slice(2))){
  const node=result.nodes.find(n=>n.text===text);assert.ok(node);assert.ok(node.fontSize>=24)
  assert.ok(result.nodes.some(n=>n.type==='shape'&&n.shape==='rect'&&n.x<node.x&&n.y<node.y&&n.x+n.width>=node.x+node.width&&n.y+n.height>=node.y+node.height))
 }
 assert.ok(!result.nodes.some(n=>n.text===content.body))
})

test('retired boxed gradient text decoration is not rendered',()=>{
 const text='Transform data into better decisions'
 assert.equal(engine.emphasizeHeadline(text,6,'#77aa44','#111111'),text)
})

test('long background copy recovers from fixed photo boxes without losing copy or image',()=>{
 const content={headline:'Conheça as vantagens da gestão integrada para o sucesso do seu projeto',body:'Planeamento rigoroso e acompanhamento contínuo garantem qualidade, transparência e controlo em todas as etapas.',cta:'Contacte a nossa equipa para saber mais',eyebrow:'02'}
 const slot={slot_id:'a',treatment:'environmental',resolvedAsset:{url:'office',width:1200,height:800}}
 const raw={background:{type:'image',color:'bg'},elements:[
  {type:'shape',x:0,y:0,width:520,height:1080,color:'bg'},
  {type:'text',role:'headline',x:64,y:230,width:392,height:100,size:76},
  {type:'text',role:'body',x:64,y:510,width:392,height:130,size:30},
  {type:'badge',role:'cta',x:64,y:900,width:392,height:50,size:24},
 ]}
 const original=JSON.stringify(raw)
 assert.throws(()=>engine.fitTextLayout({text:content.headline,width:392,height:100,preferredSize:76,minSize:42}))
 const fitted=engine.fitResolvedSlide(raw,slot,content,engine.fitTextLayout)
 assert.equal(JSON.stringify(raw),original)
 assert.equal(fitted.background.type,'image')
 assert.ok(!fitted.elements.some(e=>e.type==='shape'))
 const boxes=['headline','body','cta'].map(role=>fitted.elements.find(e=>e.role===role))
 for(const [index,e] of boxes.entries()){
  assert.ok(e.size>=(index===0?48:28))
  assert.ok(e.x>=72&&e.x+e.width<=1008&&e.y+e.height<=1008)
  if(index)assert.ok(e.y>=boxes[index-1].y+boxes[index-1].height+12)
 }
 const system=engine.normalizeDesignSystem({spacing:'compact'})
 const spec=engine.validateDesignSpec(fitted,slot,system)
 const d={...direction().slides[0],slot_id:'a',library:true,design:spec}
 const result=engine.assembleSlide({d,...content,imageUrl:'office',assets:{a:slot.resolvedAsset},slideNumber:2,totalSlides:3})
 assert.ok(result.nodes.some(n=>n.src==='office'&&n.width===1080&&n.height===1080))
 for(const copy of Object.values(content))assert.ok(result.nodes.some(n=>n.text===copy),'Missing copy: '+copy)
})

test('saved five-slide Portuguese carousel completes every photo campaign composition',async()=>{
 const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'photoCopyLayout.fixture.json'),'utf8'))
 for(let campaign=0;campaign<6;campaign++){
  const db={collection:()=>({find:()=>({sort:()=>({limit:()=>({toArray:async()=>Array.from({length:5},(_,n)=>({designCampaign:{index:(campaign+n+1)%6}}))})})})})}
  const result=await engine.handleDesignCanvas(db,{brandContext:fixture.brand,copy:fixture.copy,resolvedPlan:structuredClone(fixture.resolvedPlan)},false)
  assert.equal(result.status,200,'Campaign '+campaign+': '+result.body.error)
 }
})

test('saved long CTA carousel fits every composition without dropping the CTA',async()=>{
 const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'longCtaLayout.fixture.json'),'utf8'))
 for(let campaign=0;campaign<6;campaign++){
  const db={collection:()=>({find:()=>({sort:()=>({limit:()=>({toArray:async()=>Array.from({length:5},(_,n)=>({designCampaign:{index:(campaign+n+1)%6}}))})})})})}
  const result=await engine.handleDesignCanvas(db,{brandContext:fixture.brand,copy:fixture.copy,resolvedPlan:structuredClone(fixture.resolvedPlan)},false)
  assert.equal(result.status,200,'Campaign '+campaign+': '+result.body.error)
  const closing=result.body.pages.at(-1)
  const cta=closing.nodes.find(n=>n.text?.includes('Fale connosco e descubra como o BIM pode transformar o seu projeto.'))
  assert.ok(cta,'CTA must survive in rendered nodes, not just saved input')
  assert.ok(cta.x>=0&&cta.x+cta.width<=1080&&cta.y>=0&&cta.y+cta.height<=1080)
 }
})
