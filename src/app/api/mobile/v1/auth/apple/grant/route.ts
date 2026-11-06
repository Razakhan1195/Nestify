import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppleGrantProblem, appleGrantReady, readBoundedJson, retainAppleGrant } from "@/lib/auth/apple-grants";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
const schema = z.object({ refreshToken: z.string().min(8).max(4096).regex(/^\S+$/) }).strict();
export async function POST(request: Request) {
  if (!appleGrantReady()) return NextResponse.json({ error: "Apple sign-in is unavailable. Please use another sign-in option." }, { status: 503, headers });
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status, headers });
  try {
    const input = schema.safeParse(await readBoundedJson(request, 8192));
    if (!input.success) throw new AppleGrantProblem(400);
    await retainAppleGrant(createAdminClient(), auth.user.id, input.data.refreshToken);
    return NextResponse.json({ saved: true }, { headers });
  } catch (error) {
    return NextResponse.json({ error: "We couldn’t finish Apple sign-in. Please try again." },
      { status: error instanceof AppleGrantProblem ? error.status : 503, headers });
  }
}
