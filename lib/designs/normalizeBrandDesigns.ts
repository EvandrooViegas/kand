import { DESIGN_LIBRARY } from './library'
import { PALETTE_PICKS } from './palettes'

/** Repair enum drift without throwing away the model's brand-specific content. */
export function normalizeBrandDesigns(parsed: any) {
  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.designs) ? parsed.designs : parsed?.design ? [parsed.design] : parsed?.blueprint ? [parsed] : []
  if (!Array.isArray(candidates)) return []
  const usedFamilies = new Set<string>(), usedCompositions = new Set<string>()
  const clean = (v: any) => typeof v === 'string' ? v.trim() : ''
  const key = (v: any) => clean(v).toLowerCase().replace(/[^a-z0-9]/g,'')
  return candidates.filter(d=>d && typeof d==='object' && !Array.isArray(d) && (d.blueprint||clean(d.name)||clean(d.headline)||clean(d.rationale))).slice(0,3).map((d:any,index:number)=>{
    const available = DESIGN_LIBRARY.filter(f=>!usedFamilies.has(f.id))
    const family = available.find(f=>key(f.id)===key(d.baseId)||key(f.name)===key(d.baseId)) || available[index % available.length]
    usedFamilies.add(family.id)
    const palette = PALETTE_PICKS.find(p=>key(p.id)===key(d.paletteId)||key(p.name)===key(d.paletteId)) || PALETTE_PICKS.find(p=>p.id===['light','dark','bold'][index])!
    const compositions = ['split','stage','diagonal'].filter(c=>!usedCompositions.has(c))
    const composition = compositions.find(c=>c===key(d.artDirection?.composition)) || compositions[0]
    usedCompositions.add(composition)
    return {...d, name:clean(d.name),headline:clean(d.headline),body:clean(d.body),rationale:clean(d.rationale),baseId:family.id,paletteId:palette.id,
      tags:(Array.isArray(d.tags)?d.tags:[]).filter((t:any)=>typeof t==='string'),
      artDirection:{composition,lighting:key(d.artDirection?.lighting)==='dramatic'?'dramatic':'soft',motif:['ring','beam','wash'].includes(key(d.artDirection?.motif))?key(d.artDirection.motif):['ring','beam','wash'][index]}}
  })
}
