export type EzgbAccountUser = {
  _id?: string | null;
  username?: string | null;
  email?: string | null;
};

export type EzgbAccountChild = {
  _id: string;
  usagePointUUID: string | null;
  accountNumber: string | null;
  meterNumber: string | null;
  nickName?: string | null;
  retrieved?: string | null;
  intervalReadingCount?: number | string | null;
  usageSummaryCount?: number | string | null;
  latestBillDate: string | null;
  problemToken?: string | null;
};

export type EzgbAccountRow = {
  parent: {
    authorization: string;
    nickName: string | null;
    created: string | null;
    user: EzgbAccountUser;
  };
  child: EzgbAccountChild;
  custodian: {
    utilityName: string | null;
    humanName: string | null;
  };
};

export type EzgbAccountInfo = {
  child: EzgbAccountChild;
  user: EzgbAccountUser;
};

export type EzgbBillCharge = {
  description: string | null;
  amount: number | null;
};

export type EzgbBillReading = {
  reading_date?: string | null;
  previous_reading_date?: string | null;
  reading?: number | null;
  previous_reading?: number | null;
  usage?: number | null;
  adjusted_usage?: number | null;
  multiplier?: number | null;
  number_of_days?: number | null;
};

export type EzgbBillService = {
  unit?: string | null;
  totalUsage?: number | null;
  totalAdjustedUsage?: number | null;
  totalCost?: number | null;
  reading?: EzgbBillReading[];
  charges?: EzgbBillCharge[];
  chargeTotals?: Record<string, number>;
};

export type EzgbBill = {
  date: string | null;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  billing_period: string | null;
  amount_due: number | null;
  account_type: string | null;
  bill_number: string | number | null;
  currency: string | null;
  notes: unknown[];
  additional_data: EzgbBillCharge[];
  quality_of_reading: string | null;
  services: Record<string, EzgbBillService>;
  meterSummary_calculated?: {
    totalValue?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
};

export type EzgbBillData = {
  customerData: {
    mailingName: string | null;
    accountNumber: string | null;
    serviceAddress1: string | null;
    serviceAddress2: string | null;
    serviceAddressCity: string | null;
    serviceAddressProvince: string | null;
    serviceAddressPostalCode: string | null;
    meterNumber: string | null;
    serviceLocationId: string | null;
    meterResourceId: string | null;
    customerAgreementId: string | null;
  };
  utilityName: string | null;
  commodities: string[];
  bills: EzgbBill[];
};

export type EzgbWebhookEvent = {
  event: "account.data.received" | "webhook.test" | string;
  ezgbAccountId?: string;
  customerCode?: string | null;
  username?: string | null;
  userEmail?: string | null;
  accountNumber?: string | null;
  usagePointUUID?: string | null;
  latestBillDate?: string | null;
  dataAvailable?: string[];
  occurredAt?: string | null;
};
