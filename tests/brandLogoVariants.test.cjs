const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const source=stripTypeScriptTypes(fs.readFileSync('lib/services/brandLogoVariants.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
test('missing variants are generated from uploaded logo and saved once on the brand',async()=>{
 let calls=0,saved
 const ensure=new Function('generateLogoVariants','persistInlineImages',source+';return ensureBrandLogoVariants')(async input=>{calls++;assert.match(input,/^data:image\/png;base64,/);return {source:input,blackTransparent:'black',whiteTransparent:'white'}},async(db,v)=>v)
 const brand={id:'brand-flow',logo:'/api/uploads/logo'}
 const db={collection:name=>name==='uploads'?{findOne:async()=>({contentType:'image/png',bytes:Buffer.from('image')})}:{updateOne:async(query,update)=>{assert.equal(query['brandContext.logo'],brand.logo);saved=update.$set['brandContext.logoVariants']}}}
 const result=await ensure(db,brand)
 assert.equal(result.source,brand.logo);assert.equal(saved,result);assert.equal(await ensure(db,brand),result);assert.equal(calls,1)
})
test('valid saved upload URLs are reused without generation',async()=>{
 const ensure=new Function('generateLogoVariants','persistInlineImages',source+';return ensureBrandLogoVariants')(()=>{throw Error('must not generate')},()=>{throw Error('must not persist')})
 const brand={logo:'logo',logoVariants:{source:'logo',blackTransparent:'/api/uploads/black',whiteTransparent:'/api/uploads/white'}}
 assert.equal(await ensure({},brand),brand.logoVariants)
})
