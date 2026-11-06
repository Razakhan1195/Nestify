import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { resolveAccessibleHome } from "@/lib/household/access";
import { readBoundedJson } from "@/lib/security/request";

const token = z.string().regex(/^[a-f0-9]{64}$/);
const input = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), token, requestId: z.string().uuid(), displayName: z.string().trim().min(1).max(80), phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/), relationship: z.string().max(40).optional(), expensePersonId: z.string().uuid().optional() }),
  z.object({ operation: z.literal("preview"), token }),
  z.object({ operation: z.literal("request"), token }),
  z.object({ operation: z.literal("approve"), memberId: z.string().uuid(), userId: z.string().uuid() }),
]);
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const parsed = input.safeParse(await readBoundedJson(request, 4096).catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the invitation details." }, { status: 400 });
  const body = parsed.data;
  const hash = "token" in body ? createHash("sha256").update(body.token).digest("hex") : "";
  let result;
  if (body.operation === "create") {
    const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
    if (access.error || !access.data || access.data.role !== "owner") return Response.json({ error: "Only the household owner can invite people." }, { status: 403 });
    result = await auth.supabase.rpc("create_rezlee_phone_invite", { target_home: access.data.home.id, request_key: body.requestId, token_digest: hash, phone_number: body.phone, person_name: body.displayName, relation: body.relationship ?? "", expense_person: body.expensePersonId ?? null });
  } else if (body.operation === "approve") {
    result = await auth.supabase.rpc("approve_rezlee_phone_invite", { target_member: body.memberId, expected_user: body.userId });
  } else {
    result = await auth.supabase.rpc("request_rezlee_phone_invite", { token_digest: hash, confirm_join: body.operation === "request" });
  }
  if (result.error) return Response.json({ error: ["PT409", "22023"].includes(result.error.code) ? result.error.message : "This invitation is unavailable. Refresh and try again." }, { status: result.error.code === "PT409" ? 409 : 400 });
  // No raw phone number or invite secret is logged or placed in query strings.
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
