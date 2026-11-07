"use client";
import { useRef, useState } from "react";
export type Invitation = { id: string; realtor_name: string; recipient_email: string; order_reference: string; created_at: string; claim_by: string; claimed_at: string | null; revoked_at: string | null };
const inputClass = "mt-2 min-h-12 w-full rounded-xl border bg-background p-3";
const buttonClass = "min-h-12 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50";
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function change(body: unknown) {
 const response = await fetch("/api/admin/annual-gifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
 const data = await response.json();
 if (!response.ok) throw new RequestError(data.error ?? "Couldn’t confirm the change.", response.status);
 return data;
}
export function InvitationComposer({ enabled, onCreated }: { enabled: boolean; onCreated: () => Promise<void> }) {
 const [realtor, setRealtor] = useState(""), [email, setEmail] = useState(""), [order, setOrder] = useState(""), [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(""), [link, setLink] = useState(""), [copied, setCopied] = useState(false);
 const id = useRef<string | null>(null), lock = useRef(false);
 async function submit(event: React.FormEvent) {
  event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); id.current ??= crypto.randomUUID();
  try {
   const data = await change({ action: "invite", id: id.current, email: email.trim(), realtorName: realtor.trim(), order: order.trim(), consentConfirmed: consent });
   setLink(data.url); setUncertain(false);
   await onCreated().catch(() => setError("Invitation created. The list couldn’t refresh yet; keep this link."));
  } catch (e) {
   const knownFailure = e instanceof RequestError && [400, 401, 403].includes(e.status);
   setUncertain(!knownFailure); if (knownFailure) id.current = null;
   setError(e instanceof Error ? e.message : "Couldn’t confirm the invitation. Retry with the same details.");
  } finally { lock.current = false; setBusy(false); }
 }
 return <section className="space-y-4 rounded-2xl border bg-card p-5">
  <h2 className="text-xl font-semibold">Invite a client</h2><p className="text-sm text-muted-foreground">The link lasts 30 days. The 365-day gift begins when the client signs in with the invited, verified email. No payment is collected here.</p>
  {link ? <div className="space-y-4"><p role="status" className="font-semibold">Invitation ready for {email}</p><a href={link} className="block break-all rounded-xl bg-muted p-4 underline">{link}</a><div className="flex flex-wrap gap-3"><button className={buttonClass} onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true), () => setError("Select and copy the link above."))}>{copied ? "Link copied" : "Copy invitation link"}</button><button className="min-h-12 px-3 underline" disabled={busy} onClick={() => { id.current = null; setEmail(""); setOrder(""); setConsent(false); setLink(""); setCopied(false); setError(""); }}>Prepare another invitation</button></div><p className="text-sm text-muted-foreground">Share the link through your approved delivery process. No message has been sent automatically.</p></div> : <form onSubmit={e => void submit(e)} className="space-y-4">
   <fieldset disabled={busy || uncertain || !enabled} className="space-y-4">
    <label className="block text-sm font-medium">Realtor’s display name<input className={inputClass} value={realtor} minLength={2} maxLength={100} required onChange={e => setRealtor(e.target.value)}/></label>
    <label className="block text-sm font-medium">Client’s invited email<input type="email" autoComplete="off" className={inputClass} value={email} maxLength={254} required onChange={e => setEmail(e.target.value)}/></label>
    <label className="block text-sm font-medium">Approved order reference<input className={inputClass} value={order} minLength={3} maxLength={120} required onChange={e => setOrder(e.target.value)}/></label>
    <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0"/><span>The client agreed to receive this invitation. The approved order covers 365 days of Pro, with no automatic renewal or access to the client’s household information.</span></label>
   </fieldset>
   <button type="submit" className={buttonClass} disabled={busy || !enabled || !consent || realtor.trim().length < 2 || order.trim().length < 3 || !email.includes("@")}>{busy ? "Creating invitation…" : uncertain ? "Retry same invitation" : "Create invitation link"}</button>
  </form>}
  {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
 </section>;
}
export function InvitationList({ items, total, page, onPage, onChanged, busy, asOf }: { asOf: string; items: Invitation[]; total: number; page: number; onPage: (page: number) => void; onChanged: () => Promise<void>; busy: boolean }) {
 const [selected, setSelected] = useState<string | null>(null), [reason, setReason] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState("");
 const lock = useRef(false);
 async function cancel(id: string) {
  if (lock.current) return; lock.current = true; setSaving(true); setError("");
  try { await change({ action: "revoke_invitation", id, reason }); setSelected(null); setReason(""); await onChanged(); }
  catch (e) { setError(e instanceof Error ? e.message : "Couldn’t confirm cancellation. Refresh before retrying."); }
  finally { lock.current = false; setSaving(false); }
 }
 return <section className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Client invitations</h2><button disabled={busy || saving} className="min-h-11 underline" onClick={() => void onChanged().catch(() => setError("Invitations couldn’t refresh."))}>Refresh invitations</button></div>
  {error ? <p role="alert" className="rounded-xl border p-4 text-sm text-destructive">{error}</p> : null}
  {!items.length ? <p className="rounded-xl border p-5 text-muted-foreground">No invitations on this page.</p> : null}
  {items.map(item => {
   const status = item.revoked_at ? "Cancelled" : item.claimed_at ? "Claimed" : Date.parse(item.claim_by) <= Date.parse(asOf) ? "Expired" : "Awaiting client";
   return <article key={item.id} className="space-y-3 rounded-2xl border bg-card p-5">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="break-all font-semibold">{item.recipient_email}</h3><span className="text-sm font-semibold text-primary">{status}</span></div>
    <p className="text-sm text-muted-foreground">{item.realtor_name} · {item.order_reference}</p>
    <p className="text-sm">{item.claimed_at ? "Claimed " + new Date(item.claimed_at).toLocaleDateString() + ". See the fulfillment receipt for membership dates." : "Claim by " + new Date(item.claim_by).toLocaleString()}</p>
    {status === "Awaiting client" ? <div className="flex flex-wrap gap-4"><a className="min-h-11 py-2 text-sm underline" href={"/gift/" + item.id}>Open invitation</a><button disabled={saving || busy} className="min-h-11 text-sm underline" onClick={() => { setSelected(item.id); setReason(""); setError(""); }}>Cancel unused invitation</button></div> : null}
    {selected === item.id ? <div className="space-y-3 rounded-xl bg-muted p-4"><label className="block text-sm">Reason for cancellation<textarea className={inputClass} minLength={8} maxLength={500} value={reason} disabled={saving} onChange={e => setReason(e.target.value)}/></label><p className="text-sm">This disables the unused link. It cannot revoke a gift that has already been claimed, and does not refund a payment.</p><div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={saving || reason.trim().length < 8} onClick={() => void cancel(item.id)}>{saving ? "Cancelling…" : "Confirm cancellation"}</button><button className="min-h-11 px-3 underline" disabled={saving} onClick={() => setSelected(null)}>Keep invitation</button></div></div> : null}
   </article>;
  })}
  {total > 30 ? <div className="flex justify-between gap-3"><button className="min-h-11 underline disabled:opacity-50" disabled={busy || saving || page === 0} onClick={() => onPage(page - 1)}>Previous</button><span className="py-3 text-sm">Page {page + 1} of {Math.ceil(total / 30)}</span><button className="min-h-11 underline disabled:opacity-50" disabled={busy || saving || (page + 1) * 30 >= total} onClick={() => onPage(page + 1)}>Next</button></div> : null}
 </section>;
}
