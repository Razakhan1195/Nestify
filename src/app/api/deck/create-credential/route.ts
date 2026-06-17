import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/providers";
import { createProviderDeckCredential } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    providerId?: string;
    username?: string;
  };

  if (!body.providerId || !body.username || !body.password) {
    return Response.json(
      { ok: false, message: "Provider, username, and password are required." },
      { status: 400 }
    );
  }

  try {
    const result = await createProviderDeckCredential({
      providerId: body.providerId,
      userId: user.id,
      username: body.username,
      password: body.password,
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
            : "Could not store provider credentials.",
      },
      { status: 500 }
    );
  }
}
