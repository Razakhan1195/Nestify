import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createClient } from "@/lib/supabase/server";
import { readBoundedJson } from "@/lib/security/request";
import { listInput, suggestionInput, voteInput, roadmapError } from "@/lib/roadmap/model";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function context(request: Request, write = false) {
 if (request.headers.has("authorization")) return authenticateMobileRequest(request);
 if (write && request.headers.get("origin") !== new URL(request.url).origin)
  return { error: { status: 403, message: "Open Rezlee to make this change." } };
 const supabase = await createClient();
 if (write) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return { error: { status: 401, message: "Sign in with a verified account to share ideas and vote." } };
 }
 return { error: undefined, supabase };
}
export async function GET(request: Request) {
 const input = listInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if (!input.success) return reply({ error: "Check the roadmap filters." }, 400);
 try {
  const ctx = await context(request);
  if (ctx.error) return reply({ error: ctx.error.message }, ctx.error.status);
  const q = input.data;
  const result = await ctx.supabase.rpc("rezlee_roadmap_list", { p_mine: q.mine === "true", p_status: q.status, p_sort: q.sort, p_search: q.search, p_page: q.page });
  if (result.error) { const e = roadmapError(result.error.code); return reply({ error: e.status === 503 ? "The roadmap couldn’t load. Try again." : e.error }, e.status); }
  return reply({ ...result.data, generatedAt: new Date().toISOString() });
 } catch { return reply({ error: "The roadmap couldn’t load. Try again." }, 503); }
}
export async function POST(request: Request) {
 try {
  const ctx = await context(request, true);
  if (ctx.error) return reply({ error: ctx.error.message }, ctx.error.status);
  const input = suggestionInput.safeParse(await readBoundedJson(request, 12000).catch(() => null));
  if (!input.success) return reply({ error: "Add a title (6–100 characters), a description (20–2,000 characters), and confirm public sharing." }, 400);
  const d = input.data;
  const result = await ctx.supabase.rpc("rezlee_roadmap_submit", { p_id: d.id, p_title: d.title, p_description: d.description, p_category: d.category, p_share_publicly: d.sharePublicly });
  if (result.error) { const e = roadmapError(result.error.code); return reply({ error: e.error }, e.status); }
  return reply({ id: result.data }, 201);
 } catch { return reply({ error: "We couldn’t confirm your idea was received. Retry the same idea." }, 503); }
}
export async function PATCH(request: Request) {
 try {
  const ctx = await context(request, true);
  if (ctx.error) return reply({ error: ctx.error.message }, ctx.error.status);
  const input = voteInput.safeParse(await readBoundedJson(request, 1024).catch(() => null));
  if (!input.success) return reply({ error: "Choose an upvote or downvote." }, 400);
  const result = await ctx.supabase.rpc("rezlee_roadmap_vote", { p_id: input.data.id, p_value: input.data.value });
  if (result.error) { const e = roadmapError(result.error.code); return reply({ error: e.error }, e.status); }
  return reply(result.data);
 } catch { return reply({ error: "Your vote couldn’t be confirmed. Please retry." }, 503); }
}
