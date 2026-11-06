import { DeckVerificationInputError } from "@/lib/deck/telecom-auth";
import { readBoundedJson } from "@/lib/security/request";
import { DeckV2ApiError } from "@/lib/deck/v2-client";
import { DeckVerificationChangedError } from "@/lib/deck/verification";
import { NextResponse } from "next/server";
import { z } from "zod";

import { submitDeckProviderInteraction } from "@/lib/sync/deck-v2-runtime";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

const bodySchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  values: z.record(z.string().max(200), z.union([z.string().max(4000), z.boolean()])).refine(
    (values) => Object.keys(values).length > 0 && Object.keys(values).length <= 20,
    "Enter the requested verification value.",
  ),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  const { id } = await context.params;
  const body = await readBoundedJson(request, 24_000).catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter the verification value." },
      { status: 400 },
    );
  }
  try {
    const result = await submitDeckProviderInteraction({
      supabase: auth.supabase,
      userId: auth.user.id,
      providerId: id,
      values: parsed.data.values,
      challengeId: parsed.data.challengeId,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DeckV2ApiError
            ? "Could not verify your response. Check the latest provider status and try again."
            : error instanceof Error
            ? error.message
            : "Could not submit provider verification.",
      },
      { status: error instanceof DeckVerificationInputError ? 400 : error instanceof DeckVerificationChangedError ? 409 : 502 },
    );
  }
}
