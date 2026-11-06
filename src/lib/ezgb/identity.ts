import { createHmac } from "node:crypto";

function identitySecret() {
  const secret =
    process.env.EZGB_USER_IDENTIFIER_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secret) {
    throw new Error("EZGB user-identifier secret is not configured.");
  }
  return secret;
}

export function ezgbUserIdentifier(userId: string, homeId: string) {
  const digest = createHmac("sha256", identitySecret())
    .update(`ezgb-user-v1|${userId}|${homeId}`)
    .digest("hex")
    .slice(0, 32);

  return `rz_${digest}`;
}
