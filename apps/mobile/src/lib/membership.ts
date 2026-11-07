import type { MembershipPayload } from "./membership-types";
export type { Membership, MembershipPayload } from "./membership-types";
import { apiPost } from "./api";
import { screenEpoch } from "./screen-state";
const pending = new Map<string, Promise<MembershipPayload>>();
const listeners = new Map<string, Set<(value: MembershipPayload) => void>>();
let revision = 0;
let snapshot: { userId: string; epoch: number; revision: number; checkedAt: number; value: MembershipPayload } | null = null;
/** Display only; server endpoints remain authoritative for all plan permissions. */
export function getMembershipSnapshot(userId: string) {
  return snapshot?.userId === userId && snapshot.epoch === screenEpoch() ? snapshot.value : null;
}
function publish(userId: string, value: MembershipPayload, epoch: number, requestRevision: number) {
  if (epoch !== screenEpoch()) return value;
  if (snapshot?.userId === userId && snapshot.epoch === epoch && snapshot.revision > requestRevision) return snapshot.value;
  snapshot = { userId, epoch, revision: requestRevision, checkedAt: Date.now(), value };
  listeners.get(userId)?.forEach(listener => listener(value));
  return value;
}
export function subscribeMembership(userId: string, listener: (value: MembershipPayload) => void) {
  const group = listeners.get(userId) ?? new Set(); group.add(listener); listeners.set(userId, group);
  const current = getMembershipSnapshot(userId);
  if (current) listener(current);
  return () => { group.delete(listener); if (!group.size) listeners.delete(userId); };
}
export function loadMembership(userId: string, force = false) {
  const epoch = screenEpoch(), key = `${epoch}:${userId}`;
  const existing = pending.get(key); if (existing && !force) return existing;
  const current = getMembershipSnapshot(userId);
  if (!force && current && snapshot && Date.now() - snapshot.checkedAt < 15_000) return Promise.resolve(current);
  const requestRevision = ++revision;
  const request = apiPost<MembershipPayload>("/api/mobile/v1/membership", { action: "activate" }, { expectedUserId: userId, timeoutMs: 15000 })
    .then(value => publish(userId, value, epoch, requestRevision)).finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request); return request;
}
export function restoreMembership(userId: string) {
  const epoch = screenEpoch(), requestRevision = ++revision;
  return apiPost<MembershipPayload>("/api/mobile/v1/membership", { action: "restore" }, { expectedUserId: userId, timeoutMs: 15000 }).then(value => publish(userId, value, epoch, requestRevision));
}
export function acknowledgeProWelcome(userId: string) {
  const epoch = screenEpoch(), requestRevision = ++revision;
  return apiPost<MembershipPayload>("/api/mobile/v1/membership", { action: "pro-seen" }, { expectedUserId: userId, timeoutMs: 10000 }).then(value => publish(userId, value, epoch, requestRevision));
}
