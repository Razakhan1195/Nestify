import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { DOCUMENT_BUCKET, isOwnedDocumentPath } from "@/lib/documents";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseEnv())
    return Response.json(
      { error: "File access is temporarily unavailable." },
      { status: 503 },
    );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Sign in to open your file." },
      { status: 401 },
    );
  const { id } = await context.params;
  const { data: document, error } = await supabase
    .from("documents")
    .select("storage_path,file_name,home_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !document)
    return Response.json({ error: "Record not found." }, { status: 404 });
  if (
    !document.storage_path ||
    !isOwnedDocumentPath(document.storage_path, user.id, document.home_id)
  )
    return Response.json(
      {
        error:
          "The original file is not stored in Rezlee. Open your provider portal or use your original copy.",
      },
      { status: 404 },
    );
  const { data, error: fileError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 60, {
      download: document.file_name || true,
    });
  if (fileError || !data)
    return Response.json(
      { error: "This file could not be opened. Try again shortly." },
      { status: 404 },
    );
  return new Response(null, {
    status: 303,
    headers: { Location: data.signedUrl, "Cache-Control": "private, no-store" },
  });
}
