import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { telecomProviders, telecomTaskSpecs, telecomVersion } from "../src/lib/deck/telecom-spec";
const apply = process.argv.includes("--apply");
const base = (process.env.DECK_BASE_URL || "https://api.deck.co/v2").replace(/\/$/, "");
if (!process.env.DECK_API_KEY) throw Error("DECK_API_KEY is required.");
type Item = { id: string; name: string; agent_id?: string; status?: string; website?: { url?: string } };
async function api<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${process.env.DECK_API_KEY}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": `rezlee-${createHash("sha256").update(key).digest("hex").slice(0, 48)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!r.ok) throw Error(`Deck ${r.status} at ${path}`);
  return r.json() as Promise<T>;
}
async function list(path: string) {
  const all: Item[] = []; let cursor: string | undefined;
  do { const page = await api<{ data: Item[]; has_more?: boolean; next_cursor?: string }>(`${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`); all.push(...page.data); cursor = page.has_more ? page.next_cursor : undefined; } while (cursor);
  return all;
}
async function main() {
  const agents = await list("/agents");
  const mappings = [];
  for (const p of telecomProviders) {
    const source = await api<Item>(`/sources/${p.sourceId}`);
    if (new URL(source.website?.url || "").hostname !== new URL(p.websiteUrl).hostname) throw Error(`Unexpected ${p.name} source`);
    const name = `Rezlee ${p.name} Canada`;
    let agent = agents.find(x => x.name === name);
    if (!agent && apply) agent = await api<Item>("/agents", { name, description: "Read-only Canadian consumer bill retrieval. Latest statements first, then a bounded 12-month history; interactive verification and original PDFs." }, `agent:${name}`);
    const tasks = agent ? await list(`/tasks?agent_id=${agent.id}`) : [];
    const ids: Record<string, string> = {};
    for (const { key, ...spec } of telecomTaskSpecs(p.key)) {
      let task = tasks.find(x => x.name === spec.name);
      if (!task && apply) task = await api<Item>("/tasks", { agent_id: agent!.id, ...spec }, `${agent!.id}:${spec.name}`);
      ids[key] = task?.id ?? "dry-run";
      console.log(JSON.stringify({ provider: p.name, agentId: agent?.id, phase: key, taskId: task?.id, status: task?.status ?? "not-created" }));
    }
    mappings.push({ ...p, agentId: agent?.id, taskId: ids.latest, historyTaskId: ids.history, version: telecomVersion });
  }
  if (apply) { mkdirSync("docs/checkpoints", { recursive: true }); writeFileSync("docs/checkpoints/deck-telecom-agents-20261004.json", JSON.stringify({ createdAt: new Date().toISOString(), mappings, liveRetrievalVerified: false }, null, 2) + "\n"); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Provisioning failed"); process.exitCode = 1; });
