import type { DeckBill, DeckConnection } from "@/lib/deck/types";

export function mapDeckStatusToProviderState(status: DeckConnection["status"]) {
  switch (status) {
    case "created":
      return {
        connection_status: "connecting",
        health_status: "needs_attention",
        requires_user_action: false,
        user_action_message: null,
      };
    case "connected":
      return {
        connection_status: "connected",
        health_status: "healthy",
        requires_user_action: false,
        user_action_message: null,
      };
    case "syncing":
      return {
        connection_status: "syncing",
        health_status: "needs_attention",
        requires_user_action: false,
        user_action_message: null,
      };
    case "no_bill_found":
      return {
        connection_status: "connected",
        health_status: "needs_attention",
        requires_user_action: false,
        user_action_message:
          "Connected successfully, but no current bill was found yet.",
      };
    case "requires_user_action":
    case "mfa_required":
      return {
        connection_status: "needs_attention",
        health_status: "needs_attention",
        requires_user_action: true,
        user_action_message:
          "Deck needs you to complete an action before syncing can continue.",
      };
    case "credentials_expired":
      return {
        connection_status: "disconnected",
        health_status: "needs_attention",
        requires_user_action: true,
        user_action_message: "Credentials expired. Reconnect this provider.",
      };
    case "failed":
      return {
        connection_status: "sync_failed",
        health_status: "sync_failed",
        requires_user_action: true,
        user_action_message: "Sync failed. Review this provider and try again.",
      };
    case "disconnected":
      return {
        connection_status: "disconnected",
        health_status: "needs_attention",
        requires_user_action: true,
        user_action_message: "Provider is disconnected.",
      };
    default:
      return {
        connection_status: "needs_attention",
        health_status: "needs_attention",
        requires_user_action: true,
        user_action_message: "Provider needs attention.",
      };
  }
}

export function mapDeckBillToBillRow(input: {
  bill: DeckBill;
  userId: string;
  homeId: string;
  providerId: string;
}) {
  const { bill, homeId, providerId, userId } = input;

  return {
    user_id: userId,
    home_id: homeId,
    provider_id: providerId,
    external_bill_id: bill.externalBillId,
    name: `${bill.providerName} bill`,
    amount: bill.amountDue,
    currency: bill.currency,
    due_date: bill.dueDate,
    issue_date: bill.issueDate,
    billing_period_start: bill.billingPeriodStart,
    billing_period_end: bill.billingPeriodEnd,
    account_number_masked: bill.accountNumberMasked,
    usage_amount: bill.usageAmount ?? null,
    usage_unit: bill.usageUnit ?? null,
    previous_balance: bill.previousBalance ?? null,
    pdf_available: bill.pdfAvailable,
    line_items: bill.lineItems ?? [],
    detected_fees: bill.detectedFees ?? [],
    raw_data: {
      providerName: bill.providerName,
      category: bill.category,
      rawData: bill.rawData,
    },
    status: "upcoming",
  };
}
