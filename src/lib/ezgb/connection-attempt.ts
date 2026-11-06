import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import catalog from "../provider-directory/catalog.json";
import { normalizeEzgbAccount } from "./normalize";
import type { EzgbAccountRow } from "./types";

export type ConnectionContext = { userId: string; homeId: string; userIdentifier: string };
export type EzgbConnectionAttempt = {
  checkOnly?: boolean;
  version: 1; attemptId: string; expectedUtility: string | null;
  baseline: string[]; createdAt: number; retries: number;
  phase: "awaiting_account" | "importing" | "different_utility" | "no_bills" | "bills_ready" | "import_failed";
  utilities: string[]; providerIds: string[];
};
const TTL = 20 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const green = catalog.providers.filter(row => "method" in row && row.method === "green_button");
function utilityKey(name: string) {
  return name.toLowerCase().replace(/\b(incorporated|inc|corporation|corp|limited|ltd)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
}
export function canonicalEzgbUtility(name: unknown): string | null {
  if (typeof name !== "string" || name.length > 120) return null;
  const key = utilityKey(name);
  const row = green.find(row => [row.name, ...row.aliases].some(alias => utilityKey(alias) === key));
  return row?.name ?? null;
}
export function ezgbAccountFingerprint(row: EzgbAccountRow) {
  const a = normalizeEzgbAccount(row);
  return createHash("sha256").update(JSON.stringify([a.servicePointKey, a.authorizationId])).digest("hex");
}
function secret() {
  const value = process.env.EZGB_USER_IDENTIFIER_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!value) throw Error("Utility connection verification is unavailable.");
  return value;
}
function signature(payload: string) {
  return createHmac("sha256", secret()).update("rezlee-ezgb-connection-v1|" + payload).digest();
}
export function issueEzgbConnectionIntent(context: ConnectionContext, accounts: EzgbAccountRow[], utilityName?: string | null, now = Date.now(), checkOnly = false) {
  const expectedUtility = utilityName ? canonicalEzgbUtility(utilityName) : null;
  if (utilityName && !expectedUtility) throw Error("Choose a supported utility from Find your provider.");
  if (!Array.isArray(accounts) || accounts.length > 100) throw Error("Could not verify your existing utilities.");
  const attempt: EzgbConnectionAttempt = {
    checkOnly, version: 1, attemptId: randomUUID(), expectedUtility, createdAt: now, retries: 0,
    baseline: [...new Set(accounts.map(ezgbAccountFingerprint))],
    phase: "awaiting_account", utilities: [], providerIds: [],
  };
  const payload = Buffer.from(JSON.stringify({ ...context, attempt })).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}
export function connectionAttempt(value: unknown): EzgbConnectionAttempt | null {
  if (!value || typeof value !== "object") return null;
  const a = value as EzgbConnectionAttempt;
  return (a.checkOnly === undefined || typeof a.checkOnly === "boolean") && a.version === 1 && uuid.test(a.attemptId) && Number.isFinite(a.createdAt) &&
    (a.expectedUtility === null || canonicalEzgbUtility(a.expectedUtility) === a.expectedUtility) &&
    Array.isArray(a.baseline) && a.baseline.length <= 100 && a.baseline.every(x => /^[a-f0-9]{64}$/.test(x)) &&
    Number.isInteger(a.retries) && a.retries >= 0 && a.retries <= 3 &&
    ["awaiting_account","importing","different_utility","no_bills","bills_ready","import_failed"].includes(a.phase) &&
    Array.isArray(a.utilities) && a.utilities.every(x => typeof x === "string" && x.length <= 120) &&
    Array.isArray(a.providerIds) && a.providerIds.every(x => typeof x === "string")
    ? a : null;
}
export function verifyEzgbConnectionIntent(token: unknown, context: ConnectionContext, now = Date.now()) {
  const invalid = () => new Error("This connection has expired or belongs to another household. Start again.");
  if (typeof token !== "string" || token.length > 15000) throw invalid();
  const parts = token.split(".");
  if (parts.length !== 2) throw invalid();
  const provided = Buffer.from(parts[1], "base64url"), expected = signature(parts[0]);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw invalid();
  let data;
  try { data = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { throw invalid(); }
  const a = connectionAttempt(data.attempt);
  if (!a || data.userId !== context.userId || data.homeId !== context.homeId || data.userIdentifier !== context.userIdentifier ||
    a.createdAt > now || now - a.createdAt > TTL) throw invalid();
  return a;
}
export function selectEzgbConnectionAccounts(attempt: EzgbConnectionAttempt, accounts: EzgbAccountRow[]) {
  if (!Array.isArray(accounts)) throw Error("Utility account response was invalid.");
  const names = (row: EzgbAccountRow) => [row.custodian?.humanName, row.custodian?.utilityName].map(canonicalEzgbUtility);
  const changed = accounts.filter(row => !attempt.baseline.includes(ezgbAccountFingerprint(row)));
  const selected = attempt.expectedUtility
    ? accounts.filter(row => names(row).includes(attempt.expectedUtility))
    : changed;
  const different = attempt.expectedUtility && !selected.length
    ? [...new Set(changed.flatMap(names).filter((name): name is string => !!name))] : [];
  return { accounts: selected, different };
}
export function publicEzgbConnection(attempt: EzgbConnectionAttempt) {
  return {
    expectedUtility: attempt.expectedUtility, phase: attempt.phase,
    utilities: attempt.utilities, providerIds: attempt.providerIds,
    canRetry: attempt.retries < 3 && Date.now() - attempt.createdAt < 24 * 60 * 60 * 1000,
  };
}

export function ezgbUtilityCategory(name: string) {
  const canonical = canonicalEzgbUtility(name);
  return green.find(row => row.name === canonical)?.category ?? null;
}
