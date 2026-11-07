"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { categoryLabels, roadmapStatuses, statusLabels } from "@/lib/roadmap/model";
type Item = { safetyReports?: string[]; id: string; title: string; description: string; category: string; visibility: string; status: string; priority: string; response: string; decided_at: string | null; created_at: string; updated_at: string; revision: number; responseDueAt: string };
export function RoadmapQueue() {
 const [items, setItems] = useState<Item[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0), [view, setView] = useState("pending");
 const [now, setNow] = useState(0);
 const [busy, setBusy] = useState(true), [error, setError] = useState(""), [saving, setSaving] = useState(false);
 const load = useCallback(async (signal?: AbortSignal) => {
  try {
   const response = await fetch("/api/admin/roadmap?" + new URLSearchParams({ view, page: String(page) }), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), cache: "no-store" });
   const data = await response.json(); if (!response.ok) throw new Error(data.error);
   if (!signal?.aborted) { setNow(Date.now()); setItems(data.items); setTotal(data.total); setError(""); }
  } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Queue unavailable."); }
  finally { if (!signal?.aborted) setBusy(false); }
 }, [view, page]);
 useEffect(() => { const c = new AbortController(); void Promise.resolve().then(() => { if (!c.signal.aborted) return load(c.signal); }); return () => c.abort(); }, [load]);
 return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
  <Link href="/admin" className="text-sm font-semibold text-primary underline">← Daily operations</Link>
  <header className="space-y-2"><h1 className="text-3xl font-semibold">Customer roadmap</h1><p className="text-muted-foreground">A decision and response are due within seven calendar days of each idea. Oldest unanswered ideas come first. Updates appear in the app. Review safety reports daily; hide harmful content immediately. Saving a decision resolves the current reports. No email is sent.</p></header>
  <div className="flex flex-wrap items-center gap-3"><label>Show <select disabled={busy || saving} className="ml-2 min-h-11 rounded-lg border bg-background px-3" value={view} onChange={e => { setBusy(true); setView(e.target.value); setPage(0); }}><option value="pending">Needs a decision</option><option value="reported">Safety reports</option><option value="all">All ideas</option></select></label><Button variant="outline" disabled={busy || saving} onClick={() => { setBusy(true); void load(); }}>Refresh</Button><span className="text-sm">{busy ? "Checking…" : error ? "Queue unavailable" : total + " ideas"}</span><Link href="/roadmap" className="text-sm font-semibold text-primary underline">View public roadmap</Link></div>
  {error ? <p role="alert" className="rounded-xl border p-4">{error} Previously loaded ideas may be out of date.</p> : null}
  {!busy && !error && !items.length ? <p className="rounded-2xl border p-8">No ideas need a decision in this view.</p> : null}
  {items.map(item => <Review key={item.id + ":" + item.revision} item={item} now={now} disabled={busy || !!error || saving} onSaving={setSaving} onSaved={() => load()}/>)}
  <div className="flex justify-between"><Button variant="outline" disabled={busy || saving || page === 0} onClick={() => { setBusy(true); setPage(p => p - 1); }}>Previous</Button><Button variant="outline" disabled={busy || saving || (page + 1) * 30 >= total} onClick={() => { setBusy(true); setPage(p => p + 1); }}>Next</Button></div>
 </main>;
}
function Review({ item, now, disabled, onSaving, onSaved }: { item: Item; now: number; disabled: boolean; onSaving: (value: boolean) => void; onSaved: () => Promise<void> }) {
 const [visibility, setVisibility] = useState(item.visibility), [status, setStatus] = useState(item.status), [priority, setPriority] = useState(item.priority), [response, setResponse] = useState(item.response);
 const [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const due = new Date(item.responseDueAt), overdue = !item.decided_at && due.getTime() < now;
 async function save(event: React.FormEvent) {
  event.preventDefault(); if (busy || disabled) return; setBusy(true); onSaving(true); setError("");
  try {
   const result = await fetch("/api/admin/roadmap", { method: "PATCH", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, revision: item.revision, visibility, status, priority, response }) });
   const data = await result.json(); if (!result.ok) throw new Error(data.error);
   await onSaved();
  } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t save the decision."); }
  finally { setBusy(false); onSaving(false); }
 }
 return <article className="space-y-4 rounded-2xl border bg-card p-5">
  <header className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">{categoryLabels[item.category]} · Received {new Date(item.created_at).toLocaleString()}</p><h2 className="break-words text-xl font-semibold">{item.title}</h2><p className={"text-sm font-semibold " + (overdue ? "text-destructive" : "text-primary")}>{item.decided_at ? "Decision recorded " + new Date(item.decided_at).toLocaleString() : (overdue ? "Overdue · " : "Decision due · ") + due.toLocaleString()}</p></header>
  <p className="whitespace-pre-wrap break-words leading-relaxed">{item.description}</p>{item.safetyReports?.length ? <p role="status" className="rounded-lg border border-destructive p-3 text-sm">Open safety reports: {item.safetyReports.length}. Reasons: {[...new Set(item.safetyReports)].join(", ")}. Review the content and record a moderation decision.</p> : null}
  <form onSubmit={e => void save(e)} className="space-y-4 border-t pt-4">
   <fieldset disabled={disabled || busy} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
     <label className="space-y-2 text-sm"><span className="block font-semibold">Visibility</span><select aria-label="Visibility" className="min-h-12 w-full rounded-lg border bg-background px-3" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="pending">Pending review</option><option value="public">Public roadmap</option><option value="hidden">Private to customer</option></select></label>
     <label className="space-y-2 text-sm"><span className="block font-semibold">Decision</span><select aria-label="Decision" className="min-h-12 w-full rounded-lg border bg-background px-3" value={status} onChange={e => { setStatus(e.target.value); if(e.target.value!=="planned")setPriority("none"); }}>{roadmapStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
     <label className="space-y-2 text-sm"><span className="block font-semibold">Priority</span><select disabled={status!=="planned"} aria-label="Priority" className="min-h-12 w-full rounded-lg border bg-background px-3" value={priority} onChange={e => setPriority(e.target.value)}><option value="none">Not scheduled</option><option value="next">Up next</option><option value="later">Later</option></select></label>
    </div>
    <label className="block space-y-2"><span className="text-sm font-semibold">Reply to the customer</span><textarea rows={4} maxLength={2000} value={response} onChange={e => setResponse(e.target.value)} className="w-full rounded-xl border bg-background p-3" placeholder="Explain the decision, its priority, and the reason in plain language."/></label>
    <p className="text-sm text-muted-foreground">This reply is visible to the customer, and to everyone if the idea is public. Check for personal information before publishing. “Under review” does not complete the seven-day commitment.</p>
    <Button type="submit" disabled={(status !== "under_review" || visibility === "hidden") && response.trim().length < 10 || status === "planned" && priority === "none"}>{busy ? "Saving…" : visibility === "public" ? "Save to public roadmap" : "Save decision"}</Button>
   </fieldset>
   {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </form>
 </article>;
}
