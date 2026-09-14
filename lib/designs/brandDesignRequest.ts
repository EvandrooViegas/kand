import { BLUEPRINT_BRIEF } from './brandBlueprint'

/** Bound context and output independently. Never replay the previous layout JSON. */
export function brandDesignRequest(brand: any, existing: any[] = [], repair: boolean | string = false) {
 const text=(v:any,max:number)=>typeof v==='string'?v.slice(0,max):''
 const fonts=(Array.isArray(brand?.fonts)?brand.fonts:[]).slice(0,3).map((f:any)=>text(typeof f==='string'?f:f?.family||f?.name,60))
 const context={brand:{name:text(brand?.name,100),about:text(brand?.about,650),values:text(brand?.values,160),audience:text(brand?.audience,160),language:text(brand?.language,30),fonts,colors:(Array.isArray(brand?.colors)?brand.colors:[]).filter((c:any)=>typeof c==='string'&&/^#[0-9a-f]{3,8}$/i.test(c)).slice(0,6)},avoid:existing.slice(-4).map(d=>({name:text(d?.name,60),theme:text(d?.blueprint?.theme,20),highlight:text(d?.blueprint?.highlight,30),imagery:text(d?.blueprint?.imagery?.placement,20)}))}
 return {temperature:.8,max_tokens:3600,response_format:{type:'json_object'},messages:[
  {role:'system',content:BLUEPRINT_BRIEF.replace('Author three original reusable visual systems','Author ONE original reusable visual system')+' Return exactly ONE entry in designs. Keep JSON compact: 4–7 elements per template, omit optional default fields and keep rationale under 35 words.'},
  {role:'user',content:JSON.stringify(context)+(repair?'\nCorrect the previous attempt: '+(typeof repair==='string'?repair.slice(0,500):'Return complete cover, content and closing templates with non-overlapping text boxes.')+' Return the complete compact JSON, not a patch.':'')}
 ]}
}
