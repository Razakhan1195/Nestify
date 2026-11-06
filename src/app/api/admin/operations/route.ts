import { operationsPage } from "@/lib/ops/attention";
import { operatorAccess } from "@/lib/ops/auth";
import { readOperationsSnapshot } from "@/lib/ops/snapshot";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  const auth = await operatorAccess();
  if (auth.state !== "ready") return Response.json({ error: auth.state === "mfa" ? "Confirm your authenticator code." : "Operations access unavailable." },
    { status: auth.state === "signed_out" ? 401 : auth.state === "unavailable" ? 503 : 403, headers });
  try { return Response.json(await readOperationsSnapshot(auth.userId, operationsPage(new URL(request.url).searchParams.get("page"))), { headers }); }
  catch { return Response.json({ error: "Could not load operations. No customer records were changed." }, { status: 503, headers }); }
}
