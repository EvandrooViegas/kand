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

/** Select once per post; an explicit editor choice always wins. */
export function choosePalette(id?: string, random = Math.random) {
  return id == null
    ? PALETTE_PICKS[Math.floor(random() * PALETTE_PICKS.length)]
    : PALETTE_PICKS.find(p => p.id === id)
}
