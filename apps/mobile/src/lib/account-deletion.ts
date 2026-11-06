import * as SecureStore from "expo-secure-store";
import { apiGet, apiPost, apiDeletionReceipt } from "@/lib/api";

import { createDeletionReceiptStore, type DeletionReceipt } from "./account-deletion-receipt";
export type { DeletionReceipt } from "./account-deletion-receipt";
export type DeletionStatus = { requestId: string; status: "queued" | "running" | "retry" | "needs_attention" | "completed"; phase: "connections" | "files" | "account"; completedAt: string | null };
export type DeletionPreview = { enabled: boolean; emailCodeAvailable?: boolean; impact?: { homes: number; sharedMemberships: number; joinedHomes: number }; deletion?: DeletionStatus };
const receipts = createDeletionReceiptStore(SecureStore, async (userId, requestId) => {
  const crypto = await import("expo-crypto");
  const bytes = await crypto.getRandomBytesAsync(32);
  return { userId, requestId: requestId ?? crypto.randomUUID(), receiptToken: Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("") };
});
export const readDeletionReceipt = receipts.read;
export const prepareDeletionReceipt = receipts.prepare;
export const clearDeletionReceipt = receipts.clear;
export function deletionPreview() { return apiGet<DeletionPreview>("/api/mobile/v1/account/deletion", { timeoutMs: 15_000 }); }
export function submitDeletion(record: DeletionReceipt) { return apiPost<DeletionStatus>("/api/mobile/v1/account/deletion", { userId: record.userId, requestId: record.requestId, receiptToken: record.receiptToken, confirm: "DELETE" }, { timeoutMs: 15_000 }); }
export function deletionStatus(record: DeletionReceipt) { return apiDeletionReceipt<DeletionStatus>({ requestId: record.requestId, receiptToken: record.receiptToken }); }
