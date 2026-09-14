const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const source=stripTypeScriptTypes(fs.readFileSync('lib/designs/brandBlueprint.ts','utf8').replace(/export /g,''))
const {normalizeBlueprint,blueprintSpec,complementaryAccent}=new Function(source+';return {normalizeBlueprint,blueprintSpec,complementaryAccent}')()
function blueprint(){const template={background:{type:'gradient',color:'primary',to:'bg',angle:37},elements:[{type:'text',role:'headline',x:92,y:90,width:850,height:260,size:90,font:'Unapproved Font'},{type:'text',role:'body',x:92,y:450,width:430,height:300},{type:'text',role:'cta',x:92,y:960,width:800,height:64},{type:'image',x:600,y:400,width:400,height:450,assetId:'invented'}]};return {theme:'studio',highlight:'gradient_text',imagery:{style:'drawing',placement:'framed',subject:'object'},templates:{cover:template,content:template,closing:template}}}
test('authored coordinates and imagery survive normalization while arbitrary fonts do not',()=>{
 const b=normalizeBlueprint(blueprint());assert.ok(b);assert.equal(b.templates.content.elements[0].x,92);assert.equal(b.templates.content.elements[0].font,undefined);assert.equal(b.imagery.style,'drawing')
 const spec=blueprintSpec(b,{slot_id:'real-slot',resolvedAsset:{url:'asset'}},{headline:'Heading',body:'Body'},1,4)
 assert.equal(spec.elements.find(e=>e.type==='image').assetId,'real-slot');assert.equal(spec.elements.some(e=>e.role==='cta'),false)
})
test('rejects overlapping copy boxes and missing templates',()=>{
 const b=blueprint();b.templates.content.elements[1].y=100;assert.equal(normalizeBlueprint(b),null);assert.equal(normalizeBlueprint({templates:{}}),null)
})
test('cover and content may omit CTA and vary image usage; invalid geometry explains the repair',()=>{
 const raw=blueprint()
 for(const chapter of ['cover','content'])raw.templates[chapter]={...raw.templates[chapter],elements:raw.templates[chapter].elements.filter(e=>e.role!=='cta'&&e.type!=='image')}
 const normalized=normalizeBlueprint(raw)
 assert.ok(normalized)
 assert.equal(normalized.templates.cover.elements.some(e=>e.role==='body'),false)
 const issues=[];raw.templates.content.elements[1].y=100
 assert.equal(normalizeBlueprint(raw,issues),null)
 assert.match(issues[0],/content: text boxes overlap/)
})
test('text-only system omits visual assets and complementary accents derive from brand color',()=>{
 const b=normalizeBlueprint(blueprint());b.imagery.placement='none'
 const spec=blueprintSpec(b,{slot_id:'x',resolvedAsset:{url:'asset'}},{headline:'Heading'},0,3)
 assert.equal(spec.elements.some(e=>e.type==='image'),false);assert.equal(complementaryAccent('#ff0000'),'#00ffff')
})

