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
 raw.templates.cover.elements=raw.templates.cover.elements.filter(e=>e.type!=='image')
 assert.equal(normalizeBlueprint(raw),null)
})
