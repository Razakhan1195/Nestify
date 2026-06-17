import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/providers";
import { createProviderConnectionSession } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  const body = (await request.json().catch(() => ({}))) as {
    providerId?: string;
  };

  if (!body.providerId) {
    return Response.json(
      { ok: false, message: "Missing providerId." },
      { status: 400 }
    );
  }

  try {
    const result = await createProviderConnectionSession({
      providerId: body.providerId,
      userId: user.id,
    });

    revalidatePath("/app/providers");
    revalidatePath(`/app/providers/${body.providerId}`);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not create Deck connection.",
      },
      { status: 500 }
    );
  }
}
