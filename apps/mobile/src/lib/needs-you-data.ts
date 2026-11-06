import { presentAttentionItem } from "./attention-presentation";
import { attentionScreen } from "./screen-state";
import { apiGet, apiPost } from "@/lib/api";
import type { AttentionItem } from "@/lib/home-data";

export type NeedsYouSection = {
  key: "now" | "soon" | "later";
  title: string;
  detail: string;
  items: AttentionItem[];
};

export type NeedsYouPayload =
  | { needsOnboarding: true }
  | {
      needsOnboarding?: undefined;
      homeId: string;
      count: number;
      sections: NeedsYouSection[];
    };

export function fetchNeedsYou(force = true) {
  return attentionScreen.load(() => apiGet<NeedsYouPayload>("/api/mobile/v1/needs-you", { timeoutMs: 12000 }).then(value => value.needsOnboarding ? value : {...value, sections: value.sections.map(section => ({...section, items: section.items.map(presentAttentionItem)}))}), force);
}


export type AttentionDismissal = { homeId: string; keys: string[]; dismissedAt: string };
export async function dismissAttention(homeId: string, keys: string[], expectedUserId: string) {
  const result = await apiPost<Omit<AttentionDismissal, "homeId">>("/api/mobile/v1/needs-you", { action: "dismiss", homeId, keys }, { timeoutMs: 15000, expectedUserId });
  return { ...result, homeId };
}
export function restoreAttention(dismissal: AttentionDismissal, expectedUserId: string) {
  return apiPost<{ keys: string[] }>("/api/mobile/v1/needs-you", { action: "restore", homeId: dismissal.homeId, keys: dismissal.keys, dismissedAt: dismissal.dismissedAt }, { timeoutMs: 15000, expectedUserId });
}
