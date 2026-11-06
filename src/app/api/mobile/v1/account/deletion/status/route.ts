import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicDeletion, receiptMatches, validReceipt } from "@/lib/account/deletion-policy";
import { processAccountDeletion } from "@/lib/account/deletion";
import { accountDeletionEnabled } from "@/lib/account/operations";
export const maxDuration = 300;
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!accountDeletionEnabled()) return NextResponse.json({ error: "Deletion status is temporarily unavailable." }, { status: 503, headers });
  try {
    const raw = await request.text();
    if (raw.length > 2048) throw new Error("Invalid");
    const body = JSON.parse(raw);
    if (!body || !/^[a-f0-9-]{36}$/i.test(body.requestId ?? "") || !validReceipt(body.receiptToken)) throw new Error("Invalid");
    const { data, error } = await createAdminClient().from("account_deletion_jobs")
      .select("id,receipt_hash,status,phase,completed_at").eq("id", body.requestId).maybeSingle();
    if (error) return NextResponse.json({ error: "Status could not be checked." }, { status: 503, headers });
    if (!data || !receiptMatches(body.receiptToken, data.receipt_hash)) return NextResponse.json({ error: "This deletion receipt could not be found." }, { status: 404, headers });
    if (["queued", "retry", "running"].includes(data.status)) after(async () => { try { await processAccountDeletion(data.id); } catch { console.error("[account-deletion] resume failed", { requestId: data.id }); } });
    return NextResponse.json(publicDeletion(data), { headers });
  } catch { return NextResponse.json({ error: "Invalid deletion receipt." }, { status: 400, headers }); }
}
