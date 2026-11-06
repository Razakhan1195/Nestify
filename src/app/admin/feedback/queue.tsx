"use client";
import { useCallback,useEffect,useState } from "react";
import {FollowupForm,type Followup} from "./followup";
import { Button } from "@/components/ui/button";
type Item={id:string;user_id:string;kind:string;message:string;status:string;created_at:string;updated_at:string;due_date:string;followup:Followup|null};
const statuses=["new","reviewing","planned","resolved","closed"];
export function FeedbackQueue(){
 const [items,setItems]=useState<Item[]>([]),[page,setPage]=useState(0),[total,setTotal]=useState(0),[filter,setFilter]=useState("open"),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(true),[saving,setSaving]=useState<string|null>(null);
 const load=useCallback((signal?:AbortSignal)=>fetch(`/api/admin/feedback?page=${page}&status=${filter}`,{cache:"no-store",signal})
  .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(!signal?.aborted){setItems(data.items);setTotal(data.total);setError(null);}})
  .catch(e=>{if(!signal?.aborted)setError(e instanceof Error?e.message:"Couldn’t load feedback.");})
  .finally(()=>{if(!signal?.aborted)setBusy(false);}),[page,filter]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]);
 async function update(item:Item,status:string){setSaving(item.id);setError(null);try{const r=await fetch("/api/admin/feedback",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,status,version:item.updated_at})});const data=await r.json();if(!r.ok)throw Error(data.error);await load();}catch(e){setError(e instanceof Error?e.message:"Couldn’t save status.");}finally{setSaving(null);}}
 return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8"><a href="/admin" className="text-sm font-semibold text-primary underline">← Daily operations</a><header><h1 className="text-3xl font-semibold">Customer feedback</h1><p className="mt-2 text-muted-foreground">Problems to resolve and ideas to evaluate. Status is visible to the customer. No email is sent.</p></header>
 <div className="flex flex-wrap items-center gap-4"><label>Show <select className="ml-2 rounded-lg border p-3" value={filter} onChange={e=>{setBusy(true);setFilter(e.target.value);setPage(0);}} disabled={busy||!!saving}>{["open","all",...statuses].map(s=><option key={s}>{s}</option>)}</select></label><Button variant="outline" disabled={busy||!!saving} onClick={()=>{setBusy(true);void load();}}>{busy?"Loading…":"Refresh"}</Button><span>{busy?"Checking feedback…":error?"Queue unavailable":total+" messages"}</span></div>
 {error?<p role="alert" className="rounded-xl border border-destructive p-4">{error} Previously loaded messages may be out of date.</p>:null}
 {!busy&&!error&&!items.length?<p className="rounded-2xl border p-8">No feedback in this view.</p>:null}
 {items.map(item=><article key={item.id} className="space-y-4 rounded-2xl border bg-card p-5"><header className="flex flex-wrap justify-between gap-3"><strong>{item.kind==="problem"?"Problem reported":item.kind==="idea"?"Feature idea":"Feedback"}</strong><time className="text-sm text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time></header><p className="whitespace-pre-wrap break-words">{item.message}</p><div className="text-xs text-muted-foreground"><p>Customer reference: <code className="select-all">{item.user_id}</code></p><p>Submission: <code className="select-all">{item.id}</code></p></div><label className="block text-sm">Review status <select className="ml-2 rounded-lg border p-3" value={item.status} disabled={!!saving||busy||!!error} onChange={e=>void update(item,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select>{saving===item.id?" Saving…":null}</label><FollowupForm key={item.id+":"+(item.followup?.revision??0)} id={item.id} dueDate={item.due_date} value={item.followup} onSaved={()=>load()}/></article>)}
 <div className="flex gap-3"><Button variant="outline" disabled={page===0||busy||!!saving} onClick={()=>{setBusy(true);setPage(p=>p-1);}}>Previous</Button><Button variant="outline" disabled={(page+1)*30>=total||busy||!!saving} onClick={()=>{setBusy(true);setPage(p=>p+1);}}>Next</Button></div></main>;
}
