import { after, NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountDeletionEnabled } from "@/lib/account/operations";
import { processAccountDeletion } from "@/lib/account/deletion";
import { publicDeletion, deletionAuthenticationAllowed, receiptHash, validReceipt } from "@/lib/account/deletion-policy";

export const maxDuration = 300;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status, headers });
  if (!accountDeletionEnabled()) return NextResponse.json({ enabled: false }, { headers });
  try {
    const admin = createAdminClient();
    const pending = await admin.from("account_deletion_jobs").select("id,status,phase,completed_at").eq("user_id", auth.user.id).maybeSingle();
    if (pending.error) throw new Error("Unavailable");
    if (pending.data) return NextResponse.json({ enabled: true, emailCodeAvailable: process.env.REZLEE_EMAIL_CODE_ENABLED === "true", deletion: publicDeletion(pending.data) }, { headers });
    const results = await Promise.all([
      admin.from("homes").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id),
      admin.from("household_members").select("id", { count: "exact", head: true }).eq("created_by_user_id", auth.user.id).neq("role", "owner").eq("status", "active"),
      admin.from("household_members").select("id", { count: "exact", head: true }).eq("linked_user_id", auth.user.id).neq("created_by_user_id", auth.user.id),
    ]);
    if (results.some(r => r.error)) throw new Error("Unavailable");
    return NextResponse.json({ enabled: true, emailCodeAvailable: process.env.REZLEE_EMAIL_CODE_ENABLED === "true", impact: { homes: results[0].count ?? 0, sharedMemberships: results[1].count ?? 0, joinedHomes: results[2].count ?? 0 } }, { headers });
  } catch { return NextResponse.json({ error: "We couldn’t check your account. Try again before deleting it." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status, headers });
  if (!accountDeletionEnabled()) return NextResponse.json({ error: "Account deletion is not available in this build yet." }, { status: 503, headers });
  const jwt = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (!body || body.confirm !== "DELETE" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId ?? "") || !validReceipt(body.receiptToken)) {
    return NextResponse.json({ error: "Confirm deletion to continue." }, { status: 400, headers });
  }
  if (!deletionAuthenticationAllowed(jwt, auth.user.id, body.userId, process.env.REZLEE_EMAIL_CODE_ENABLED === "true")) {
    return NextResponse.json({ error: "Confirm your identity again before deleting your account." }, { status: 403, headers });
  }
  try {
    const { data, error } = await createAdminClient().rpc("begin_rezlee_account_deletion", {
      p_user: auth.user.id, p_id: body.requestId, p_receipt_hash: receiptHash(body.receiptToken),
    });
    if (error?.code === "55000") return NextResponse.json({ error: "A connection is still being updated. Wait for it to finish, then try again." }, { status: 409, headers });
    if (error?.code === "23505") return NextResponse.json({ error: "A deletion request already exists. Check its status before trying again." }, { status: 409, headers });
    if (error || !data) throw new Error("Unavailable");
    after(async () => { try { await processAccountDeletion(data.id); } catch { console.error("[account-deletion] worker checkpoint failed", { requestId: data.id }); } });
    return NextResponse.json(publicDeletion(data), { status: 202, headers });
  } catch { return NextResponse.json({ error: "We couldn’t confirm your request. Check its status before trying again." }, { status: 503, headers }); }
}
