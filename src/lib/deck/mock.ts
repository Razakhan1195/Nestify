import type {
  DeckBill,
  DeckBillPdf,
  DeckClient,
  DeckConnection,
  DeckConnectionSession,
  DeckCredential,
  DeckStatus,
} from "@/lib/deck/types";

const providerProfiles: Record<
  string,
  {
    category: string;
    providerName: string;
    status: DeckStatus;
    bills: DeckBill[];
  }
> = {
  electricity: {
    category: "Electricity",
    providerName: "Hydro One",
    status: "connected",
    bills: [
      {
        externalBillId: "hydro-one-2026-06",
        providerName: "Hydro One",
        category: "Electricity",
        amountDue: 142.38,
        currency: "CAD",
        dueDate: "2026-07-08",
        issueDate: "2026-06-14",
        billingPeriodStart: "2026-05-12",
        billingPeriodEnd: "2026-06-11",
        accountNumberMasked: "**** 1842",
        usageAmount: 812,
        usageUnit: "kWh",
        previousBalance: 0,
        pdfAvailable: true,
        lineItems: [
          { label: "Electricity usage", amount: 91.2 },
          { label: "Delivery", amount: 38.41 },
        ],
        detectedFees: [{ label: "Regulatory charges", amount: 4.22 }],
        rawData: { mockScenario: "successful_with_usage_and_pdf" },
      },
    ],
  },
  "natural gas": {
    category: "Natural Gas",
    providerName: "Enbridge Gas",
    status: "connected",
    bills: [
      {
        externalBillId: "enbridge-2026-06",
        providerName: "Enbridge Gas",
        category: "Natural Gas",
        amountDue: 88.15,
        currency: "CAD",
        dueDate: "2026-07-03",
        issueDate: "2026-06-10",
        billingPeriodStart: "2026-05-08",
        billingPeriodEnd: "2026-06-07",
        accountNumberMasked: "**** 7720",
        usageAmount: 102,
        usageUnit: "m3",
        previousBalance: 0,
        pdfAvailable: true,
        lineItems: [{ label: "Gas supply", amount: 54.55 }],
        detectedFees: [{ label: "Customer charge", amount: 23.6 }],
        rawData: { mockScenario: "utility_usage_available" },
      },
    ],
  },
  water: {
    category: "Water",
    providerName: "Durham Region Water",
    status: "connected",
    bills: [
      {
        externalBillId: "durham-water-2026-06",
        providerName: "Durham Region Water",
        category: "Water",
        amountDue: 231.38,
        currency: "CAD",
        dueDate: "2026-07-16",
        issueDate: "2026-06-16",
        billingPeriodStart: "2026-03-17",
        billingPeriodEnd: "2026-06-16",
        accountNumberMasked: "**** 4372",
        usageAmount: 42,
        usageUnit: "m3",
        previousBalance: 0,
        pdfAvailable: true,
        lineItems: [
          { label: "Water usage", amount: 138.82 },
          { label: "Wastewater service", amount: 92.56 },
        ],
        rawData: { mockScenario: "durham_water_success" },
      },
    ],
  },
  internet: {
    category: "Internet",
    providerName: "Rogers Internet",
    status: "connected",
    bills: [
      {
        externalBillId: "rogers-2026-06",
        providerName: "Rogers Internet",
        category: "Internet",
        amountDue: 96.04,
        currency: "CAD",
        dueDate: "2026-07-01",
        issueDate: "2026-06-11",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        accountNumberMasked: "**** 4419",
        previousBalance: 0,
        pdfAvailable: true,
        lineItems: [{ label: "Ignite Internet", amount: 89.99 }],
        detectedFees: [{ label: "Price increase detected", amount: 5 }],
        rawData: { mockScenario: "pdf_available_usage_unavailable" },
      },
    ],
  },
  "property tax": {
    category: "Property Tax",
    providerName: "Town of Pickering Property Tax",
    status: "no_bill_found",
    bills: [],
  },
  insurance: {
    category: "Home Insurance",
    providerName: "TD Insurance",
    status: "requires_user_action",
    bills: [],
  },
  other: {
    category: "Other",
    providerName: "Other Home Provider",
    status: "failed",
    bills: [],
  },
};

function keyFor(providerName: string, category?: string) {
  const text = `${providerName} ${category ?? ""}`.toLowerCase();

  if (text.includes("hydro") || text.includes("electric")) return "electricity";
  if (text.includes("enbridge") || text.includes("gas")) return "natural gas";
  if (text.includes("durham") || text.includes("water")) return "water";
  if (text.includes("rogers") || text.includes("internet")) return "internet";
  if (text.includes("tax")) return "property tax";
  if (text.includes("insurance")) return "insurance";
  if (text.includes("other")) return "other";

  return "internet";
}

