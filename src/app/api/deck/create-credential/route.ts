import { revalidatePath } from "next/cache";

import { providerApiAuth } from "@/lib/security/provider-api";
import { readBoundedJson } from "@/lib/security/request";
import { createProviderDeckCredential } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  const auth = await providerApiAuth();
  if (auth.response) return auth.response;
  const user = auth.user;
  const body = ((await readBoundedJson(request, 32000).catch(() => ({}))) ??
    {}) as {
    password?: string;
    providerId?: string;
    username?: string;
  };

  if (
    typeof body.providerId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.providerId) ||
    typeof body.username !== "string" ||
    !body.username ||
    typeof body.password !== "string" ||
    !body.password
  ) {
    return Response.json(
      { ok: false, message: "Provider, username, and password are required." },
      { status: 400 },
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
  } catch {
    return Response.json(
      {
        ok: false,
        message:
          "This provider action could not be completed. Check the connection and try again.",
      },
      { status: 502 },
    );
  }
}
