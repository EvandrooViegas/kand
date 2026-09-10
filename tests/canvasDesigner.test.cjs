const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/handlers/canvasDesignerHandler.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export async function/g, 'async function')
const copyTools = vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname, '../lib/services/copyText.ts'), 'utf8').replace(/export /g, '')) + '\n({withoutEmoji,cleanCopy})')
const engine = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({splitDesignSteps,emphasizeHeadline,recoverDesignInput,handleSwitchDesign,validateDesignSpec,renderDesignSpec,fitText,fitTextLayout,normalizeDesignSystem,buildStrategyPalette,ensureContrast,contrastRatio,parseArtDirection,buildSingleCanvas,buildCarouselCanvas,buildPrompt,handleDesignCanvas,designIssues})', {
  ...vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname, '../lib/designs/library.ts'),'utf8').replace(/export /g,''))+'\n({DESIGN_LIBRARY,librarySpec,splitBulletItems})'),
  ...vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../lib/designs/palettes.ts'),'utf8').replace(/export /g,''))+'\n({PALETTE_PICKS,paletteColors,choosePalette})'),
  withoutEmoji: copyTools.withoutEmoji, prepareSubjectAssets: async (db, plan) => plan, uuidv4: require('node:crypto').randomUUID, console, process: { env: {} },
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
  assert.equal(result.nodes.at(-2).type, 'gradient')
  assert.equal(result.nodes.at(-2).stops[1].alpha, 100)
  assert.equal(result.nodes.at(-2).stops[2].alpha, 100)
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
