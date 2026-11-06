import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateMobileRequest } from "@/lib/supabase/mobile";

const registerSchema = z.object({
  token: z.string().trim().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/).max(512),
  platform: z.enum(["ios", "android"]),
});

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const parsed = registerSchema.safeParse(await readBoundedJson(request,2048).catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Could not register this device for notifications." },
      { status: 400 },
    );
  }

  // The authenticated app may move its exact device token when switching accounts.
  const { error } = await createAdminClient()
    .from("device_push_tokens")
    .upsert(
      {
        user_id: auth.user.id,
        expo_push_token: parsed.data.token,
        platform: parsed.data.platform,
        enabled: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" },
    );

  if (error) {
    return NextResponse.json(
      { error: "Could not register this device for notifications." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const parsed = z
    .object({ token: z.string().trim().min(20).max(512) })
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Push token is required." }, { status: 400 });
  }

  await auth.supabase
    .from("device_push_tokens")
    .update({ enabled: false })
    .eq("user_id", auth.user.id)
    .eq("expo_push_token", parsed.data.token);

  return NextResponse.json({ ok: true });
}
