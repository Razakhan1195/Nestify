import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { record, text, validDate } from "./telecom-import";
import { DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES } from "@/lib/documents";

export type VerifiedTelecomOriginal = {
  file: Record<string, unknown>;
  bytes: Buffer;
  hash: string;
};
function documentId(key: string) { const h = createHash("sha256").update(key).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; }
export function matchTelecomOriginal(extraction: unknown, output: unknown, saved: Array<{ id: string; row: Record<string, unknown> }>) {
  const e = record(extraction); const account = text(e.account_number); const date = validDate(e.bill_date);
  if (!account || !date) return null;
  const bills = record(output).bills;
  if (!Array.isArray(bills)) return null;
  const matching = bills.map(record).filter(b => text(b.account_number)?.replace(/\s/g, "") === account.replace(/\s/g, "") && b.bill_date === date);
  if (matching.length !== 1) return null;
  const source = matching[0]; const key = createHash("sha256").update(JSON.stringify(text(source.account_id) || text(source.account_number))).digest("hex");
  const candidates = saved.filter(s => s.row.issue_date === date && record(s.row.raw_data).account_key === key);
  return candidates.length === 1 ? candidates[0] : null;
}
/** MIME is only a hint. Verify the bounded HTTPS response before trusting extraction or saving. */
export async function prepareTelecomOriginals(storage: Array<Record<string, unknown>>, fetcher: typeof fetch = fetch): Promise<VerifiedTelecomOriginal[]> {
  const originals: VerifiedTelecomOriginal[] = [];
  for (const file of storage) {
    const mime = text(file.file_type)?.split(";")[0].trim().toLowerCase();
    if (!["application/pdf", "application/octet-stream"].includes(mime ?? "") || typeof file.url !== "string") continue;
    let url: URL;
    try { url = new URL(file.url); } catch { continue; }
    if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "storage.googleapis.com" || url.hostname.endsWith(".deck.co") || url.hostname.endsWith(".amazonaws.com") || url.hostname.endsWith(".blob.core.windows.net"))) continue;
    if (typeof file.file_size === "number" && (file.file_size > MAX_DOCUMENT_BYTES || file.file_size <= 0)) continue;
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) throw Error("Could not retain original statement");
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_DOCUMENT_BYTES) { await response.body?.cancel(); continue; }
    const reader = response.body?.getReader(); if (!reader) throw Error("Original has no content");
    const chunks: Uint8Array[] = []; let size = 0; let tooLarge = false;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > MAX_DOCUMENT_BYTES) { tooLarge = true; break; }
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    if (tooLarge) continue;
    const bytes = Buffer.concat(chunks);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") continue;
    const hash = createHash("sha256").update(bytes).digest("hex");
    originals.push({ file, bytes, hash });
  }
  // Duplicate downloads never create extra originals. Conflicting identities on
  // identical bytes are ambiguous and must not associate one PDF with two bills.
  return originals.filter((item, index) => {
    const same = originals.filter(other => other.hash === item.hash);
    const identity = (f: VerifiedTelecomOriginal) => { const e = record(f.file.extraction); return JSON.stringify([text(e.account_number)?.replace(/\s/g, ""), e.bill_date]); };
    return same.every(other => identity(other) === identity(item)) && originals.findIndex(other => other.hash === item.hash) === index;
  });
}
export async function saveTelecomOriginals(input: { db: SupabaseClient; jobId: string; lease: string; runId: string; userId: string; homeId: string; providerName: string; output: unknown; storage: Array<Record<string, unknown>>; saved: Array<{ id: string; row: Record<string, unknown> }>; prepared?: VerifiedTelecomOriginal[] }) {
  const ids: string[] = []; const matched = new Set<string>();
  const originals = input.prepared ?? await prepareTelecomOriginals(input.storage);
  for (const { file, bytes, hash } of originals) {
    const bill = matchTelecomOriginal(file.extraction, input.output, input.saved); if (!bill || matched.has(bill.id)) continue;
    const id = documentId(`${input.userId}:${input.homeId}:${bill.id}:${hash}`);
    const path = `${input.userId}/${input.homeId}/deck/${id}/${hash}.pdf`;
    const doc = await input.db.from("documents").select("id").eq("id", id).eq("user_id", input.userId).maybeSingle(); if (doc.error) throw Error("Could not check original");
    if (!doc.data) { const upload = await input.db.storage.from(DOCUMENT_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" }); if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw Error("Could not save original"); }
    // Original filenames need not be unique: storage identity is bill + content.
    const attach = await input.db.rpc("attach_rezlee_telecom_original", { p_job: input.jobId, p_lease: input.lease, p_bill: bill.id, p_document: id, p_path: path, p_name: text(file.file_name) || "statement.pdf", p_size: bytes.length });
    if (attach.error) throw Error("Could not attach original"); ids.push(id); matched.add(bill.id);
  }
  return { ids, complete: input.saved.length > 0 && input.saved.every(s => matched.has(s.id)) };
}
