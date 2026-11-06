export const deckStatuses = [
  "created",
  "requires_user_action",
  "connecting",
  "connected",
  "syncing",
  "failed",
  "needs_attention",
  "disconnected",
  "no_bill_found",
  "mfa_required",
  "credentials_expired",
] as const;

export type DeckStatus = (typeof deckStatuses)[number];

export type DeckConnectionSession = {
  connectionId: string;
  providerName: string;
  status: DeckStatus;
  connectUrl?: string;
  userActionMessage?: string;
  metadata?: Record<string, unknown>;
};

export type DeckConnection = {
  connectionId: string;
  providerName: string;
  status: DeckStatus;
  lastSyncedAt?: string;
  userActionMessage?: string;
  metadata?: Record<string, unknown>;
};

export type DeckBill = {
  externalBillId: string;
  providerName: string;
  category: string;
  statementAmount?: number | null;
  amountDue: number | null;
  amountPaid?: number | null;
  paymentDate?: string | null;
  autopayEnrolled?: boolean | null;
  autopayScheduledAmount?: number | null;
  autopayScheduledDate?: string | null;
  autopayPaymentMethod?: string | null;
  currency: string;
  dueDate: string | null;
  issueDate: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  accountNumberMasked: string | null;
  usageAmount?: number;
  usageUnit?: string;
  previousBalance?: number;
  paymentStatus?: string | null;
  pdfAvailable: boolean;
  lineItems?: Array<{
    label: string;
    amount: number;
  }>;
  detectedFees?: Array<{
    label: string;
    amount: number;
  }>;
  rawData: Record<string, unknown>;
};

export type DeckBillPdf = {
  externalBillId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  sizeBytes: number;
};

export type DeckInteractionField = {
  label: string;
  name: string;
  type: string;
};

export type DeckInteraction = {
  fields: DeckInteractionField[];
  message: string;
  type: string;
};

export type DeckCredential = {
  credentialId: string;
  status: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
};

export type DeckClient = {
  createConnectionSession(input: {
    providerId: string;
    providerName: string;
    category: string;
  }): Promise<DeckConnectionSession>;
  createCredential(input: {
    providerId: string;
    providerName: string;
    category: string;
    userId: string;
    username: string;
    password: string;
  }): Promise<DeckCredential>;
  getConnection(connectionId: string): Promise<DeckConnection>;
  syncConnection(
    connectionId: string,
    input?: { credentialId?: string; taskRunId?: string }
  ): Promise<DeckConnection>;
  submitInteraction(input: {
    connectionId: string;
    taskRunId: string;
    values: Record<string, string>;
  }): Promise<DeckConnection>;
  listBills(connectionId: string): Promise<DeckBill[]>;
  getBillPdf(connectionId: string, externalBillId: string): Promise<DeckBillPdf | null>;
  disconnectConnection(connectionId: string): Promise<DeckConnection>;
};
