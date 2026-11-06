"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {torontoDate} from "@/lib/feedback/deadline";
export type Followup={owner_name:string;decision:string;response_channel:string;responded_at:string|null;revision:number};
export function FollowupForm({id,dueDate,value,onSaved}:{id:string;dueDate:string;value:Followup|null;onSaved:()=>Promise<void>}){
 const [owner,setOwner]=useState(value?.owner_name??"Raza"),[decision,setDecision]=useState(value?.decision??""),[channel,setChannel]=useState(value?.response_channel??""),[sent,setSent]=useState(Boolean(value?.responded_at)),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function save(){setBusy(true);setError(null);try{
  const r=await fetch("/api/admin/feedback/followup",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,revision:value?.revision??0,owner,decision,channel,respondedAt:sent?(value?.responded_at??new Date().toISOString()):null})});
  const data=await r.json();if(!r.ok)throw Error(data.error);await onSaved();
 }catch(e){setError(e instanceof Error?e.message:"Couldn’t save follow-up.");}finally{setBusy(false);}}
 const overdue=!value?.responded_at&&dueDate<torontoDate();
 return <fieldset disabled={busy} className="space-y-3 border-t pt-4"><legend className="font-semibold">Internal follow-up</legend>
 <p className={overdue?"font-semibold text-destructive":"text-sm"}>{overdue?"Overdue · ":""}Response target: {dueDate}, end of day Toronto time.{value?.responded_at?" Response recorded.":""}</p>
 <p className="text-xs text-muted-foreground">Target is three weekdays after receipt; holidays make this an earlier internal deadline. Saving here does not send a reply.</p>
 <label className="block text-sm">Assigned owner<input className="mt-1 block w-full rounded-lg border p-3" value={owner} maxLength={120} onChange={e=>setOwner(e.target.value)}/></label>
 <label className="block text-sm">Decision or explanation<textarea className="mt-1 block min-h-28 w-full rounded-lg border p-3" value={decision} maxLength={3000} onChange={e=>setDecision(e.target.value)} placeholder="What we decided, why, and the next step or information needed."/></label>
 <label className="block text-sm">Response channel<select className="ml-2 rounded-lg border p-3" value={channel} onChange={e=>setChannel(e.target.value)}>{[["","Not sent"],["email","Email"],["in_app","In app"],["phone","Phone"],["other","Other"]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={sent} onChange={e=>setSent(e.target.checked)}/>I have actually responded to this customer.</label>
 {error?<p role="alert" className="text-destructive">{error}</p>:null}
 <Button variant="outline" disabled={busy||!owner.trim()||(sent&&(!decision.trim()||!channel))} onClick={()=>void save()}>{busy?"Saving…":"Save follow-up"}</Button>
 </fieldset>;
}
