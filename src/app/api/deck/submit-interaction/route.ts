import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/providers";
import { submitProviderDeckInteraction } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  const body = (await request.json().catch(() => ({}))) as {
    providerId?: string;
    values?: Record<string, string>;
  };

  if (!body.providerId || !body.values) {
    return Response.json(
      { ok: false, message: "Provider and verification answer are required." },
      { status: 400 }
    );
  }

  try {
    const result = await submitProviderDeckInteraction({
      providerId: body.providerId,
      userId: user.id,
      values: body.values,
    });

    revalidatePath("/app/providers");
    revalidatePath(`/app/providers/${body.providerId}`);
    revalidatePath("/app");

    return Response.json(result, { status: result.ok ? 200 : 202 });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not submit Deck verification answer.",
      },
      { status: 500 }
    );
  }
}
