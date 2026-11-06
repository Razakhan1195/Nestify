"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
type Gift={id:string;order_reference:string;user_id:string|null;started_at:string;expires_at:string;revoked_at:string|null};
type Snapshot={generatedAt:string;enabled:boolean;gifts:Gift[];more:boolean};
const input="mt-2 min-h-11 w-full rounded-xl border bg-background p-3";
const button="min-h-11 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50";
async function request(body?:unknown){const r=await fetch("/api/admin/annual-gifts",{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.error??"Request unavailable.");return data;}
export function GiftWorkspace(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [userId,setUserId]=useState(""),[order,setOrder]=useState(""),[allocation,setAllocation]=useState(""),[reason,setReason]=useState(""),[consent,setConsent]=useState(false),[eligible,setEligible]=useState<boolean|null>(null),[receipt,setReceipt]=useState<Gift|null>(null);
 const [inviteEmail,setInviteEmail]=useState(""),[realtorName,setRealtorName]=useState(""),[inviteId,setInviteId]=useState(""),[inviteLink,setInviteLink]=useState("");
 const lock=useRef(false);
 const load=useCallback(async()=>{setData(await request());},[]);
 useEffect(()=>{let active=true;void request().then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function act(action:"check"|"fulfill"|"revoke",id?:string){if(lock.current)return;lock.current=true;setBusy(true);setError("");setReceipt(null);try{
 const result=await request(action==="check"?{action,userId}:action==="fulfill"?{action,userId,id:allocation,order,reason,consentConfirmed:consent}:{action,id,reason});
 if(action==="check")setEligible(result.eligible);else{setReceipt(result.receipt);await load();setEligible(null);}
 }catch(e){setError(e instanceof Error?e.message:"Unable to confirm. Keep the same allocation ID when retrying.");}finally{lock.current=false;setBusy(false);}}
 async function invite(){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{const id=inviteId||crypto.randomUUID();setInviteId(id);const result=await request({action:"invite",id,email:inviteEmail,realtorName,order,consentConfirmed:consent});setInviteLink(result.url);}catch(e){setError(e instanceof Error?e.message:"Could not create invitation. Retry with the same reference.");}finally{lock.current=false;setBusy(false);}}
 return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
 <Link href="/admin/support" className="underline">← Support workspace</Link>
 <header><p className="mt-5 text-xs font-semibold tracking-widest">REZLEE · PARTNER GIFTS</p><h1 className="mt-2 text-3xl font-semibold">A useful first year at home.</h1><p className="mt-3 text-muted-foreground">Owner-operated fulfillment. Confirm the recipient, preserve existing access, and record the exact start and end dates.</p></header>
 {error&&<p role="alert" className="rounded-xl border border-destructive p-4">{error}</p>}
 {!data?<p role="status">Loading gift records…</p>:<>
 {!data.enabled&&<p className="rounded-xl border p-4">New gifts are disabled. Commercial terms and channel approval must be recorded before enabling fulfillment. Do not accept payment.</p>}
 <section className="space-y-4 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Invite a client</h2><p>Use the approved order reference and consent confirmation below. The invitation lasts 30 days; the year starts only when the verified recipient claims it.</p>
 <label className="block">Realtor’s display name<input className={input} disabled={busy||Boolean(inviteId)} value={realtorName} onChange={e=>setRealtorName(e.target.value)}/></label>
 <label className="block">Recipient email<input type="email" className={input} disabled={busy||Boolean(inviteId)} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label>
 <button className={button} disabled={busy||!data.enabled||!consent||order.trim().length<3||!inviteEmail||realtorName.trim().length<2} onClick={()=>void invite()}>Create invitation link</button>
 {inviteLink&&<><p className="break-all rounded-xl bg-muted p-4">{inviteLink}</p><p>Share this link with the invited client through your approved delivery process. No message has been sent automatically.</p><button className="min-h-11 underline" disabled={busy} onClick={()=>{setInviteId("");setInviteLink("");setInviteEmail("");}}>Prepare another invitation</button></>}
 </section>
 <section className="space-y-4 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Fulfill one approved gift</h2>
 <p className="text-sm">Use the customer reference from Support. The recipient must have requested activation and verified their account. Already-Pro accounts, including founding members and household beneficiaries, are ineligible. Eligibility checking activates any existing founder entitlement.</p>
 <label className="block">Recipient account reference<input className={input} value={userId} disabled={busy} onChange={e=>{setUserId(e.target.value);setEligible(null);setAllocation("");}}/></label>
 <button className={button} disabled={busy||!userId} onClick={()=>void act("check")}>Check eligibility</button>
 {eligible!==null&&<p role="status">{eligible?"Eligible at this check. Eligibility is checked again when granting access.":"Not eligible: this account already has Pro. Do not invoice for an annual gift."}</p>}
 <label className="block">Approved order reference<input className={input} value={order} maxLength={120} disabled={busy} onChange={e=>setOrder(e.target.value)}/></label>
 <label className="block">Allocation UUID<input className={input} value={allocation} disabled={busy} onChange={e=>setAllocation(e.target.value)}/></label>
 <button className="min-h-11 underline" disabled={busy||Boolean(allocation)} onClick={()=>setAllocation(crypto.randomUUID())}>Create allocation reference</button>
 <p className="text-sm">Copy this reference into the order before granting. Reuse it after a lost response; do not create another allocation to retry.</p>
 <label className="block">Reason and recipient-consent case reference<textarea className={input} value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
 <label className="flex items-start gap-3"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} className="mt-1 size-5"/><span>The recipient requested activation; the approved order covers 365 days, with no automatic renewal. No private household information is shared with the realtor.</span></label>
 <button className={button} disabled={busy||!data.enabled||eligible===false||!allocation||!consent||reason.trim().length<8} onClick={()=>void act("fulfill")}>Grant 365 days of Pro</button>
 <p className="text-sm">This does not collect payment or send an email. Invoice only after a successful receipt. Record delivery and recipient confirmation separately.</p>
 </section>
 {receipt&&<section role="status" className="rounded-2xl border p-5"><h2 className="font-semibold">{receipt.revoked_at?"Gift revoked":"Gift receipt"}</h2><p className="break-all">Allocation: {receipt.id}</p><p>Starts: {receipt.started_at}</p><p>Ends: {receipt.expires_at}</p><p>No automatic renewal. Revoking access does not process a monetary refund.</p></section>}
 <section className="space-y-3"><h2 className="text-xl font-semibold">Recent fulfillment records</h2><button className="min-h-11 underline" disabled={busy} onClick={()=>void load().catch(()=>setError("Could not refresh gift records."))}>Refresh receipts</button>
 {data.gifts.map(g=><article key={g.id} className="space-y-2 rounded-xl border p-4"><p className="font-semibold">{g.order_reference}</p><p className="break-all text-sm">{g.id}</p><p className="break-all text-sm">Recipient: {g.user_id??"Deleted account"}</p><p className="text-sm">{g.revoked_at?"Revoked":Date.parse(g.expires_at)<=Date.parse(data.generatedAt)?"Expired":"Granted"} · ends {g.expires_at}</p>{!g.revoked_at&&<button className="min-h-11 underline" disabled={busy||reason.trim().length<8} onClick={()=>{if(window.confirm("Revoke only this gift? This does not refund payment. Record the approved reason above first."))void act("revoke",g.id);}}>Revoke this gift</button>}</article>)}
 {data.more&&<p>Showing the latest 100 records. Reconcile older orders through the private operations ledger.</p>}
 </section></>}
 </main>;
}
