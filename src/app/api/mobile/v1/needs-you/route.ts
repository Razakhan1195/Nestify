import {effectiveBillTable} from "@/lib/product/bill-records";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { resolveAccessibleHome } from "@/lib/household/access";
import { buildActionQueue } from "@/lib/product/action-queue";
import { classifyBillStatus } from "@/lib/product/rules";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

type ProviderRelation =
  | { display_name: string | null; name: string; provider_priority: number | null }
  | { display_name: string | null; name: string; provider_priority: number | null }[]
  | null;

type BillRow = {
  id: string;
  provider_id: string | null;
  name: string;
  amount: number | null;
  currency: string;
  due_date: string | null;
  status: string;
  paid_at?: string | null;
  payment_status?: string | null;
  source?: string | null;
  raw_data?: unknown;
  created_at: string;
  providers: ProviderRelation;
};

function mobileItem(item: ReturnType<typeof buildActionQueue>[number]) {
  return {
    key: item.id,
    title: item.title,
    explanation: item.description,
    severity: item.severity,
    cta: item.cta,
    meta: item.meta,
    billId: item.billId ?? null,
    taskId: item.taskId ?? null,
    documentId: item.documentId ?? null,
    providerId: item.providerId ?? null,
    issueId: item.issueId ?? null,
    sourceType: item.sourceType,
    eventType: item.eventType,
  };
}

