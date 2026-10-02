'use client'

const choices=[['cutout','AI cutout','A subject with its background removed.'],['background','Background photo','A full photo with text over a dark gradient.'],['none','No images','Typography and decorative shapes only.']]

export default function ImageDispositionPicker({value='cutout',onChange,disabled=false}){
  return <div role="group" aria-label="Image style" className="grid grid-cols-2 lg:grid-cols-3 gap-3">
    {choices.map(([id,label,description])=><button type="button" key={id} disabled={disabled} aria-pressed={value===id} onClick={()=>onChange(id)} className={`text-left rounded-xl border-2 p-3 disabled:opacity-50 ${value===id?'border-primary bg-primary/5':'border-border'}`}>
      <svg viewBox="0 0 200 180" aria-hidden="true" className="w-full rounded-lg mb-2">
        <rect width="200" height="180" fill="#e5edda"/>
        {id==='background'?<><rect width="200" height="180" fill="#7093a0"/><path d="M0 120L70 30 130 105 170 60 200 110V180H0Z" fill="#385847"/><path d="M0 110H200V180H0Z" fill="#102118" opacity=".85"/><path d="M18 133H155M18 147H130" stroke="white" strokeWidth="8"/></>:<>
          <path d="M16 24H148M16 39H112" stroke="#203522" strokeWidth="8"/>
          <path d="M16 63H80M16 73H72M16 83H77" stroke="#49604a" strokeWidth="3"/>
          {id==='cutout'&&<><circle cx="140" cy="87" r="19" fill="#ad744f"/><path d="M101 180V132Q101 108 140 108Q179 108 179 132V180" fill="#477049"/><path d="M102 146H174L166 173H110Z" fill="#263d34"/></>}
          {id==='none'&&<><path d="M16 105H162M16 120H152M16 135H138" stroke="#49604a" strokeWidth="5"/><circle cx="188" cy="176" r="36" fill="none" stroke="#88a574" strokeWidth="3"/></>}
        </>}
      </svg>
      <span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground mt-1">{description}</span>
    </button>)}
  </div>
}