function connectionIdFor(providerIdOrName: string, category?: string) {
  return `mock_${keyFor(providerIdOrName, category).replaceAll(" ", "_")}_${providerIdOrName.slice(0, 8)}`;
}

function profileFromConnection(connectionId: string) {
  const profileKey =
    Object.keys(providerProfiles).find((key) =>
      connectionId.includes(key.replaceAll(" ", "_"))
    ) ?? "internet";

  return providerProfiles[profileKey];
}

export class MockDeckClient implements DeckClient {
  async createConnectionSession(input: {
    providerId: string;
    providerName: string;
    category: string;
  }): Promise<DeckConnectionSession> {
    const profile = providerProfiles[keyFor(input.providerName, input.category)];
    const connectionId = connectionIdFor(input.providerId, input.category);

    return {
      connectionId,
      providerName: profile.providerName,
      status:
        profile.status === "requires_user_action"
          ? "requires_user_action"
          : "created",
      connectUrl: `/app/providers/${input.providerId}`,
      userActionMessage:
        profile.status === "requires_user_action"
          ? "Mock Deck needs the user to confirm account access."
          : undefined,
      metadata: { mock: true, category: profile.category },
    };
  }

  async getConnection(connectionId: string): Promise<DeckConnection> {
    const profile = profileFromConnection(connectionId);

    return {
      connectionId,
      providerName: profile.providerName,
      status: profile.status,
      metadata: { mock: true, category: profile.category },
    };
  }

  async createCredential(input: {
    providerId: string;
    providerName: string;
    category: string;
    userId: string;
    username: string;
    password: string;
  }): Promise<DeckCredential> {
    return {
      credentialId: `mock_cred_${input.providerId.slice(0, 8)}`,
      status: "verified",
      sourceId: `mock_source_${keyFor(input.providerName, input.category)}`,
      metadata: {
        mock: true,
        externalId: `${input.userId}:${input.providerId}`,
        usernameStored: Boolean(input.username),
        passwordStored: Boolean(input.password),
      },
    };
  }

  async syncConnection(connectionId: string): Promise<DeckConnection> {
    const profile = profileFromConnection(connectionId);
    const status = connectionId.includes("fail") ? "failed" : profile.status;

    return {
      connectionId,
      providerName: profile.providerName,
      status,
      lastSyncedAt: status === "connected" ? new Date().toISOString() : undefined,
      userActionMessage:
        status === "requires_user_action"
          ? "Deck needs the user to complete a confirmation step."
          : status === "no_bill_found"
            ? "Connected, but no current bill was found yet."
            : status === "failed"
              ? "Mock sync failed. Try again later."
              : undefined,
      metadata: { mock: true, category: profile.category },
    };
  }

  async submitInteraction(input: {
    connectionId: string;
    taskRunId: string;
    values: Record<string, string>;
  }): Promise<DeckConnection> {
    const profile = profileFromConnection(input.connectionId);

    return {
      connectionId: input.connectionId,
      providerName: profile.providerName,
      status: profile.status === "failed" ? "failed" : "connected",
      lastSyncedAt: new Date().toISOString(),
      metadata: {
        mock: true,
        category: profile.category,
        taskRunId: input.taskRunId,
        submittedFields: Object.keys(input.values),
      },
    };
  }

  async listBills(connectionId: string): Promise<DeckBill[]> {
    const profile = profileFromConnection(connectionId);
    return profile.status === "connected" ? profile.bills : [];
  }

  async getBillPdf(
    connectionId: string,
    externalBillId: string
  ): Promise<DeckBillPdf | null> {
    const bill = (await this.listBills(connectionId)).find(
      (item) => item.externalBillId === externalBillId
    );

    if (!bill?.pdfAvailable) {
      return null;
    }

    return {
      externalBillId,
      fileName: `${bill.providerName}-${bill.issueDate}.pdf`.replaceAll(" ", "-"),
      mimeType: "application/pdf",
      storagePath: `mock-deck/${connectionId}/${externalBillId}.pdf`,
      sizeBytes: 482_000,
    };
  }

  async disconnectConnection(connectionId: string): Promise<DeckConnection> {
    const profile = profileFromConnection(connectionId);

    return {
      connectionId,
      providerName: profile.providerName,
      status: "disconnected",
      metadata: { mock: true, category: profile.category },
    };
  }
}
