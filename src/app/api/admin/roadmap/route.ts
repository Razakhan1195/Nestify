import { z } from "zod";
import { operatorAccess } from "@/lib/ops/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
import { roadmapStatuses } from "@/lib/roadmap/model";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
export async function GET(request: Request) {
 const a = await operatorAccess();
 if (a.state !== "ready") return reply({ error: "Operations access required." }, 403);
 const db = createAdminClient();
 const audit = await db.from("operations_access_log").insert({ operator_id: a.userId, event: "snapshot_read" });
 if (audit.error) return reply({ error: "The review queue is temporarily unavailable." }, 503);
 const url = new URL(request.url), page = Math.max(0, Math.min(1000, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0));
 let query = db.from("roadmap_ideas").select("id,title,description,category,visibility,status,priority,response,decided_at,created_at,updated_at,revision", { count: "exact" });
 if (url.searchParams.get("view") === "reported") {
  const reports = await db.from("roadmap_reports").select("idea_id").is("resolved_at", null).limit(1000);
  if (reports.error) return reply({ error: "Reports couldn’t load." }, 503);
  const ids = [...new Set(reports.data.map(x => x.idea_id))];
  if (!ids.length) return reply({ items: [], total: 0, page });
  query = query.in("id", ids);
 } else if (url.searchParams.get("view") !== "all") query = query.is("decided_at", null);
 const result = await query.order("created_at").order("id").range(page * 30, page * 30 + 29);
 if (result.error) return reply({ error: "The review queue couldn’t load. This is not an empty queue." }, 503);
 const reports = await db.from("roadmap_reports").select("idea_id,reason").is("resolved_at", null).in("idea_id", (result.data ?? []).map(x => x.id));
 if (reports.error) return reply({ error: "Safety report status couldn’t load." }, 503);
 return reply({ items: result.data?.map(x => ({ ...x, safetyReports: reports.data.filter(r => r.idea_id === x.id).map(r => r.reason), responseDueAt: new Date(Date.parse(x.created_at) + 7 * 86400000).toISOString() })), total: result.count, page });
}
export async function PATCH(request: Request) {
 if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Use the control center to update the roadmap." }, 403);
 const a = await operatorAccess();
 if (a.state !== "ready") return reply({ error: "Operations access required." }, 403);
 const input = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(),
  visibility: z.enum(["pending", "public", "hidden"]), status: z.enum(roadmapStatuses),
  priority: z.enum(["none", "next", "later"]), response: z.string().trim().max(2000),
 }).refine(x => (x.status === "under_review" && x.visibility !== "hidden") || x.response.length >= 10)
 .refine(x => x.status !== "planned" || x.priority !== "none")
 .safeParse(await readBoundedJson(request, 12000).catch(() => null));
 if (!input.success) return reply({ error: "Add a clear response for your decision and a priority for planned work." }, 400);
 const d = input.data;
 const result = await createAdminClient().rpc("rezlee_roadmap_review", { p_id: d.id, p_operator: a.userId, p_revision: d.revision, p_visibility: d.visibility, p_status: d.status, p_priority: d.priority, p_response: d.response });
 if (result.error) return reply({ error: "The decision couldn’t be saved. Refresh and try again." }, 503);
 if (result.data !== true) return reply({ error: "This idea changed elsewhere. Refresh before saving your decision." }, 409);
 return reply({ ok: true });
}
