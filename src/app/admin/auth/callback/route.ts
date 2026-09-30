import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeOperatorOAuth } from "@/lib/ops/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = await completeOperatorOAuth(url.searchParams, async code => {
    const client = await createClient();
    return client.auth.exchangeCodeForSession(code);
  });
  const destination = new URL("/admin/access", url.origin);
  if (error) destination.searchParams.set("error", error);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
