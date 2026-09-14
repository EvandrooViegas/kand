const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const load=p=>stripTypeScriptTypes(fs.readFileSync(p,'utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const {blueprintSpec}=new Function(load('lib/designs/brandBlueprint.ts')+';return {blueprintSpec}')()
const {DESIGN_LIBRARY,librarySpec}=new Function(load('lib/designs/library.ts')+';return {DESIGN_LIBRARY,librarySpec}')()
const {planPostLayout,fitPlannedLayout,arrangeReadableBody}=new Function('blueprintSpec','DESIGN_LIBRARY','librarySpec',load('lib/designs/postLayout.ts')+';return {planPostLayout,fitPlannedLayout,arrangeReadableBody}')(blueprintSpec,DESIGN_LIBRARY,librarySpec)
test('planning works before images exist and preserves frames through fitting',()=>{
 const plan=planPostLayout({}, {format:'carousel',slides:[{headline:'Start here'},{headline:'Working',body:'Example'}]}, {id:'post'},'editorial')
 assert.equal(plan.designId,'editorial');assert.equal(plan.slots.length,2)
 const layout=plan.slots[0],before=JSON.stringify(layout)
 const fit=fitPlannedLayout(layout,{slot_id:layout.slot_id,resolvedAsset:{url:'photo',subject:{url:'cutout',width:400,height:800}}})
 const image=fit.elements.find(e=>e.type==='image')
 assert.equal(image.width/image.height,.5);assert.ok(image.width<=layout.frame.width&&image.height<=layout.frame.height)
 assert.equal(JSON.stringify(layout),before)
})
test('medium copy keeps a large edge-anchored image and a clear footer',()=>{
 const spec={background:{type:'solid'},elements:[{type:'text',role:'headline'},{type:'text',role:'body',width:700,height:450},{type:'text',role:'cta'},{type:'image',x:700,y:600,width:200,height:200}]}
 const result=arrangeReadableBody(spec,'Detailed explanation. '.repeat(12))
 const image=result.elements.find(e=>e.type==='image'),body=result.elements.find(e=>e.role==='body'),cta=result.elements.find(e=>e.role==='cta')
 assert.equal(image.x+image.width,1080);assert.equal(image.y+image.height,1080)
 assert.ok(image.width>=560);assert.ok(body.x+body.width<image.x);assert.ok(cta.x+cta.width<image.x)
 assert.equal(spec.elements.at(-1).width,200)
})
test('dense slides request no assets even when the brand uses background photography',()=>{
 const template={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:100,width:900,height:250},{type:'text',role:'body',x:72,y:440,width:400,height:470}]}
 const brand={designs:[{id:'brand',baseId:'editorial',blueprint:{imagery:{placement:'background'},templates:{cover:template,content:template,closing:template}}}]}
 const body='Useful detailed explanation with important information. '.repeat(10)
 const layout=planPostLayout(brand,{headline:'An explanation',body},{}).slots[0]
 assert.equal(layout.needs_visual,false);assert.equal(layout.frame,null);assert.equal(layout.background,false)
 assert.equal(layout.spec.background.type,'solid');assert.equal(layout.spec.elements.find(e=>e.role==='body').width,936)
 const {localAssetBrief}=new Function(load('lib/designs/localAssetBrief.ts')+';return {localAssetBrief}')()
 const brief=localAssetBrief(layout,{body},{})
 assert.equal(brief.preferred_source,'none');assert.equal(brief.generation_prompt,'');assert.deepEqual(brief.search_queries,[])
})
test('background layouts retain scene and missing assets leave a usable canvas',()=>{
 const template={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:100,width:900,height:250}]}
 const brand={designs:[{id:'brand',baseId:'editorial',blueprint:{imagery:{placement:'background'},templates:{cover:template,content:template,closing:template}}}]}
 const plan=planPostLayout(brand,{headline:'Travel'},{}),layout=plan.slots[0]
 assert.equal(layout.treatment,'environmental');assert.equal(layout.frame.width,1080)
 const fitted=fitPlannedLayout(layout,{resolvedAsset:{url:'scene',width:800,height:1200},treatment:'environmental'})
 assert.equal(fitted.background.type,'solid')
 const image=fitted.elements.find(e=>e.type==='image'),title=fitted.elements.find(e=>e.role==='headline')
 assert.equal(image.width/image.height,800/1200)
 assert.ok(image.y+image.height<=title.y)
 assert.equal(fitPlannedLayout(layout,{}).background.type,'solid')
})
test('briefs prioritize each slide action over the shared logistics topic',()=>{
 const {localAssetBrief}=new Function(load('lib/designs/localAssetBrief.ts')+';return {localAssetBrief}')()
 const layout={slot_id:'slide_2',needs_visual:true,brief:'Portrait foreground frame.'},idea={id:'campaign',topic:'Launch a store with warehouse fulfilment'}
 const headlines=['Registe a sua conta','Carregue o catálogo de produtos','Configure pagamentos','Ative a logística']
 const briefs=headlines.map(headline=>localAssetBrief(layout,{headline},idea))
 assert.equal(new Set(briefs.map(b=>b.subject_description)).size,4)
 assert.match(briefs[0].subject_description,/registration|account/)
 assert.match(briefs[1].subject_description,/photograph|products/)
 assert.match(briefs[2].subject_description,/payment|bank card/)
 assert.match(briefs[3].subject_description,/warehouse|parcel/)
 assert.ok(briefs.every(b=>b.generation_prompt.includes('85–92 percent')))
})
test('short-copy layouts expand foreground imagery instead of leaving thumbnails',()=>{
 const result=arrangeReadableBody({background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:100,width:420,height:300},{type:'text',role:'body',x:72,y:470,width:420,height:300},{type:'image',x:650,y:600,width:250,height:250}]},'A concise explanation.')
 const image=result.elements.find(e=>e.type==='image')
 assert.equal(image.width,560);assert.equal(image.y+image.height,1080)
 const body=result.elements.find(e=>e.role==='body')
 assert.ok(body.x+body.width<image.x)
})
