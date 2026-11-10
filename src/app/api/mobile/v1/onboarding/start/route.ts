import { NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { GET } from "../route";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  // Serialized by authenticated account in Postgres. Retries cannot create a
  // second home; existing household/expense memberships retain their routes.
  const result = await auth.supabase.rpc("rezlee_start_home");
  if (result.error) return NextResponse.json({ error: "Your home couldn’t be opened. Try again." }, { status: 503 });
  return GET(request);
}
