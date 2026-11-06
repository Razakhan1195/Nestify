import { apiDelete, apiGet, apiPost } from "@/lib/api";

export type HouseholdMember = {
  id: string;
  display_name: string;
  email: string | null;
  relationship: string | null;
  role: "owner" | "member";
  status: "local" | "invited" | "active";
  linked_user_id: string | null;
  created_at: string;
  invite_sent_at?: string | null;
  inviteExpired?: boolean;
  accepted_at?: string | null;
  phoneInvite?: { phone: string; request_user_id: string | null; request_email: string | null; requested_at: string | null; accepted_at: string | null; expires_at: string } | null;
};

export type HouseholdPayload =
  | { needsOnboarding: true }
  | { available: false; home: { id: string; nickname: string } }
  | {
      available: true;
      phoneInvitesAvailable?: boolean;
      home: { id: string; nickname: string };
      members: HouseholdMember[];
      accessRole?: "owner" | "member";
      summary: { memberCount: number; assignedOpenCount: number; activeRotationCount: number };
      rotations: { id: string; title: string; enabled: boolean; created_at: string }[];
    };

export function fetchHousehold() {
  return apiGet<HouseholdPayload>("/api/mobile/v1/household", { timeoutMs: 15000 });
}
export function addHouseholdPerson(input: {
  expensePersonId?: string;
  displayName: string;
  email: string;
  relationship?: string;
}) {
  return apiPost<{ member: HouseholdMember; invitationSent: true }>("/api/mobile/v1/household", input);
}

export function removeHouseholdPerson(id: string) {
  return apiDelete<{ ok: true }>(`/api/mobile/v1/household/${id}`);
}
