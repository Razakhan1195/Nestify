import { parseIntakeEvidence } from "../../../../../../../../apps/mobile/src/lib/statement-intake-evidence";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { manualBillSchema } from "@/lib/product/bill-input";
import { resumeBillUpload, saveBillOriginal } from "@/lib/product/bill-original-upload";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents";
import { mobileUploadFile, readMobileMultipart, UploadError } from "@/lib/uploads/mobile-upload";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const idSchema = z.string().uuid();
async function context(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return { response: Response.json({ error: auth.error.message }, { status: auth.error.status }) };
  const home = await auth.supabase.from("homes").select("id").eq("user_id", auth.user.id).order("created_at").limit(1).maybeSingle();
  if (home.error || !home.data) return { response: Response.json({ error: "Could not load your home." }, { status: 409 }) };
  return { ...auth, homeId: home.data.id };
}
export async function GET(request: Request) {
  const ctx = await context(request); if ("response" in ctx) return ctx.response;
  const parsed = idSchema.safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!parsed.success) return Response.json({ error: "Choose a valid save." }, { status: 400 });
  const { data, error } = await ctx.supabase.from("vault_save_receipts").select("bill_payload,payload,bill_id,bill_committed_at,status")
    .eq("user_id", ctx.user.id).eq("home_id", ctx.homeId).eq("request_id", parsed.data).maybeSingle();
  if (error) return Response.json({ error: "Could not check this save. Try again." }, { status: 503 });
  if (!data?.bill_payload) return Response.json({ error: "No unfinished statement save was found. Check History before starting again." }, { status: 404 });
  return Response.json({ fields: data.bill_payload, fileName: data.payload.file?.name ?? "Original statement", status: data.status, existingBillId: data.payload.existing ?? null, expectedVersion: data.payload.version ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PATCH(request: Request) {
  const ctx = await context(request); if ("response" in ctx) return ctx.response;
  // UUID in the URL; no unbounded request body needed to resume a stored save.
  const parsed = idSchema.safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!parsed.success) return Response.json({ error: "Choose a valid save." }, { status: 400 });
  const result = await resumeBillUpload(ctx.supabase, parsed.data);
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
export async function POST(request: Request) {
  const ctx = await context(request); if ("response" in ctx) return ctx.response;
  try {
    const form = await readMobileMultipart(request);
    const expectedHome = form.get("expectedHomeId");
    if (expectedHome !== null && (!idSchema.safeParse(expectedHome).success || expectedHome !== ctx.homeId)) {
      return Response.json({ error: "This batch belongs to a different home. Return to that home before saving." }, { status: 409 });
    }
    const supporting = form.get("supporting_details");
    let evidence;
    if (supporting !== null) {
      if (typeof supporting !== "string" || supporting.length > 20000) return Response.json({ error: "Check the supporting statement details." }, { status: 400 });
      try { evidence = parseIntakeEvidence(JSON.parse(supporting)); } catch { evidence = null; }
      if (!evidence) return Response.json({ error: "Check the supporting statement details." }, { status: 400 });
      if(evidence.energy){
        const energyReady=await ctx.supabase.rpc("rezlee_statement_energy_evidence_available");
        if(energyReady.error||energyReady.data!==true)return Response.json({error:"Energy details cannot be saved right now. Your draft is kept; try again later."},{status:503});
      }
      const ready = await ctx.supabase.rpc("rezlee_statement_intake_evidence_available");
      if (ready.error || ready.data !== true) return Response.json({ error: "Supporting details cannot be saved yet. Your draft is kept; try again later." }, { status: 503 });
    }
    const file = (await mobileUploadFile(form, DOCUMENT_MIME_TYPES))!;
    const requestId = idSchema.safeParse(form.get("requestId"));
    const values = Object.fromEntries(["bill_title", "category", "provider_name", "account_number", "amount", "due_date", "issue_date", "billing_period_start", "billing_period_end", "notes"].map(key => [key, form.get(key) ?? ""]));
    if (typeof values.notes === "string" && values.notes.length > 5000) return Response.json({ error: "Keep statement notes under 5,000 characters." }, { status: 400 });
    const fields = manualBillSchema.safeParse({ ...values, record_kind: "historical" });
    const target = z.object({ existingBillId: idSchema.optional(), expectedVersion: z.string().datetime({ offset: true }).optional() }).safeParse({ existingBillId: form.get("existingBillId") || undefined, expectedVersion: form.get("expectedVersion") || undefined });
    if (!requestId.success || !fields.success || !target.success || form.get("reviewed") !== "true" || form.get("currency") !== "CAD") {
      return Response.json({ error: !fields.success ? fields.error.issues[0]?.message : "Confirm the period, CAD charges and original before saving." }, { status: 400 });
    }
    const result = await saveBillOriginal({ supabase: ctx.supabase, userId: ctx.user.id, homeId: ctx.homeId, requestId: requestId.data, fields: fields.data, evidence: evidence ?? undefined, file, ...target.data });
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch (error) {
    return Response.json({ error: error instanceof UploadError ? error.message : "Could not confirm this save. Retry to check and finish it." }, { status: error instanceof UploadError ? error.status : 503 });
  }
}
