import { apiGet, apiPatch, apiPost } from "@/lib/api";
export const roadmapStatuses = [
 { value: "all", label: "All ideas" }, { value: "under_review", label: "Under review" },
 { value: "planned", label: "Planned" }, { value: "in_progress", label: "In progress" },
 { value: "shipped", label: "Shipped" }, { value: "not_planned", label: "Not planned" },
] as const;
export const roadmapCategories = [
 { value: "bills", label: "Bills" }, { value: "records", label: "Records" },
 { value: "care", label: "Care" }, { value: "household", label: "Household" },
 { value: "realtors", label: "Realtors" }, { value: "other", label: "Something else" },
] as const;
export type RoadmapStatus = typeof roadmapStatuses[number]["value"];
export type RoadmapItem = {
 id: string; title: string; description: string; category: string;
 visibility: "pending" | "public" | "hidden"; status: Exclude<RoadmapStatus, "all">;
 priority: "none" | "next" | "later"; response: string; decidedAt: string | null;
 createdAt: string; updatedAt: string; responseDueAt: string;
 upvotes: number; downvotes: number; score: number; myVote: -1 | 0 | 1; mine: boolean; canBlock?: boolean;
};
export type RoadmapList = { generatedAt: string; items: RoadmapItem[]; total: number; page: number };
export function fetchRoadmap(userId: string, query: { mine: boolean; status: string; sort: string; search: string; page: number }) {
 return apiGet<RoadmapList>("/api/mobile/v1/roadmap?" + new URLSearchParams({ ...query, mine: String(query.mine), page: String(query.page) }), { timeoutMs: 12000, expectedUserId: userId });
}
export function voteOnRoadmap(userId: string, id: string, value: -1 | 0 | 1) {
 return apiPatch<Pick<RoadmapItem, "id" | "myVote" | "upvotes" | "downvotes" | "score">>("/api/mobile/v1/roadmap", { id, value }, { timeoutMs: 12000, expectedUserId: userId });
}
export function submitRoadmapIdea(userId: string, idea: { id: string; title: string; description: string; category: string; sharePublicly: true }) {
 return apiPost<{ id: string }>("/api/mobile/v1/roadmap", idea, { timeoutMs: 15000, expectedUserId: userId });
}

export function updateRoadmapSafety(userId: string, action: "hide" | "block" | "report" | "reset", id?: string, reason?: string) {
 return apiPatch<{ ok: true }>("/api/mobile/v1/roadmap", { action, id, reason }, { timeoutMs: 12000, expectedUserId: userId });
}
