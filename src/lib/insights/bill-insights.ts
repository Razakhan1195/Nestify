import type { DeckBill } from "@/lib/deck/types";

export type BillInsightInput = {
  bill: DeckBill;
  providerId: string;
  userId: string;
  homeId: string;
};

export function generateBillInsights({
  bill,
  homeId,
  providerId,
  userId,
}: BillInsightInput) {
  const insights = [
    {
      user_id: userId,
      home_id: homeId,
      title: `${bill.providerName} bill is ready`,
      body: `${bill.providerName} has a ${bill.currency} ${bill.amountDue.toFixed(
        2
      )} bill due on ${bill.dueDate}.`,
      insight_type: "bill_detected",
      source: `deck:${providerId}:${bill.externalBillId}`,
    },
  ];

  if (bill.usageAmount && bill.usageUnit) {
    insights.push({
      user_id: userId,
      home_id: homeId,
      title: `${bill.providerName} usage captured`,
      body: `Deck captured ${bill.usageAmount} ${bill.usageUnit} for this billing period.`,
      insight_type: "usage_captured",
      source: `deck:${providerId}:${bill.externalBillId}:usage`,
    });
  }

  for (const fee of bill.detectedFees ?? []) {
    insights.push({
      user_id: userId,
      home_id: homeId,
      title: `${fee.label} detected`,
      body: `${bill.providerName} includes ${bill.currency} ${fee.amount.toFixed(
        2
      )} for ${fee.label}.`,
      insight_type: "fee_detected",
      source: `deck:${providerId}:${bill.externalBillId}:fee:${fee.label}`,
    });
  }

  return insights;
}
