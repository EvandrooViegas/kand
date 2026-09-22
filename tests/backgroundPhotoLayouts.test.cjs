const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {stripTypeScriptTypes}=require('node:module')
const load=path=>stripTypeScriptTypes(fs.readFileSync(path,'utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const {blueprintSpec}=new Function(load('lib/designs/brandBlueprint.ts')+';return {blueprintSpec}')()
const {DESIGN_LIBRARY,librarySpec}=new Function(load('lib/designs/library.ts')+';return {DESIGN_LIBRARY,librarySpec}')()
const {backgroundCompositionForDesign,planPostLayout,fitPlannedLayout}=new Function('blueprintSpec','DESIGN_LIBRARY','librarySpec',load('lib/designs/postLayout.ts')+';return {backgroundCompositionForDesign,planPostLayout,fitPlannedLayout}')(blueprintSpec,DESIGN_LIBRARY,librarySpec)

test('carousel covers reserve larger type than content slides',()=>{
 const slot={slot_id:'cover',resolvedAsset:{url:'photo'}}
 const cover=librarySpec(DESIGN_LIBRARY[0],slot,{headline:'Build beyond the jobsite',body:'See what is holding growth back.',cta:'',eyebrow:''},0,4)
 const content=librarySpec(DESIGN_LIBRARY[0],slot,{headline:'A useful detail',body:'Supporting explanation',cta:'',eyebrow:'01'},1,4)
 assert.ok(cover.elements.find(e=>e.role==='headline').size>=104)
 assert.ok(cover.elements.find(e=>e.role==='headline').size>content.elements.find(e=>e.role==='headline').size)
})

test('background image preference requests a photo even for a text-only template and retains the cover teaser',()=>{
 const template={background:{type:'solid',color:'bg'},elements:[{type:'text',role:'headline',x:72,y:140,width:936,height:260,size:90},{type:'text',role:'body',x:72,y:430,width:936,height:180,size:32}]}
 const brand={imageDisposition:'background',designs:[{id:'text-template',baseId:'editorial',blueprint:{imagery:{placement:'none'},templates:{cover:template,content:template,closing:template}}}]}
 const plan=planPostLayout(brand,{format:'carousel',slides:[{headline:'Why is your store not selling?',body:'Here are some of the reasons.',cta:''},{headline:'Reason one',body:'A useful explanation.',cta:''}]},{},'text-template')
 assert.equal(plan.slots[0].background,true)
 assert.equal(plan.slots[0].needs_visual,true)
 assert.equal(plan.slots[0].spec.background.type,'image')
 assert.equal(plan.slots[0].spec.elements.find(e=>e.role==='body').role,'body')
})

test('background photography rotates through six distinct editorial compositions',()=>{
 const template={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:100,width:900,height:250},{type:'text',role:'body',x:72,y:440,width:900,height:250},{type:'text',role:'cta',x:72,y:900,width:700,height:60}]}
 const brand={designs:[{id:'brand',baseId:'panorama',blueprint:{imagery:{placement:'background'},templates:{cover:template,content:template,closing:template}}}]}
 const layout=planPostLayout(brand,{headline:'Revenue growth',supportingText:'Compare performance before and after the campaign.',cta:'Learn more'},{}).slots[0]
 const slot={slot_id:layout.slot_id,resolvedAsset:{url:'scene',width:1200,height:800},treatment:'environmental'}
 const variants=Array.from({length:6},(_,backgroundVariant)=>fitPlannedLayout({...layout,backgroundVariant},slot))
 const signatures=variants.map(spec=>{
  const headline=spec.elements.find(e=>e.role==='headline')
  const panels=spec.elements.filter(e=>['shape','card','line'].includes(e.type)).map(e=>[e.type,e.x,e.y,e.width,e.height])
  return JSON.stringify([headline.x,headline.y,headline.width,panels])
 })
 assert.equal(new Set(signatures).size,6)
 assert.ok(variants.every(spec=>spec.background.type==='image'&&!spec.elements.some(e=>e.type==='image')))
 assert.ok(variants.some(spec=>spec.elements.some(e=>e.type==='shape'&&e.y===550&&e.width===1080)))
 assert.ok(variants.some(spec=>spec.elements.some(e=>e.type==='shape'&&e.width===520&&e.height===1080)))
 assert.ok(variants.some(spec=>spec.elements.some(e=>e.type==='card'&&e.width===968)))
})

test('a carousel keeps one background-photo composition across all slides',()=>{
 const handler=fs.readFileSync('lib/handlers/canvasDesignerHandler.ts','utf8')
 assert.match(handler,/backgroundVariant:designCompositionIndex/)
 assert.match(handler,/layout_offset:designCompositionIndex/)
 assert.match(handler,/si\.d\.library && !photoBackground && e\.role === 'headline'/)

 const template={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:100,width:900,height:250},{type:'text',role:'body',x:72,y:440,width:900,height:250}]}
 const brand={imageDisposition:'background',designs:[{id:'brand',baseId:'panorama',blueprint:{imagery:{placement:'background'},templates:{cover:template,content:template,closing:template}}}]}
 const layouts=planPostLayout(brand,{format:'carousel',slides:[
  {headline:'A short hook',body:'A concise teaser.'},
  {headline:'First reason',body:'A useful explanation.'},
  {headline:'Second reason',body:'Another useful explanation.'}
 ]},{},'brand').slots
 const signatures=layouts.map(layout=>{
  const slot={slot_id:layout.slot_id,resolvedAsset:{url:'scene',width:1200,height:800},treatment:'environmental'}
  const spec=fitPlannedLayout({...layout,backgroundVariant:4},slot)
  return JSON.stringify(spec.elements.filter(e=>['shape','card','line'].includes(e.type)).map(e=>[e.type,e.x,e.y,e.width,e.height]))
 })
 assert.equal(new Set(signatures).size,1)
})

test('a saved design receives the same composition across separate posts',()=>{
 const designId='saved-design-42'
 const first=backgroundCompositionForDesign(designId)
 const second=backgroundCompositionForDesign(designId)
 assert.equal(first,second)
 assert.ok(first>=0&&first<6)
 assert.notEqual(first,backgroundCompositionForDesign('saved-design-43'))
})
