/** Local vector placeholders: no network, generated copy or brand assets. */
export function MockImage({x=0,y=0,width=600,height=600,palette,cutout=false,drawing=false,uid='mock'}) {
 return <svg x={x} y={y} width={width} height={height} viewBox="0 0 600 600" preserveAspectRatio={cutout?'xMidYMax meet':'xMidYMid slice'} aria-label="Mock subject image">
  <defs><linearGradient id={uid+'fabric'} x2="1" y2="1"><stop stopColor={palette.accent}/><stop offset="1" stopColor={palette.shade}/></linearGradient></defs>
  {!cutout&&<><rect width="600" height="600" fill={palette.surface}/><circle cx="430" cy="190" r="180" fill={palette.accent} opacity=".18"/><path d="M0 430L210 220 600 460V600H0Z" fill={palette.primary} opacity=".12"/></>}
  <g fill={drawing?'none':'url(#'+uid+'fabric)'} stroke={drawing?palette.text:palette.shade} strokeWidth={drawing?5:2}>
   <path d="M155 600L172 360Q175 290 248 276L351 276Q425 295 435 360L465 600Z"/>
   <path d="M267 235V283Q300 310 333 283V235Z" fill={drawing?'none':palette.highlight}/>
   <ellipse cx="300" cy="185" rx="76" ry="94" fill={drawing?'none':palette.highlight}/>
   <path d="M225 179Q205 73 297 72Q380 70 375 170L347 132Q280 158 240 131Z" fill={drawing?'none':palette.shade}/>
   <path d="M195 354Q188 425 278 453L352 469 370 440 280 410 238 349Z" fill={drawing?'none':palette.accent}/>
   <rect x="282" y="354" width="180" height="128" rx="12" transform="rotate(-12 370 418)" fill={drawing?'none':palette.shade}/>
   <rect x="302" y="372" width="140" height="84" rx="4" transform="rotate(-12 370 418)" fill={drawing?'none':palette.surface}/>
  </g>
 </svg>
}
export function MockLogo({palette}) {
 return <g aria-label="Mock brand logo"><path d="M0 0H24L12 42H-12Z M32 0H56L44 42H20Z" fill={palette.accent}/><text x="66" y="31" fontFamily="Arial,sans-serif" fontSize="30" fontWeight="700" fill={palette.text}>BRAND</text></g>
}
