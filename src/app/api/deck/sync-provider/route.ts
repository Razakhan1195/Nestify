import { revalidatePath } from "next/cache";

import { providerApiAuth } from "@/lib/security/provider-api";
import { readBoundedJson } from "@/lib/security/request";
import { syncProvider } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  const auth = await providerApiAuth();
  if (auth.response) return auth.response;
  const user = auth.user;
  const body = ((await readBoundedJson(request, 32000).catch(() => ({}))) ??
    {}) as {
    providerId?: string;
    restart?: boolean;
  };

  if (
    typeof body.providerId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.providerId)
  ) {
    return Response.json(
      { ok: false, message: "Missing providerId." },
      { status: 400 },
    );
  }

  try {
    const result = await syncProvider({
      providerId: body.providerId,
      restart: body.restart,
      userId: user.id,
    });

    revalidatePath("/app/providers");
    revalidatePath(`/app/providers/${body.providerId}`);
    revalidatePath("/app");

    return Response.json(result, { status: result.ok ? 200 : 202 });
  } catch {
    return Response.json(
      {
        ok: false,
        message: "Could not refresh this provider. Please try again.",
      },
      { status: 502 },
    );
  }
}
