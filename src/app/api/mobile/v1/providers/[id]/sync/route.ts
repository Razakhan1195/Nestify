import { NextResponse } from "next/server";

import { queueDeckProviderSync } from "@/lib/sync/deck-v2-runtime";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  const { id } = await context.params;

  try {
    const result = await queueDeckProviderSync({
      supabase: auth.supabase,
      userId: auth.user.id,
      providerId: id,
      runType: "manual",
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh this provider." },
      { status: 502 },
    );
  }
}
