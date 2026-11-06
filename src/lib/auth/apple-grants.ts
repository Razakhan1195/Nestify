import { createHash } from "node:crypto";
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seal, unseal } from "../email-memory/gmail-security";

export class AppleGrantProblem extends Error {
  constructor(readonly status = 503) { super("Apple sign-in could not be confirmed. Please try again."); }
}
export type AppleConfig = { clientId: string; clientSecret: string; encryptionKey: Buffer };
export function appleConfig(env: Record<string, string | undefined> = process.env, now = Date.now()): AppleConfig {
  try {
    const clientId = env.REZLEE_APPLE_CLIENT_ID ?? "";
    const clientSecret = env.REZLEE_APPLE_CLIENT_SECRET ?? "";
    const teamId = env.REZLEE_APPLE_TEAM_ID ?? "";
    const encodedKey = env.REZLEE_APPLE_ENCRYPTION_KEY ?? "";
    const encryptionKey = Buffer.from(encodedKey, "base64");
    const claims = decodeJwt(clientSecret), header = decodeProtectedHeader(clientSecret);
    if (!/^[a-zA-Z0-9.-]{3,255}$/.test(clientId) || !/^[A-Z0-9]{10}$/.test(teamId) ||
      header.alg !== "ES256" || !/^[A-Z0-9]{10}$/.test(header.kid ?? "") ||
      claims.iss !== teamId || claims.sub !== clientId || claims.aud !== "https://appleid.apple.com" ||
      typeof claims.iat !== "number" || claims.iat > now / 1000 + 30 ||
      typeof claims.exp !== "number" || claims.exp <= now / 1000 + 300 ||
      claims.exp - claims.iat > 15777000 || encryptionKey.length !== 32 ||
      encryptionKey.toString("base64") !== encodedKey) throw new Error();
    return { clientId, clientSecret, encryptionKey };
  } catch { throw new AppleGrantProblem(); }
}
export function appleGrantReady() {
  try { return process.env.REZLEE_APPLE_GRANTS_ENABLED === "true" && Boolean(appleConfig()); }
  catch { return false; }
}
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
  timeoutDuration: 8000, cooldownDuration: 30000, cacheMaxAge: 3600000,
});
export async function verifiedAppleSubject(idToken: string, clientId: string, key: JWTVerifyGetKey = appleKeys) {
  try {
    const { payload } = await jwtVerify(idToken, key, {
      algorithms: ["RS256"], issuer: ["https://appleid.apple.com", "https://account.apple.com"],
      audience: clientId, requiredClaims: ["sub", "iat", "exp"], clockTolerance: 30,
    });
    if (!payload.sub || payload.sub.length > 255 || !payload.iat || payload.iat > Date.now() / 1000 + 30) throw new Error();
    return payload.sub;
  } catch { throw new AppleGrantProblem(403); }
}
export function validAppleRefreshToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 4096 && !/\s/.test(value);
}
export async function readBoundedJson(response: Response | Request, maxBytes = 32768): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppleGrantProblem(400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AppleGrantProblem(400); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AppleGrantProblem) throw error;
    throw new AppleGrantProblem(400);
  } finally { reader.releaseLock(); }
}
export async function validateAppleGrant(refreshToken: string, config: AppleConfig, request: typeof fetch = fetch,
  verify: typeof verifiedAppleSubject = verifiedAppleSubject) {
  try {
    const response = await request("https://appleid.apple.com/auth/token", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken,
        client_id: config.clientId, client_secret: config.clientSecret }),
    });
    if (!response.ok) throw new AppleGrantProblem(response.status === 400 ? 403 : 503);
    const body = await readBoundedJson(response) as { id_token?: unknown; refresh_token?: unknown };
    if (!body || typeof body.id_token !== "string" || body.id_token.length > 16384) throw new AppleGrantProblem();
    const subject = await verify(body.id_token, config.clientId);
    // Keep a rotated grant as well as the verified input until confirmed revocation.
    if (body.refresh_token !== undefined && !validAppleRefreshToken(body.refresh_token)) throw new AppleGrantProblem();
    return { subject, tokens: [...new Set([refreshToken, ...(typeof body.refresh_token === "string" ? [body.refresh_token] : [])])] };
  } catch (error) {
    if (error instanceof AppleGrantProblem) throw error;
    throw new AppleGrantProblem();
  }
}
export const appleGrantHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const appleGrantContext = (userId: string, clientId: string, hash: string) => "apple:" + userId + ":" + clientId + ":" + hash;
export function sealAppleGrant(token: string, userId: string, config: AppleConfig) {
  const tokenHash = appleGrantHash(token);
  return { tokenHash, cipher: seal(token, appleGrantContext(userId, config.clientId, tokenHash), Buffer.from(config.encryptionKey)) };
}
export function openAppleGrant(cipher: string, userId: string, clientId: string, hash: string, key: Buffer) {
  const token = unseal(cipher, appleGrantContext(userId, clientId, hash), Buffer.from(key));
  if (!validAppleRefreshToken(token) || appleGrantHash(token) !== hash) throw new AppleGrantProblem();
  return token;
}
export async function retainAppleGrant(admin: SupabaseClient, userId: string, refreshToken: string,
  deps = { config: appleConfig, validate: validateAppleGrant }) {
  if (!validAppleRefreshToken(refreshToken)) throw new AppleGrantProblem(400);
  const config = deps.config();
  const owner = await admin.auth.admin.getUserById(userId);
  if (owner.error || owner.data.user?.id !== userId) throw new AppleGrantProblem(403);
  const subjects = (owner.data.user.identities ?? []).filter(i => i.provider === "apple")
    .map(i => i.identity_data?.sub).filter((s): s is string => typeof s === "string" && s.length > 0);
  if (!subjects.length) throw new AppleGrantProblem(403);
  const verified = await deps.validate(refreshToken, config);
  if (!subjects.includes(verified.subject)) throw new AppleGrantProblem(403);
  const rows = verified.tokens.map(token => {
    const encrypted = sealAppleGrant(token, userId, config);
    return { user_id: userId, client_id: config.clientId, apple_subject: verified.subject,
      token_hash: encrypted.tokenHash, token_cipher: encrypted.cipher };
  });
  // A database trigger shares the deletion lock and rejects late writes after freeze.
  const saved = await admin.from("apple_auth_grants").upsert(rows, {
    onConflict: "user_id,client_id,token_hash", ignoreDuplicates: true,
  });
  if (saved.error) throw new AppleGrantProblem(saved.error.code === "42501" ? 423 : 503);
}
