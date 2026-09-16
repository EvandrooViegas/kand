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
 assert.equal(fitted.background.type,'image')
 assert.equal(fitted.elements.some(e=>e.type==='image'),false)
 assert.ok(fitted.elements.find(e=>e.role==='headline').y>=620)
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
 assert.ok(briefs.every(b=>b.generation_prompt.includes('10 percent clear margin on each side')))
})
test('short-copy layouts expand foreground imagery instead of leaving thumbnails',()=>{
 const result=arrangeReadableBody({background:{type:'solid'},elements:[{type:'text',role:'headline',x:72,y:100,width:420,height:300},{type:'text',role:'body',x:72,y:470,width:420,height:300},{type:'image',x:650,y:600,width:250,height:250}]},'A concise explanation.')
 const image=result.elements.find(e=>e.type==='image')
 assert.equal(image.width,560);assert.equal(image.y+image.height,1080)
 const body=result.elements.find(e=>e.role==='body')
 assert.ok(body.x+body.width<image.x)
})

test('brand image preference restricts every visual slide and permits dense text-only slides',()=>{
 const template={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:100,width:900,height:250},{type:'text',role:'body',x:72,y:440,width:400,height:470}]}
 const brand={designs:[{id:'brand',baseId:'editorial',blueprint:{imagery:{placement:'background'},templates:{cover:template,content:template,closing:template}}}]}
 const copy={slides:[{headline:'Obras antes e depois'},{headline:'Details',body:'Detailed information about our process and delivery. '.repeat(12)}]}
 for(const imageDisposition of ['cutout','background','framed','none']){
  const plan=planPostLayout({...brand,imageDisposition},copy,{})
  assert.equal(plan.imageDisposition,imageDisposition)
  assert.equal(plan.slots[1].needs_visual,false)
  const first=plan.slots[0],image=first.spec.elements.find(e=>e.type==='image')
  if(imageDisposition==='none'){assert.ok(plan.slots.every(s=>!s.needs_visual&&!s.background));assert.equal(image,undefined)}
  if(imageDisposition==='background'){assert.equal(first.background,true);assert.equal(image,undefined)}
  if(imageDisposition==='cutout'){assert.equal(first.background,false);assert.equal(image.image_variant,'subject');assert.equal(first.treatment,'isolated_subject')}
  if(imageDisposition==='framed'){
   assert.equal(first.background,false);assert.equal(image.mask,'rounded');assert.equal(first.treatment,'environmental')
   const fitted=fitPlannedLayout(first,{slot_id:first.slot_id,treatment:'environmental',resolvedAsset:{url:'photo',width:1200,height:600}})
   const photo=fitted.elements.find(e=>e.type==='image');assert.equal(photo.width,image.width);assert.equal(photo.height,image.height)
  }
 }
 const changed=planPostLayout({...brand,imageDisposition:'cutout'},copy,{},undefined,'none')
 assert.ok(changed.slots.every(s=>!s.needs_visual));assert.equal(changed.imageDisposition,'none')
 assert.equal(brand.imageDisposition,undefined)
})

const {localAssetBrief:plannerBrief}=new Function(load('lib/designs/localAssetBrief.ts')+';return {localAssetBrief}')()
const {handlePlanAssets}=new Function('planPostLayout','localAssetBrief','NextResponse','corsify',load('lib/handlers/assetPlannerHandler.ts')+';return {handlePlanAssets}')(planPostLayout,plannerBrief,{json:body=>body},r=>r)
test('planner uses saved background preference despite stale client brand, and honors explicit post override',async()=>{
 const template={background:{type:'image'},elements:[{type:'text',role:'headline',x:72,y:100,width:900,height:250}]}
 const savedBrand={imageDisposition:'background',designs:[{id:'brand',baseId:'editorial',blueprint:{imagery:{placement:'background'},templates:{cover:template,content:template,closing:template}}}]}
 const db={collection:name=>name==='flows'?{findOne:async q=>{assert.equal(q.id,'flow-1');return {brandContext:savedBrand}}}:{find:()=>({limit:()=>({toArray:async()=>[]})})}}
 const request={brandContext:{id:'flow-1',imageDisposition:'cutout'},brand_id:'brand_flow-1',copy:{headline:'Building renovation'},idea:{id:'post'}}
 const layout=await handlePlanAssets(db,{...request,phase:'canvas'})
 assert.equal(layout.imageDisposition,'background');assert.equal(layout.slots[0].background,true)
 const plan=await handlePlanAssets(db,{...request,layoutPlan:layout})
 assert.equal(plan.slots[0].preferred_source,'unsplash');assert.equal(plan.slots[0].treatment,'environmental')
 const override=await handlePlanAssets(db,{...request,phase:'canvas',imageDisposition:'none'})
 assert.equal(override.imageDisposition,'none');assert.ok(override.slots.every(s=>!s.needs_visual))
 const byBrand=await handlePlanAssets(db,{...request,brandContext:{},phase:'canvas'})
 assert.equal(byBrand.imageDisposition,'background');assert.equal(savedBrand.imageDisposition,'background')
})

test('carousel backgrounds retain a shared tone despite contrasting templates',()=>{
 const elements=[{type:'text',role:'headline',x:72,y:150,width:936,height:240,size:80}]
 const brand={designs:[{id:'brand',baseId:'editorial',blueprint:{imagery:{placement:'none'},templates:{cover:{background:{type:'solid',color:'bg'},elements},content:{background:{type:'gradient',color:'primary',to:'accent'},elements},closing:{background:{type:'radial',color:'accent'},elements}}}}]}
 const plan=planPostLayout(brand,{slides:[{headline:'First'},{headline:'Second'},{headline:'Third'}]}, {})
 assert.equal(new Set(plan.slots.map(s=>JSON.stringify(s.spec.background))).size,1)
})
