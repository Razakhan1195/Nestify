import type { ProviderDirectoryEntry } from "./provider-directory";
import { apiGet, apiPost } from "@/lib/api";

export type ProviderInteractionField = {
  name: string;
  label: string;
  type: string;
  options?: Array<{
    value: string;
    label: string;
  }>;
};

export type ProviderInteraction = {
  type?: string;
  message?: string;
  fields?: ProviderInteractionField[];
};

export type ProviderConnectionItem = {
  id: string;
  name: string;
  importProgress?: {listedStatements?:number|null;missingBillDates?:string[];authenticated?:boolean;status:string;phase:string;saved:number;originals:number;completedWindows:number;totalWindows:number;sinceDate:string;untilDate:string;message:string;updatedAt:string;verificationExpiresAt:string|null} | null;
  adapter?: "ezgb" | "deck";
  reconnectAvailable?: boolean;
  disconnectPending?: boolean;
  connectionPaused?: boolean;
  registryProviderId: string | null;
  accountNumber: string | null;
  category: string;
  connectionStatus: string;
  deckConnectionStatus: string | null;
  healthStatus: string;
  syncStatus: string | null;
  syncFailureReason: string | null;
  requiresUserAction: boolean;
  userActionMessage: string | null;
  lastSuccessfulSyncAt: string | null;
  nextScheduledSyncAt: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  brandDomain: string | null;
  syncMode: "balance" | "bill";
  currentBalance: number | null;
  balanceCurrency: string | null;
  balanceUpdatedAt: string | null;
  latestRun: {
    challengeId?: string | null;
    status?: string;
    message?: string | null;
    interaction?: ProviderInteraction | null;
    metadata?: {
      billCount?: number;
      incompleteCount?: number;
    } | null;
    created_at?: string;
    updated_at?: string;
  } | null;
  latestBill: {
    id: string;
    name: string;
    amount: string | number | null;
    currency: string | null;
    due_date: string | null;
    status: string | null;
    created_at: string;
  } | null;
};
export type ProviderCatalogItem = {
  existingOnly?: boolean;
  documentAlternative?: boolean;
  searchAliases?: string[];
  connectionNote?: string | null;
  hostedAuth?: boolean;
  telecomHistory?: boolean;
  connectionAvailable?: boolean;
  id: string;
  name: string;
  utility_type: string;
  province_region: string | null;
  website_url: string | null;
  status: string;
  logo_url: string | null;
  brand_domain: string | null;
  deck_mapping_status: string | null;
  deck_source_id: string | null;
  deck_agent_id: string | null;
  deck_task_id: string | null;
};

export type { ProviderDirectoryEntry } from "./provider-directory";

export type ProviderConnectionsPayload =
  | { needsOnboarding: true }
  | {
      needsOnboarding?: undefined;
      deckTesting?: boolean;
      directory?: ProviderDirectoryEntry[];
      province?: string | null;
      catalog: ProviderCatalogItem[];
      providers: ProviderConnectionItem[];
    };

export type ConnectProviderInput = {
  category: string;
  providerName: string;
  registryProviderId?: string;
  websiteUrl: string;
  username: string;
  password: string;
  accountNumber?: string;
};

export type ProviderActionResult = {
  ok: true;
  providerId?: string;
  status: string;
  message?: string;
  interaction?: ProviderInteraction | null;
};

export function fetchProviderConnections() {
  return apiGet<ProviderConnectionsPayload>("/api/mobile/v1/providers?hostedAuthVersion=2");
}

export function fetchProviderConnection(providerId: string) {
  return apiGet<{ provider: ProviderConnectionItem }>(
    `/api/mobile/v1/providers/${providerId}?hostedAuthVersion=2`,
  );
}

export function connectProviderRequest(input: ConnectProviderInput) {
  return apiPost<ProviderActionResult>("/api/mobile/v1/providers", input);
}
export function refreshProviderRequest(providerId: string) {
  return apiPost<ProviderActionResult>(
    `/api/mobile/v1/providers/${providerId}/sync`,
    {},
  );
}

export function backfillProviderBillsRequest(
  providerId: string,
  input: {
    sinceDate: string;
    untilDate?: string;
    accountId?: string;
  },
) {
  return apiPost<ProviderActionResult>(
    `/api/mobile/v1/providers/${providerId}/backfill`,
    input,
  );
}

export function submitProviderInteractionRequest(
  providerId: string,
  values: Record<string, string | boolean>,
  challengeId?: string,
) {
  return apiPost<ProviderActionResult>(
    `/api/mobile/v1/providers/${providerId}/interaction`,
    { values, challengeId },
  );
}

export function disconnectProviderRequest(providerId: string) {
  return apiPost<ProviderActionResult>(
    `/api/mobile/v1/providers/${providerId}/disconnect`,
    {},
  );
}

export const providerCategories = [
  "Electricity",
  "Natural Gas",
  "Water",
  "Internet",
  "Property Tax",
  "Home Insurance",
  "Security",
  "Water Heater Rental",
  "Waste",
  "Other service",
] as const;
