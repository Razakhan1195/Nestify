import { NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { resolveOwnedHome } from "@/lib/household/access";
import { provinceRequestSchema } from "@/lib/onboarding/province";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const parsed = provinceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a Canadian province or territory." }, { status: 400 });
  const owned = await resolveOwnedHome(auth.supabase, auth.user.id);
  if (owned.error) return NextResponse.json({ error: "Your home couldn’t be loaded. Try again." }, { status: 503 });
  if (!owned.data) return NextResponse.json({ error: "Only the home owner can change this location." }, { status: 403 });
  const result = await auth.supabase.from("homes").update({ province: parsed.data.province })
    .eq("id", owned.data.id).eq("user_id", auth.user.id).select("id,province").single();
  if (result.error) return NextResponse.json({ error: "Your province couldn’t be saved. Try again." }, { status: 503 });
  return NextResponse.json({ home: result.data });
}
