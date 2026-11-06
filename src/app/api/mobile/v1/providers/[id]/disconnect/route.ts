import { NextResponse } from "next/server";

import { disconnectDeckV2Provider } from "@/lib/sync/deck-v2-runtime";
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
    const result = await disconnectDeckV2Provider({
      supabase: auth.supabase,
      userId: auth.user.id,
      providerId: id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not disconnect this provider." },
      { status: 502 },
    );
  }
}
