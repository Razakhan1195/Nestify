export type GiftReceipt = { id: string; realtorName: string; expires_at: string; started_at: string; revoked_at?: string | null };
export function giftReceiptState(receipt: GiftReceipt | null, now = Date.now()): "pending" | "active" | "expired" | "unavailable" {
 if (!receipt) return "pending";
 const expires = Date.parse(receipt.expires_at);
 if (receipt.revoked_at || !Number.isFinite(expires)) return "unavailable";
 return expires > now ? "active" : "expired";
}
