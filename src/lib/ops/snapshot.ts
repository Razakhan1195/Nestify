import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeJob, type QueueName } from "./policy";
import { attentionFilter, OPERATIONS_PAGE_SIZE } from "./attention";
export const operationsQueues: { key: QueueName; title: string; table: string; select: string; orderBy?: string }[] = [
  { key: "ezgb", title: "Green Button imports", table: "integration_sync_jobs", select: "id,status,attempt_count,created_at,expires_at,cancelled_at:stats->>cancelledAt" },
  { key: "deck", title: "Other provider imports", table: "provider_sync_runs", select: "id,status,created_at" },
  { key: "statements", title: "Statement reading", table: "statement_read_attempts", select: "id,status,created_at" },
  { key: "deletions", title: "Account deletion", table: "account_deletion_jobs", select: "id,status,attempts,created_at,error_code,next_attempt_at" },
  { key: "gmail", title: "Gmail discovery", table: "gmail_memory_links", orderBy: "updated_at", select: "id,user_id,status,error_code,created_at:updated_at,updated_at,lease_until,work_phase:work->>phase" },
  { key: "ai", title: "AI requests", table: "ai_usage_events", select: "id,status,created_at" },
];
export async function readOperationsSnapshot(operatorId: string, page = 0) {
  const db = createAdminClient();
  const audit = await db.from("operations_access_log").insert({ operator_id: operatorId, event: "snapshot_read" });
  if (audit.error) throw new Error("Operations audit is unavailable.");
  const now = Date.now();
  const services = await Promise.all(operationsQueues.map(async queue => {
    try {
      const [recent, attention] = await Promise.all([
        db.from(queue.table).select(queue.select).order(queue.orderBy ?? "created_at", { ascending: false }).limit(101),
        db.from(queue.table).select(queue.select, { count: "exact" }).or(attentionFilter(queue.key, now))
          .order(queue.orderBy ?? "created_at", { ascending: true }).order("id", { ascending: true })
          .range(page * OPERATIONS_PAGE_SIZE, (page + 1) * OPERATIONS_PAGE_SIZE - 1),
      ]);
      if (recent.error || attention.error) throw new Error("Unavailable");
      const rows = (recent.data ?? []) as unknown as Record<string, unknown>[];
      const attentionRows = (attention.data ?? []) as unknown as Record<string, unknown>[];
      return { key: queue.key, title: queue.title, available: true, capped: rows.length > 100,
        jobs: rows.slice(0, 100).map(row => safeJob(queue.key, row, now)),
        attentionJobs: attentionRows.map(row => safeJob(queue.key, row, now)),
        attentionTotal: attention.count ?? 0, hasMore: (attention.count ?? 0) > (page + 1) * OPERATIONS_PAGE_SIZE };
    } catch { return { key: queue.key, title: queue.title, available: false, capped: false, jobs: [], attentionJobs: [], attentionTotal: null, hasMore: false }; }
  }));
  const today = new Date(now).toISOString().slice(0,10), month = today.slice(0,7) + "-01";
  const [budgetConfig, budgetWindows] = await Promise.all([
    db.from("rezlee_ai_budget_config").select("enabled,daily_requests,monthly_requests").eq("singleton",true).maybeSingle(),
    db.from("rezlee_ai_budget_windows").select("kind,starts_on,requests").in("starts_on",[today,month]),
  ]);
  const budget = budgetConfig.error || budgetWindows.error || !budgetConfig.data ? { available: false as const } : {
    available: true as const, enabled: budgetConfig.data.enabled,
    dailyLimit: budgetConfig.data.daily_requests, monthlyLimit: budgetConfig.data.monthly_requests,
    dailyUsed: budgetWindows.data?.find(w => w.kind === "day" && w.starts_on === today)?.requests ?? 0,
    monthlyUsed: budgetWindows.data?.find(w => w.kind === "month" && w.starts_on === month)?.requests ?? 0,
  };
  const [spendConfig,spendWindows]=await Promise.all([
    db.from("rezlee_ai_spend_config").select("enabled,daily_usd_cents,monthly_usd_cents,feature_daily_usd_cents,feature_monthly_usd_cents,price_review_before").eq("singleton",true).maybeSingle(),
    db.from("rezlee_ai_spend_windows").select("scope,kind,starts_on,reserved_usd_cents,attempts").in("starts_on",[today,month]),
  ]);
  const spend=spendConfig.error||spendWindows.error||!spendConfig.data?{available:false as const}:{
    available:true as const,config:spendConfig.data,windows:spendWindows.data??[],
    reviewExpired:Date.parse(spendConfig.data.price_review_before)<=now,
  };
  return { generatedAt: new Date(now).toISOString(), attentionPage: page, pageSize: OPERATIONS_PAGE_SIZE,spend,
    environment: process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("gjwvalpxnfbvryosmcbj") ? "Staging" : "Production / other",
    services, budget,
    controls: { aiDisabled: process.env.REZLEE_AI_DISABLED === "true", deletionEnabled: process.env.ACCOUNT_DELETION_ENABLED === "true",
      deckTesting: process.env.REZLEE_DECK_TESTING_ENABLED === "true", utilitySchedules: "Not configured in the release schedule; verify the hosting dashboard independently." },
  };
}
export type OperationsSnapshot = Awaited<ReturnType<typeof readOperationsSnapshot>>;
