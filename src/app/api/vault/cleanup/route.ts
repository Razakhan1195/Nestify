import { validBearer } from "@/lib/security/bearer";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupVaultAttachments } from "@/lib/product/vault-save";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
 if (!validBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized." }, { status: 401 });
 try { return Response.json(await cleanupVaultAttachments(createAdminClient()), { headers: { "Cache-Control": "no-store" } }); }
 catch { return Response.json({ error: "Attachment cleanup could not finish." }, { status: 503 }); }
}
