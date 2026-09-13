const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
function read(p){return stripTypeScriptTypes(fs.readFileSync(p,'utf8').replace(/^import .*$/gm,'').replace(/export /g,''))}
const families=new Function(read('lib/designs/library.ts')+';return DESIGN_LIBRARY')()
const palettes=new Function(read('lib/designs/palettes.ts')+';return PALETTE_PICKS')()
const normalize=new Function('DESIGN_LIBRARY','PALETTE_PICKS',read('lib/designs/normalizeBrandDesigns.ts')+';return normalizeBrandDesigns')(families,palettes)
test('repairs repeated family IDs and unknown palettes without discarding copy',()=>{
 const result=normalize({designs:[0,1,2].map(i=>({name:'Brand direction '+i,headline:'A distinct message',baseId:'editorial',paletteId:'forest-green',artDirection:{composition:'split'}}))})
 assert.equal(result.length,3);assert.equal(new Set(result.map(d=>d.baseId)).size,3);assert.equal(new Set(result.map(d=>d.artDirection.composition)).size,3)
 assert.ok(result.every(d=>d.headline==='A distinct message'&&palettes.some(p=>p.id===d.paletteId)))
})
test('accepts display names and preserves a valid composition choice',()=>{
 const [d]=normalize({designs:[{name:'Launch',baseId:'Color Block',paletteId:'Accent first',artDirection:{composition:'diagonal'}}]})
 assert.equal(d.baseId,'colorblock');assert.equal(d.paletteId,'secondary');assert.equal(d.artDirection.composition,'diagonal')
})
test('keeps partial output without manufacturing missing designs',()=>{
 assert.equal(normalize({designs:[null,{},'bad',{name:'Valid'}]}).length,1)
 assert.deepEqual(normalize({wrong:[]}),[])
})
