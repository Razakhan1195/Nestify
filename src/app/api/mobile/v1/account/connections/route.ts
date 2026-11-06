import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountProviderSummary } from "@/lib/providers/account-connection-summary";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
// This summary is deliberately read-only. Opening Settings must never start a paid retrieval or Gmail worker.
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return reply({ error: auth.error.message }, auth.error.status);
  const home = await auth.supabase.from("homes").select("id").eq("user_id", auth.user.id).order("created_at").limit(1).maybeSingle();
  if (home.error) return reply({ error: "Connection details couldn’t be refreshed." }, 503);
  if (!home.data) return reply({ canConnect: false, providersAvailable: true, gmailAvailable: true, providers: [], gmail: null });
  const [providers, gmail] = await Promise.all([
    auth.supabase.from("providers").select("id,name,display_name,connection_status,sync_status,sync_failure_reason,requires_user_action,last_successful_sync_at").eq("user_id", auth.user.id).eq("home_id", home.data.id).order("created_at", { ascending: false }),
    createAdminClient().from("gmail_memory_links").select("email,status,error_code").eq("user_id", auth.user.id).eq("home_id", home.data.id).maybeSingle(),
  ]);
  const rows = (providers.data ?? []).flatMap(p => { const summary = accountProviderSummary(p); return summary ? [summary] : []; });
  const link = gmail.error ? null : gmail.data;
  return reply({ canConnect: true, providersAvailable: !providers.error, gmailAvailable: !gmail.error, providers: providers.error ? [] : rows,
    gmail: link ? { email: link.email, status: link.status === "active" ? "Connected" : link.status === "disconnected" ? "Disconnected" : link.status === "reconnect" ? "Reconnect needed" : "Paused", needsAttention: link.status === "reconnect" || (link.status === "paused" && !!link.error_code) } : null });
}
