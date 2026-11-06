import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { DOCUMENT_BUCKET, isOwnedDocumentPath } from "@/lib/documents";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const bill = await auth.supabase.from("bills").select("home_id,original_document_id,original_storage_path").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (bill.error) return Response.json({ error: "Could not check the saved original. Try again." }, { status: 503 });
  if (!bill.data?.original_document_id) return Response.json({ error: "No original is attached. It may have been removed from Vault." }, { status: 404 });
  const doc = await auth.supabase.from("documents").select("storage_path").eq("id", bill.data.original_document_id).eq("user_id", auth.user.id).eq("home_id", bill.data.home_id).maybeSingle();
  if (doc.error) return Response.json({ error: "Could not load the saved original. Try again." }, { status: 503 });
  const path = doc.data?.storage_path;
  if (!path || path !== bill.data.original_storage_path || !isOwnedDocumentPath(path, auth.user.id, bill.data.home_id)) return Response.json({ error: "This file was changed or removed in Vault. Review the Vault record before relying on its contents." }, { status: 409 });
  const signed = await auth.supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data) return Response.json({ error: "Could not open this original. Try again." }, { status: 503 });
  return Response.json({ url: signed.data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
}
