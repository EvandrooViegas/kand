export const PALETTE_PICKS = [
  {id:'brand',name:'Brand',theme:null},
  {id:'secondary',name:'Accent first',theme:null},
  {id:'light',name:'Light',theme:'studio'},
  {id:'dark',name:'Dark',theme:'atmospheric'},
  {id:'bold',name:'Bold',theme:'vibrant'},
] as const
export function paletteColors(colors: string[], pick: string) {
  return pick === 'secondary' && colors.length > 1 ? [colors[1],colors[0],...colors.slice(2)] : [...colors]
}

/** Brand designs use supplied hues; tonal gradients never invent an opposing hue. */
export function constrainBrandPalette(palette: any, colors: string[]) {
 const hex=(c:any)=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:typeof c==='string'&&/^#[0-9a-f]{3}$/i.test(c)?'#'+c.slice(1).split('').map(x=>x+x).join(''):null
 const supplied=colors.map(hex).filter(Boolean)
 const primary=supplied[0]||palette.primary
 const mix=(a:string,b:string,t:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('')
 return {...palette,primary,accent:supplied[1]||mix(primary,'#ffffff',.3),gradFrom:palette.bg,gradTo:mix(palette.bg,primary,.18)}
}

/** Select once per post; an explicit editor choice always wins. */
export function choosePalette(id?: string, random = Math.random) {
  return id == null
    ? PALETTE_PICKS[Math.floor(random() * PALETTE_PICKS.length)]
    : PALETTE_PICKS.find(p => p.id === id)
}
