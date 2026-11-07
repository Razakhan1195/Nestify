"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryLabels, roadmapCategories, roadmapStatuses, statusLabels, type RoadmapItem, type RoadmapList } from "@/lib/roadmap/model";

class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
 const controller = new AbortController();
 const cancel = () => controller.abort();
 init?.signal?.addEventListener("abort", cancel, { once: true });
 if (init?.signal?.aborted) controller.abort();
 const timer = setTimeout(() => controller.abort(), 15000);
 try {
  const response = await fetch(path, { ...init, signal: controller.signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error ?? "Please try again.", response.status);
  return data;
 } catch (error) {
  if (controller.signal.aborted && !init?.signal?.aborted) throw new Error("We couldn’t confirm the result. Please try again.");
  throw error;
 } finally { clearTimeout(timer); init?.signal?.removeEventListener("abort", cancel); }
}
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export function RoadmapBoard() {
 const [data, setData] = useState<RoadmapList | null>(null), [mine, setMine] = useState(false);
 const [status, setStatus] = useState("all"), [sort, setSort] = useState("top"), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);
 const [busy, setBusy] = useState(true), [error, setError] = useState(""), [voting, setVoting] = useState<string | null>(null), [showForm, setShowForm] = useState(false);
 const generation = useRef(0), voteLock = useRef(false);
 useEffect(() => { const value=search.trim(); if(value===query)return; const timer = setTimeout(() => { setBusy(true); setQuery(value); setPage(0); }, 300); return () => clearTimeout(timer); }, [search,query]);
 const load = useCallback(async (signal?: AbortSignal) => {
  const version = ++generation.current;
  try {
   const next = await request<RoadmapList>("/api/roadmap?" + new URLSearchParams({ mine: String(mine), status, sort, search: query, page: String(page) }), { signal });
   if (generation.current === version && !signal?.aborted) { setData(next); setError(""); }
  } catch (e) { if (generation.current === version && !signal?.aborted) { setData(null); setError(e instanceof Error ? e.message : "The roadmap couldn’t load."); } }
  finally { if (generation.current === version && !signal?.aborted) setBusy(false); }
 }, [mine, status, sort, query, page]);
 useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) return load(controller.signal); }); return () => { controller.abort(); }; }, [load]);
 async function vote(item: RoadmapItem, value: -1 | 1) {
  if (voteLock.current) return; voteLock.current = true; setVoting(item.id); setError("");
  const version = generation.current;
  try {
   const next = await request<Pick<RoadmapItem, "id" | "myVote" | "upvotes" | "downvotes" | "score">>("/api/roadmap", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, value: item.myVote === value ? 0 : value }) });
   if (generation.current === version) setData(old => old ? { ...old, items: old.items.map(x => x.id === item.id ? { ...x, ...next } : x) } : old);
  } catch (e) { if (generation.current === version) setError(e instanceof Error ? e.message : "Your vote couldn’t be saved."); }
  finally { voteLock.current = false; setVoting(null); }
 }
 return <section className="min-w-0 space-y-5" aria-label="Customer roadmap">
  <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1 rounded-xl bg-muted p-1">{[[false, "Roadmap"], [true, "Your ideas"]].map(([value, label]) => <button key={String(value)} aria-pressed={mine === value} className={"min-h-11 rounded-lg px-4 text-sm font-semibold " + (mine === value ? "bg-background shadow-sm" : "text-muted-foreground")} onClick={() => { if(mine===value)return; setBusy(true); setMine(Boolean(value)); setPage(0); }}>{label}</button>)}</div><Button onClick={() => setShowForm(true)}><Plus size={16}/> Share an idea</Button></div>
  {showForm ? <SuggestionForm onClose={() => setShowForm(false)} onSent={() => { setShowForm(false); setMine(true); setStatus("all"); setSearch(""); setQuery(""); setPage(0); void load(); }}/> : null}
  <div className="flex flex-wrap gap-3"><label className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border bg-card px-3"><Search size={18} aria-hidden/><span className="sr-only">Search ideas</span><input className="min-h-12 min-w-0 flex-1 bg-transparent outline-none" value={search} maxLength={120} placeholder="Search before suggesting…" onChange={e => setSearch(e.target.value)}/></label><label className="sr-only" htmlFor="roadmap-sort">Sort ideas</label><select id="roadmap-sort" className="min-h-12 rounded-xl border bg-card px-3" value={sort} onChange={e => { setBusy(true); setSort(e.target.value); setPage(0); }}><option value="top">Most supported</option><option value="newest">Newest</option></select></div>
  <div className="flex flex-wrap gap-2" aria-label="Filter by status">{["all", ...roadmapStatuses].map(s => <button key={s} aria-pressed={status === s} className={"min-h-11 rounded-full border px-4 text-sm " + (status === s ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card text-muted-foreground")} onClick={() => { if(status===s)return; setBusy(true); setStatus(s); setPage(0); }}>{s === "all" ? "All ideas" : statusLabels[s]}</button>)}</div>
  {error ? <div role="alert" className="space-y-3 rounded-2xl border p-5"><p>{error}</p>{error.startsWith("Sign in") ? <Link className="font-semibold text-primary underline" href="/login?next=%2Froadmap">Sign in to Rezlee</Link> : <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void load(); }}>Try again</Button>}</div> : null}
  {busy ? <p role="status" className="py-10 text-center text-muted-foreground">Loading ideas…</p> : !data?.items.length && !error ? <div className="space-y-2 rounded-2xl border border-dashed p-8 text-center"><h2 className="text-lg font-semibold">{query || status !== "all" ? "No ideas match these filters" : mine ? "Your next idea starts here" : "Help set the direction"}</h2><p className="text-sm text-muted-foreground">{query || status !== "all" ? "Try another search or choose All ideas." : mine ? "Share a suggestion to see its response and progress here." : "Share an idea. Reviewed suggestions will appear here for everyone to vote on."}</p></div> : null}
  {!busy ? data?.items.map(item => <article key={item.id} className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
   <div className="flex flex-wrap items-center gap-2 text-xs font-semibold"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">{statusLabels[item.status]}</span>{item.priority !== "none" ? <span className="rounded-full bg-muted px-3 py-1.5">{item.priority === "next" ? "Up next" : "Later"}</span> : null}<span className="text-muted-foreground">{categoryLabels[item.category]}</span></div>
   <div className="space-y-2"><h2 className="break-words text-xl font-semibold leading-snug">{item.title}</h2><p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{item.description}</p></div>
   {item.response ? <div className="space-y-2 rounded-xl bg-muted/60 p-4"><p className="text-sm font-semibold">From the Rezlee team · {date(item.updatedAt)}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.response}</p></div> : null}
   {item.mine && !item.decidedAt ? <p className="text-sm text-muted-foreground">{item.visibility === "pending" ? "Only you and the team can see this while we check it for the public roadmap. " : ""}{Date.parse(item.responseDueAt) < Date.parse(data.generatedAt) ? "Our response is overdue. Your idea remains in the team’s review queue." : "Our decision is due by " + date(item.responseDueAt) + "."}</p> : null}
   {item.visibility === "hidden" ? <p className="text-sm text-muted-foreground">Visible only to you and the team.</p> : item.visibility === "public" ? <div className="flex flex-wrap items-center gap-3 border-t pt-4">{([1, -1] as const).map(value => <button key={value} disabled={!!voting || busy} aria-pressed={item.myVote === value} aria-label={(value === 1 ? "Upvote " : "Downvote ") + item.title + (item.myVote === value ? ". Selected; press to remove." : "")} onClick={() => void vote(item, value)} className={"flex min-h-11 items-center gap-2 rounded-xl border px-3 disabled:opacity-50 " + (item.myVote === value ? "border-primary bg-primary/10 text-primary" : "")}>{value === 1 ? <ArrowUp size={18}/> : <ArrowDown size={18}/>}<span>{value === 1 ? item.upvotes : item.downvotes}</span></button>)}<span className="text-xs text-muted-foreground">{voting === item.id ? "Saving vote…" : "One vote per account. Tap again to remove."}</span></div> : null}
  </article>) : null}
  {data && data.total > 30 ? <div className="flex items-center justify-between gap-4"><Button variant="outline" disabled={busy || page === 0} onClick={() => { setBusy(true); setPage(p => p - 1); }}>Previous</Button><span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / 30)}</span><Button variant="outline" disabled={busy || (page + 1) * 30 >= data.total} onClick={() => { setBusy(true); setPage(p => p + 1); }}>Next</Button></div> : null}
 </section>;
}
function SuggestionForm({ onSent, onClose }: { onSent: () => void; onClose: () => void }) {
 const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [category, setCategory] = useState("other"), [share, setShare] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false);
 const id = useRef<string | null>(null), lock = useRef(false);
 useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (title || description) event.preventDefault(); }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [title, description]);
 async function send(event: React.FormEvent) {
  event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); id.current ??= crypto.randomUUID();
  try { await request("/api/roadmap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id.current, title, description, category, sharePublicly: share }) }); onSent(); }
  catch (e) { const message = e instanceof Error ? e.message : "Couldn’t confirm the send. Retry the same idea."; setError(message); const knownFailure=e instanceof RequestError && [400,401,403,422,429].includes(e.status); setUncertain(!knownFailure); if(knownFailure)id.current=null; }
  finally { lock.current = false; setBusy(false); }
 }
 return <form onSubmit={e => void send(e)} className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5">
  <h2 className="text-xl font-semibold">What would make home life easier?</h2><p className="text-sm text-muted-foreground">Describe the problem and what a useful result would look like. We’ll reply here within seven days.</p>
  <fieldset disabled={busy || uncertain} className="space-y-4">
   <label className="block space-y-2"><span className="text-sm font-semibold">A short title</span><input required minLength={6} maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className="min-h-12 w-full rounded-xl border bg-background px-3" placeholder="What would you like to do?"/></label>
   <label className="block space-y-2"><span className="text-sm font-semibold">Tell us more</span><textarea required minLength={20} maxLength={2000} rows={4} value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border bg-background p-3"/></label>
   <label className="block space-y-2"><span className="text-sm font-semibold">Topic</span><select aria-label="Topic" className="min-h-12 w-full rounded-xl border bg-background px-3" value={category} onChange={e => setCategory(e.target.value)}>{roadmapCategories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
   <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" required checked={share} onChange={e => setShare(e.target.checked)} className="mt-1 size-5 shrink-0"/><span>I’m happy for this idea to appear publicly after review. I’ve left out names, email addresses, account numbers and private home details.</span></label>
  </fieldset>
  {error ? <p role="alert" className="text-sm text-destructive">{error} {error.startsWith("Sign in") ? <Link href="/login?next=%2Froadmap" className="underline">Sign in</Link> : null}</p> : null}
  <div className="flex flex-wrap gap-3"><Button disabled={busy || !share || title.trim().length < 6 || description.trim().length < 20} type="submit">{busy ? "Sending…" : uncertain ? "Retry same idea" : "Share idea"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { if ((!title && !description) || window.confirm("Leave this idea? Text that has not been sent will be lost.")) onClose(); }}>Cancel</Button></div>
 </form>;
}
