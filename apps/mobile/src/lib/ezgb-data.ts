import type { EzgbConnectionStatus } from "./ezgb-progress";
import { apiGet, apiPost } from "@/lib/api";

export type EzgbAuthorizationPayload = {
  userIdentifier: string;
  authorizationUrl: string;
  successUrl: string;
  errorUrl: string;
  browserReturnReady?: boolean;
  connectionTrackingReady?: boolean;
  connectionIntent?: string;
};

export type EzgbSyncPayload = {
  ok: true;
  cancelled?: boolean;
  ready: boolean;
  jobId: string | null;
  status: "idle" | "queued" | "running" | "succeeded" | "waiting" | "failed";
  stats: {
    accountsSeen: number;
    integrationsConnected: number;
    billsImported: number;
    quarantined: number;
    errors: number;
    intervalsReceived?: number;
    intervalAccountsPending?: number;
    intervalErrors?: number;
  };
  error?: string | null;
  connection?: EzgbConnectionStatus;
};

export function fetchEzgbAuthorization(options?: { connect: boolean; utilityName?: string; checkOnly?: boolean }) {
  const query = options?.connect ? "?connect=1" + (options.utilityName ? "&utilityName=" + encodeURIComponent(options.utilityName) : "") + (options.checkOnly ? "&checkOnly=1" : "") : "";
  return apiGet<EzgbAuthorizationPayload>("/api/mobile/v1/ezgb/authorization" + query);
}

export function syncEzgb(expectedUserIdentifier?: string, connectionIntent?: string) {
  return apiPost<EzgbSyncPayload>("/api/mobile/v1/ezgb/sync", {
    ...(expectedUserIdentifier ? { expectedUserIdentifier } : {}),
    ...(connectionIntent ? { connectionIntent } : {}),
  });
}
export function retryEzgbConnection(jobId: string) {
  return apiPost<EzgbSyncPayload>("/api/mobile/v1/ezgb/sync", { retryJobId: jobId });
}

export function fetchEzgbSyncStatus(jobId?: string) {
  return apiGet<EzgbSyncPayload>(
    jobId ? `/api/mobile/v1/ezgb/sync?job=${encodeURIComponent(jobId)}` : "/api/mobile/v1/ezgb/sync",
  );
}

export function cancelEzgbCheck(jobId: string) {
  return apiPost<EzgbSyncPayload>("/api/mobile/v1/ezgb/sync", { cancelJobId: jobId });
}