test('defaults produce a legible hierarchy and missing image stages are rejected',()=>{
 const raw=blueprint();delete raw.templates.cover.elements[0].size
 const normalized=normalizeBlueprint(raw)
 assert.equal(normalized.templates.cover.elements[0].size,86)
 assert.equal(normalized.templates.cover.elements[0].color,'text')
 for(const t of Object.values(raw.templates))t.elements=t.elements.filter(e=>e.type!=='image')
 assert.equal(normalizeBlueprint(raw),null)
})
test('accepts compact image stages and narrow headlines without fixed area thresholds',()=>{
 const raw=blueprint()
 for(const t of Object.values(raw.templates)) {
  Object.assign(t.elements[0],{width:360,height:280})
  Object.assign(t.elements.find(e=>e.type==='image'),{width:300,height:360})
 }
 const b=normalizeBlueprint(raw);assert.ok(b)
 assert.equal(b.templates.content.elements[0].width,360)
 assert.equal(b.templates.content.elements.find(e=>e.type==='image').width,300)
})
test('expands a short headline into free space without mutating the original',()=>{
 const raw=blueprint();raw.templates.cover.elements[0].height=80
 const b=normalizeBlueprint(raw);assert.ok(b)
 assert.ok(b.templates.cover.elements[0].height>80)
 assert.equal(raw.templates.cover.elements[0].height,80)
})
test('rejects headline boxes that cannot fit legible copy in available space',()=>{
 const raw=blueprint();Object.assign(raw.templates.content.elements[0],{x:1000,y:1000,width:70,height:60})
 const issues=[];assert.equal(normalizeBlueprint(raw,issues),null)
 assert.match(issues[0],/12-word headline/)
})
test('saved complementary designs use tonal backgrounds when applied',()=>{
 const b=blueprint();b.complementary=true
 assert.equal(normalizeBlueprint(b).complementary,false)
 const spec=blueprintSpec(b,{slot_id:'x'},{headline:'Title'},0,3)
 assert.equal(spec.background.color,'bg');assert.equal(spec.background.to,'gradTo')
})
test('identity content slides vary without mutating the stored reference; authored layouts take priority',()=>{
 const b=normalizeBlueprint(blueprint()),slot={slot_id:'x',resolvedAsset:{url:'image'}},copy={headline:'Heading',body:'Body'}
 const a=blueprintSpec(b,slot,copy,1,5),c=blueprintSpec(b,slot,copy,2,5)
 assert.notEqual(a.composition,c.composition)
 assert.equal(b.templates.content.elements[0].x,92)
 const authored={...b.templates.content,elements:b.templates.content.elements.map(e=>({...e,x:e.x+10}))}
 assert.equal(blueprintSpec(b,slot,copy,2,5,authored).elements[0].x,102)
})
test('composition uses content purpose, fits canvas and avoids overlapping copy',()=>{
 const b=normalizeBlueprint(blueprint()),slot={slot_id:'x',resolvedAsset:{url:'image'}}
 const cases=[{headline:'Save 70%',body:'More time for work'},{headline:'Steps',body:'1. Start\n2. Build\n3. Sell'},{headline:'Details',body:'Long explanation '.repeat(30)}]
 for(const [index,copy] of cases.entries()) {
  const spec=blueprintSpec(b,slot,copy,index+1,5)
  assert.equal(spec.composition,index===0?'statistic':'cards')
  const texts=spec.elements.filter(e=>e.role)
  for(const a of texts){assert.ok(a.x>=0&&a.y>=0&&a.x+a.width<=1080&&a.y+a.height<=1080);for(const c of texts.filter(c=>c!==a))assert.ok(a.x+a.width<=c.x||c.x+c.width<=a.x||a.y+a.height<=c.y||c.y+c.height<=a.y)}
 }
})
test('old gradient strips become subtle lighting behind the recomposed image',()=>{
 const b=normalizeBlueprint(blueprint())
 b.templates.content.elements.push({type:'gradient',x:72,y:110,width:936,height:80,opacity:100,endOpacity:100,color:'accent',layer:8})
 const spec=blueprintSpec(b,{slot_id:'x',resolvedAsset:{url:'image'}},{headline:'A new perspective',body:'Short explanation'},1,4)
 const light=spec.elements.find(e=>e.type==='glow')
 assert.ok(light);assert.equal(light.opacity,12);assert.ok(light.layer<0);assert.ok(light.height>80)
 assert.equal(spec.elements.some(e=>e.type==='gradient'),false)
})
test('cover placements vary with content while text and imagery stay separate',()=>{
 const b=normalizeBlueprint(blueprint()),layouts=new Set()
 for(let i=0;i<12;i++){
  const spec=blueprintSpec(b,{slot_id:'x',resolvedAsset:{url:'image'}},{headline:'Explore opportunity '+i},0,4)
  const t=spec.elements.find(e=>e.role==='headline'),im=spec.elements.find(e=>e.type==='image')
  assert.ok(im);assert.ok(t.x+t.width<=im.x||im.x+im.width<=t.x||t.y+t.height<=im.y||im.y+im.height<=t.y)
  layouts.add(JSON.stringify([t.x,t.y,t.width,im.x,im.y,im.width]))
 }
 assert.ok(layouts.size>=3)
})
