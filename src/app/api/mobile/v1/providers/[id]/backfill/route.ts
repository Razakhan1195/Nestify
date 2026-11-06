import { NextResponse } from "next/server";
import { z } from "zod";

import { queueDeckProviderSync } from "@/lib/sync/deck-v2-runtime";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

const bodySchema = z.object({
  sinceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for the start date."),
  untilDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for the end date.")
    .optional(),
  accountId: z.string().trim().min(1).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the date range." },
      { status: 400 },
    );
  }

  if (
    parsed.data.untilDate &&
    parsed.data.untilDate < parsed.data.sinceDate
  ) {
    return NextResponse.json(
      { error: "The end date must be on or after the start date." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const { data: provider } = await auth.supabase
    .from("providers")
    .select("id,registry_provider_id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json(
      { error: "Provider connection not found." },
      { status: 404 },
    );
  }

  if (!provider.registry_provider_id) {
    return NextResponse.json(
      { error: "This provider is not mapped for bill-history retrieval yet." },
      { status: 409 },
    );
  }

  const { data: registry } = await auth.supabase
    .from("provider_registry")
    .select("metadata,deck_agent_id")
    .eq("id", provider.registry_provider_id)
    .maybeSingle();

  const metadata =
    registry?.metadata &&
    typeof registry.metadata === "object" &&
    !Array.isArray(registry.metadata)
      ? (registry.metadata as Record<string, unknown>)
      : {};
  const capabilities =
    metadata.deck_capabilities &&
    typeof metadata.deck_capabilities === "object" &&
    !Array.isArray(metadata.deck_capabilities)
      ? (metadata.deck_capabilities as Record<string, unknown>)
      : {};
  const taskId =
    typeof capabilities.bills_since_date === "string"
      ? capabilities.bills_since_date
      : null;

  if (!taskId?.startsWith("task_")) {
    return NextResponse.json(
      { error: "Bill-history retrieval is not configured for this provider yet." },
      { status: 409 },
    );
  }

  try {
    const result = await queueDeckProviderSync({
      supabase: auth.supabase,
      userId: auth.user.id,
      providerId: id,
      runType: "backfill",
      taskIdOverride: taskId,
      agentIdOverride:
        typeof registry?.deck_agent_id === "string"
          ? registry.deck_agent_id
          : null,
      taskInputOverride: {
        since_date: parsed.data.sinceDate,
        ...(parsed.data.untilDate
          ? { until_date: parsed.data.untilDate }
          : {}),
        ...(parsed.data.accountId
          ? { account_id: parsed.data.accountId }
          : {}),
      },
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not start bill-history retrieval.",
      },
      { status: 502 },
    );
  }
}
