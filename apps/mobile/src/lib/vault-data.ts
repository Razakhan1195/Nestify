import { vaultScreen } from "./screen-state";
import { apiGet } from "@/lib/api";

export type VaultDocument = {
  id: string;
  title: string;
  notes: string | null;
  document_type: string | null;
  file_name: string | null;
  issued_on: string | null;
  expires_on: string | null;
  source: string | null;
  sourceLabel?: string | null;
  created_at: string;
  category: string;
  hasFile: boolean;
};

export type VaultItem = {
  id: string;
  name: string;
  category: string | null;
  room_or_area: string | null;
  brand: string | null;
  model_number: string | null;
  warranty_expires_on: string | null;
  status: string | null;
  created_at: string;
  warrantyStatus: "none" | "active" | "expiring" | "expired";
};
export type VaultPayload =
  | { needsOnboarding: true }
  | {
      needsOnboarding?: undefined;
      documents: VaultDocument[];
      items: VaultItem[];
      summary: {
        recordsCount: number;
        itemsCount: number;
        warrantyCount: number;
        expiringSoonCount: number;
      };
    };

export function fetchVault(force = true) {
  return vaultScreen.load(() => apiGet<VaultPayload>("/api/mobile/v1/vault"), force);
}

export function formatVaultDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}