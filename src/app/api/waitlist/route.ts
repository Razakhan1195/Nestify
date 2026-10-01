import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
import {
  normalizedEmail,
  tokenHash,
  sameOrigin,
  validUnsubscribe,
} from "@/lib/waitlist/policy";
import {
  waitlistConfig,
  admit,
  privateHeaders,
} from "@/lib/waitlist/server";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
export async function GET() {
  try {
    const c = waitlistConfig();
    if (!c.ready) return reply({ available: false });
    const r = await createAdminClient()
      .from("rezlee_waitlist_campaign")
      .select("allocated,held_back")
      .eq("singleton", true)
      .single();
    if (r.error) throw Error();
    return reply({
      available: true,
      remaining: Math.max(0, 10000 - r.data.held_back - r.data.allocated),
      heldBack: r.data.held_back,
    });
  } catch {
    return reply({ available: false }, 503);
  }
}
export async function POST(request: Request) {
  const c = waitlistConfig();
  if (!sameOrigin(request, c.origin))
    return reply({ error: "Please use the signup form on Rezlee." }, 403);
  let b: Record<string, unknown>;
  try {
    const value = await readBoundedJson(request, 4096);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    b = value as Record<string, unknown>;
  } catch {
    return reply({ error: "Check your details and try again." }, 400);
  }
  try {
    const db = createAdminClient();
    if (b.action === "unsubscribe") {
      if (
        typeof b.id !== "string" ||
        typeof b.token !== "string" ||
        c.secret.length < 32 ||
        !validUnsubscribe(b.id, b.token, c.secret)
      )
        return reply({ error: "This unsubscribe link is invalid." }, 400);
      const r = await db
        .from("rezlee_waitlist")
        .update({
          status: "unsubscribed",
          confirmation_hash: null,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      if (r.error) throw Error();
      return reply({ state: "unsubscribed" });
    }
    if (b.action === "confirm") {
      if (c.secret.length < 32 || !(await admit(request, "confirm")))
        return reply({ error: "Please try again later." }, 429);
      if (
        typeof b.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(b.id) ||
        typeof b.token !== "string" ||
        !/^[a-f0-9]{64}$/.test(b.token)
      )
        return reply({ error: "This confirmation link is invalid." }, 400);
      const r = await db.rpc("rezlee_confirm_waitlist", {
        p_id: b.id,
        p_hash: tokenHash(b.token),
      });
      if (r.error) throw Error();
      if (r.data.state !== "confirmed")
        return reply(
          {
            error:
              r.data.state === "expired"
                ? "This link expired. Submit your email again for a fresh link."
                : "This confirmation link is invalid.",
          },
          400,
        );
      return reply(r.data);
    }
    if (!c.ready)
      return reply(
        {
          error:
            "Waitlist signup is not available yet. Please check back shortly.",
        },
        503,
      );
    if (b.website) return reply({ state: "joined", reserved: false });
    const email = normalizedEmail(b.email);
    if (!email || b.consent !== true)
      return reply(
        {
          error:
            "Enter a valid email and agree to receive waitlist and launch emails.",
        },
        400,
      );
    if (!(await admit(request)))
      return reply(
        { error: "Too many attempts. Please try again later." },
        429,
      );
    const result = await db.rpc("rezlee_register_waitlist", { p_email: email });
    if (result.error || result.data?.state !== "joined") throw Error();
    return reply({ state: "joined", reserved: result.data.reserved === true });
  } catch {
    return reply(
      { error: "We could not complete that request. Please try again." },
      503,
    );
  }
}