async function loadQueue(auth: { user: { id: string }; supabase: SupabaseClient }) {
  const { user, supabase } = auth;
  const access = await resolveAccessibleHome(supabase, user.id);
  if (access.error) {
    throw new Error("Could not load attention");
  }
  if (!access.data) {
    return null;
  }

  const { home, role: accessRole } = access.data;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [
    { data: providers = [] },
    { data: bills = [] },
    { data: maintenanceTasks = [] },
    { data: documents = [] },
    { data: attentionResolutions = [] },
    { data: billEvents = [] },
    { data: repairIssues = [] },
  ] = await Promise.all([
    supabase
      .from("providers")
      .select(
        "id,name,display_name,provider_priority,connection_status,health_status,next_expected_bill_date,requires_user_action,user_action_message,data_capabilities",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("provider_priority", { ascending: true, nullsFirst: false })
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
    supabase
      .from(effectiveBillTable())
      .select(
        "id,provider_id,name,amount,currency,due_date,status,paid_at,payment_status,source,raw_data,created_at,providers!bills_provider_id_fkey(display_name,name,provider_priority)",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
    (accessRole === "owner"
      ? supabase
          .from("maintenance_tasks")
          .select("id,title,description,due_date,status,category,recurrence")
          .eq("user_id", user.id)
          .eq("home_id", home.id)
      : supabase
          .from("maintenance_tasks")
          .select("id,title,description,due_date,status,category,recurrence")
          .eq("home_id", home.id))
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
    supabase
      .from("documents")
      .select("id,title,document_type,expires_on,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
    supabase
      .from("attention_resolutions")
      .select("attention_key,resolution_status,snoozed_until")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
    supabase
      .from("bill_events")
      .select(
        "id,bill_id,provider_id,event_key,event_type,severity,title,description,resolution_status,snoozed_until,created_at",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
    supabase
      .from("repair_issues")
      .select(
        "id,title,description,category,location,urgency,status,related_task_id,created_at",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .in("status", [
        "open",
        "next_steps_ready",
        "waiting_on_landlord",
        "waiting_on_professional",
      ])
      .order("created_at", { ascending: false })
      .then((result) => { if (result.error) throw new Error("Could not load attention"); return result; }),
  ]);

  const billRows = ((Array.isArray(bills) ? bills : []) as unknown as BillRow[])
    .map((bill) => ({
      ...bill,
      status: classifyBillStatus(bill),
    }));
  const providerRows = (Array.isArray(providers) ? providers : []).filter(
    (provider) => provider.connection_status !== "disconnected" && provider.data_capabilities?.adapter !== "ezgb",
  );

  const queue = buildActionQueue({
    billEvents: (Array.isArray(billEvents) ? billEvents : []) as never,
    bills: billRows as never,
    documents: (Array.isArray(documents) ? documents : []) as never,
    issues: (Array.isArray(repairIssues) ? repairIssues : []) as never,
    providers: providerRows as never,
    resolutions: (
      Array.isArray(attentionResolutions) ? attentionResolutions : []
    ) as never,
    tasks: (Array.isArray(maintenanceTasks) ? maintenanceTasks : []) as never,
    today,
  })
    .filter((item) =>
      item.sourceType === "bill" ||
      item.sourceType === "care" ||
      item.sourceType === "provider" ||
      item.sourceType === "vault"
    )
    ;

  return { homeId: home.id, queue };
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    const result = await loadQueue(auth);
    if (!result) return NextResponse.json({ needsOnboarding: true });
    const queue = result.queue.map(mobileItem);
    const sections = [
      { key: "now", title: "Now", detail: "Due today, overdue or blocking", items: queue.filter(item => item.severity === "high") },
      { key: "soon", title: "Soon", detail: "Worth handling next", items: queue.filter(item => item.severity === "medium") },
      { key: "later", title: "Later", detail: "Keep on your radar", items: queue.filter(item => item.severity === "low") },
    ].filter(section => section.items.length);
    return NextResponse.json({ homeId: result.homeId, count: queue.length, sections });
  } catch {
    return NextResponse.json({ error: "Could not check all your attention items. Please try again." }, { status: 503 });
  }
}

/** Dismiss only the reviewed snapshot; never pay bills or complete shared tasks. */
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => null);
  if (!body || !["dismiss", "restore"].includes(body.action) || typeof body.homeId !== "string" ||
      !Array.isArray(body.keys) || !body.keys.length || body.keys.length > 500 ||
      body.keys.some((key: unknown) => typeof key !== "string" || !key.length || key.length > 256) ||
      (body.action === "restore" && (typeof body.dismissedAt !== "string" || !Number.isFinite(Date.parse(body.dismissedAt))))) {
    return NextResponse.json({ error: "Reload your attention list before trying again." }, { status: 400 });
  }
  const keys = [...new Set<string>(body.keys)];
  try {
    const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
    if (access.error) throw new Error("Home unavailable");
    if (!access.data || access.data.home.id !== body.homeId) return NextResponse.json({ error: "Your household changed. Reopen this list." }, { status: 409 });
    if (body.action === "restore") {
      // The timestamp identifies this exact dismissal. Undo cannot resurrect
      // another device's later decision or change another account's list.
      const result = await auth.supabase.from("attention_resolutions")
        .update({ resolution_status: "open", dismissed_at: null })
        .eq("user_id", auth.user.id).eq("home_id", body.homeId)
        .eq("resolution_status", "dismissed").eq("dismissed_at", body.dismissedAt)
        .in("attention_key", keys).select("attention_key");
      if (result.error) throw new Error("Restore failed");
      return NextResponse.json({ keys: (result.data ?? []).map(row => row.attention_key) });
    }
    const current = await loadQueue(auth);
    if (!current || current.homeId !== body.homeId) return NextResponse.json({ error: "Your household changed. Reopen this list." }, { status: 409 });
    const selected = current.queue.filter(item => keys.includes(item.id));
    const dismissedAt = new Date().toISOString();
    if (selected.length) {
      const result = await auth.supabase.from("attention_resolutions").upsert(selected.map(item => ({
        user_id: auth.user.id, home_id: current.homeId, attention_key: item.id,
        event_type: item.eventType, related_table: item.relatedTable ?? null, related_id: item.sourceId,
        resolution_status: "dismissed", dismissed_at: dismissedAt, handled_at: null, snoozed_until: null,
      })), { onConflict: "user_id,home_id,attention_key" });
      if (result.error) throw new Error("Dismiss failed");
    }
    return NextResponse.json({ keys: selected.map(item => item.id), dismissedAt });
  } catch {
    return NextResponse.json({ error: "Could not confirm that change. Refresh your list before trying again." }, { status: 503 });
  }
}
