'use client'
import {ArrowUp,ArrowDown} from 'lucide-react'
export default function ColorPriority({index,count,onMove}) {
 const role=index===0?'Primary':index===1?'Secondary':'Accent '+(index-1)
 return <div className="flex items-center gap-1 shrink-0"><span className="text-[10px] text-muted-foreground w-14">{role}</span><button type="button" aria-label={'Increase importance of color '+(index+1)} title="Move up" disabled={index===0} onClick={()=>onMove(index,index-1)} className="p-1 rounded hover:bg-muted disabled:opacity-25"><ArrowUp size={13}/></button><button type="button" aria-label={'Decrease importance of color '+(index+1)} title="Move down" disabled={index===count-1} onClick={()=>onMove(index,index+1)} className="p-1 rounded hover:bg-muted disabled:opacity-25"><ArrowDown size={13}/></button></div>
}
export function reorderColors(colors,from,to) {
 if(from<0||to<0||from>=colors.length||to>=colors.length)return colors
 const result=[...colors]
 const [color]=result.splice(from,1)
 result.splice(to,0,color)
 return result
}
