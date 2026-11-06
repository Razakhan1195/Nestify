export type HomeNotice = {
  id: string;
  title: string;
  detail: string;
  tone: "positive" | "neutral" | "warning";
  icon: "trending-up" | "trending-down" | "refresh-cw" | "calendar" | "shield" | "check-circle";
  destination: "bills" | "care" | "vault" | "providers";
};

export function buildHomeNotices(input: {
  changePercent: number | null;
  currentMonthTotal: number;
  previousMonthTotal: number;
  providerNeedsAttentionCount: number;
  careDueSoonCount: number;
  billsDueSoonCount: number;
  vaultRecordsCount: number;
}) {
  const notices: HomeNotice[] = [];

  if (input.changePercent !== null && Math.abs(input.changePercent) >= 10) {
    const up = input.changePercent > 0;
    notices.push({
      id: "cost-change",
      title: `Recorded bills total ${Math.abs(input.changePercent)}% ${up ? "higher" : "lower"} than last month`,
      detail: up ? "Compare the bills recorded for each month; missing bills can affect the difference." : "A lower recorded total may reflect missing bills, rather than lower spending.",
      tone: up ? "warning" : "positive",
      icon: up ? "trending-up" : "trending-down",
      destination: "bills",
    });
  }
  if (input.providerNeedsAttentionCount > 0) {
    notices.push({
      id: "provider-health",
      title: `${input.providerNeedsAttentionCount} provider connection${input.providerNeedsAttentionCount === 1 ? " needs" : "s need"} attention`,
      detail: "Reconnect to keep bills and household records up to date.",
      tone: "warning",
      icon: "refresh-cw",
      destination: "providers",
    });
  }

  if (input.careDueSoonCount > 0) {
    notices.push({
      id: "care-soon",
      title: `${input.careDueSoonCount} care task${input.careDueSoonCount === 1 ? " is" : "s are"} coming up`,
      detail: "A little preventive care now can avoid bigger surprises later.",
      tone: "neutral",
      icon: "calendar",
      destination: "care",
    });
  }

  if (input.billsDueSoonCount > 0 && notices.length < 3) {
    notices.push({
      id: "bills-soon",
      title: `${input.billsDueSoonCount} bill${input.billsDueSoonCount === 1 ? " is" : "s are"} due soon`,
      detail: "Rezlee is keeping the upcoming payment window on your radar.",
      tone: "neutral",
      icon: "calendar",
      destination: "bills",
    });
  }
  if (!notices.length && input.currentMonthTotal > 0) {
    notices.push({
      id: "steady-month",
      title: "Your recorded bills are ready to review",
      detail: "This reflects bills saved in Rezlee; it may not include every household cost.",
      tone: "positive",
      icon: "check-circle",
      destination: "bills",
    });
  }

  if (!notices.length && input.vaultRecordsCount > 0) {
    notices.push({
      id: "records-ready",
      title: "Your home record is taking shape",
      detail: "Saved records make warranties, repairs and future decisions easier to handle.",
      tone: "positive",
      icon: "shield",
      destination: "vault",
    });
  }

  return notices.slice(0, 3);
}
