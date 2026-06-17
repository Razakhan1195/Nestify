import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/providers";
import { syncProvider } from "@/lib/sync/provider-sync";

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

  const result = await syncProvider({
    providerId: body.providerId,
    userId: user.id,
  });

  revalidatePath("/app/providers");
  revalidatePath(`/app/providers/${body.providerId}`);
  revalidatePath("/app");

  return Response.json(result, { status: result.ok ? 200 : 202 });
}
