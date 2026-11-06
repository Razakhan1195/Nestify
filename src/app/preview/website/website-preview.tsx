"use client";
import { useState } from "react";
export function WebsitePreview() {
 const [width,setWidth]=useState(390);
 return <main className="min-h-screen bg-stone-200 px-3 py-5 text-stone-900">
  <div className="mx-auto mb-5 max-w-5xl"><h1 className="text-xl font-semibold">Website review</h1><p className="mt-2 text-sm">Staging only. These widths render the actual website in a frame; they do not simulate a native phone or mobile browser.</p>
   <div className="mt-4 flex flex-wrap gap-2" aria-label="Preview width">{[360,390,768,1280].map(size=><button key={size} type="button" aria-pressed={width===size} onClick={()=>setWidth(size)} className={`min-h-11 rounded-lg border px-4 text-sm ${width===size?"bg-emerald-950 text-white":"bg-white"}`}>{size}px</button>)}</div>
  </div>
  <div className="mx-auto max-w-full overflow-x-auto pb-4"><iframe title={`Rezlee website at ${width}px`} src="/" style={{width,height:820,border:0,display:"block",margin:"0 auto",background:"#f6f5ef"}} /></div>
 </main>;
}
