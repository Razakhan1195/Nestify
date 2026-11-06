import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";
import { apiPost, ApiError } from "./api";
import { supabase } from "./supabase";
import { createPhoneInviteRecovery, type PhoneInviteInput } from "./phone-invite-recovery";
export type { PhoneInviteInput } from "./phone-invite-recovery";
export type PhoneInvitationState = { state: "pending" | "awaiting_approval" | "accepted" | "expired" | "unavailable" | "other_household" | "own_household"; homeName?: string; expiresAt?: string };
export function normalizeInvitePhone(value: string) {
  const clean = value.replace(/[\s().-]/g, "");
  if (/^[2-9][0-9]{9}$/.test(clean)) return "+1" + clean;
  if (/^1[2-9][0-9]{9}$/.test(clean)) return "+" + clean;
  return /^\+[1-9][0-9]{7,14}$/.test(clean) ? clean : null;
}
async function ownerKey() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("Sign in before inviting someone.");
  return "rezlee-phone-invite-" + data.session.user.id;
}
const recovery = createPhoneInviteRecovery({
  storage: SecureStore, randomUUID: Crypto.randomUUID,
  definiteRejection: error => error instanceof ApiError && error.status === 409 && !!error.details,
  ownerId: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw Error("Sign in before inviting someone.");
    return data.session.user.id;
  },
  create: (input, ownerId) => apiPost("/api/mobile/v1/household/phone", { operation: "create", ...input }, { timeoutMs: 15_000, expectedUserId: ownerId }),
});
export function createPhoneInvitation(input: PhoneInviteInput, expectedOwnerId?: string) {
  return recovery.create(input, expectedOwnerId);
}
export async function openPhoneInvitation(memberId: string) {
  const key = await ownerKey();
  const saved = await SecureStore.getItemAsync(key + "-" + memberId);
  if (!saved) throw Error("The invitation link is not saved on this device. Cancel this invitation and create a new one to send it.");
  const { phone, token } = JSON.parse(saved);
  if (await ownerKey() !== key) throw Error("Your account changed. Reopen invitations to continue.");
  const base = (process.env.EXPO_PUBLIC_API_URL || "https://rezlee.com").replace(/\/$/, "");
  const message = "Join my household on Rezlee to keep shared expenses and home tasks together. Sign in and request to join; I’ll confirm it’s you. " + base + "/join-household#token=" + token;
  await Linking.openURL("sms:" + phone + (Platform.OS === "ios" ? "&" : "?") + "body=" + encodeURIComponent(message));
}
export function checkPhoneInvitation(token: string, confirm = false, expectedUserId?: string) { return apiPost<PhoneInvitationState>("/api/mobile/v1/household/phone", { operation: confirm ? "request" : "preview", token }, { timeoutMs: 15_000, expectedUserId }); }
export function approvePhoneInvitation(memberId: string, userId: string) { return apiPost<{ ok: true }>("/api/mobile/v1/household/phone", { operation: "approve", memberId, userId }); }
const incoming = "rezlee-incoming-phone-invite";
export async function saveIncomingPhoneInvite(token: string) { if (!/^[a-f0-9]{64}$/.test(token)) throw Error("Invalid invitation link."); await SecureStore.setItemAsync(incoming, token); }
export function readIncomingPhoneInvite() { return SecureStore.getItemAsync(incoming); }
export function clearIncomingPhoneInvite() { return SecureStore.deleteItemAsync(incoming); }

export function pendingPhoneInvitation(expectedOwnerId?: string) {
  return recovery.pending(expectedOwnerId);
}
