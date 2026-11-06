import { documentCategory } from "@/lib/product/vault-category";
import { mobileSnapshotQuery } from "@/lib/supabase/mobile-read-context";
import { withStagingPerformanceTrace } from "@/lib/supabase/performance-diagnostics";
import { resolveOwnedHome } from "@/lib/household/access";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

function warrantyStatus(value: string | null) {
  if (!value) return "none" as const;
  const days = Math.ceil((new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired" as const;
  if (days <= 60) return "expiring" as const;
  return "active" as const;
}

async function readGET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });

  const { data: home, error: homeError } = await resolveOwnedHome(auth.supabase, auth.user.id);
  if (homeError) return Response.json({ error: "Could not load your place." }, { status: 500 });
  if (!home) return Response.json({ needsOnboarding: true });

  const [{ data: documents = [], error: documentsError }, { data: items = [], error: itemsError }, summary] = await Promise.all([
    mobileSnapshotQuery(auth.supabase, auth.user.id, "documents", () => auth.supabase.from("documents")
      .select("id,title,category,notes,document_type,file_name,storage_path,mime_type,issued_on,expires_on,source,created_at")
      .eq("user_id", auth.user.id).eq("home_id", home.id)
      .order("created_at", { ascending: false }).limit(100)),
    mobileSnapshotQuery(auth.supabase, auth.user.id, "items", () => auth.supabase.from("inventory_items")
      .select("id,name,category,room_or_area,brand,model_number,warranty_expires_on,status,created_at")
      .eq("user_id", auth.user.id).eq("home_id", home.id)
      .order("created_at", { ascending: false }).limit(100)),
    mobileSnapshotQuery(auth.supabase, auth.user.id, "vaultSummary", () => auth.supabase.rpc("rezlee_vault_summary", { p_home: home.id })),
  ]);

  if (documentsError || itemsError || summary.error || !summary.data) return Response.json({ error: "Could not load your saved records. Please try again." }, { status: 500 });
  const documentRows = documents ?? [];
  const itemRows = items ?? [];
  // Provenance comes from the authenticated import receipt, never title/notes heuristics.
  const imports = documentRows.length ? await auth.supabase.from("email_capture_jobs")
    .select("document_id,source_type").eq("user_id",auth.user.id).eq("home_id",home.id)
    .eq("status","saved").in("document_id",documentRows.map(row=>row.id)) : {data:[]};
  const emailSources = new Map((imports.data ?? []).map(row=>[row.document_id,row.source_type === "gmail" ? "Gmail import" : "Email import"]));
  const shapedDocuments = documentRows.map(({ storage_path, ...document }) => ({
    ...document,
    category: documentCategory(document),
    sourceLabel: emailSources.get(document.id) ?? null,
    hasFile: Boolean(storage_path),
  }));
  const shapedItems = itemRows.map((item) => ({
    ...item,
    warrantyStatus: warrantyStatus(item.warranty_expires_on),
  }));
  return Response.json({ documents: shapedDocuments, items: shapedItems, summary: summary.data },
    { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withStagingPerformanceTrace(readGET);
