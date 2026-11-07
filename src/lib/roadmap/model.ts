import { z } from "zod";
export const roadmapStatuses = ["under_review", "planned", "in_progress", "shipped", "not_planned"] as const;
export const roadmapCategories = ["bills", "records", "care", "household", "realtors", "other"] as const;
export const statusLabels: Record<string, string> = { under_review: "Under review", planned: "Planned", in_progress: "In progress", shipped: "Shipped", not_planned: "Not planned" };
export const categoryLabels: Record<string, string> = { bills: "Bills", records: "Records", care: "Care", household: "Household", realtors: "Realtors", other: "Something else" };
export const suggestionInput = z.object({
 id: z.string().uuid(), title: z.string().trim().min(6).max(100),
 description: z.string().trim().min(20).max(2000),
 category: z.enum(roadmapCategories), sharePublicly: z.literal(true),
});
export const voteInput = z.object({ id: z.string().uuid(), value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });
export const listInput = z.object({
 mine: z.enum(["true", "false"]).default("false"), status: z.enum(["all", ...roadmapStatuses]).default("all"),
 sort: z.enum(["top", "newest"]).default("top"), search: z.string().trim().max(120).default(""),
 page: z.coerce.number().int().min(0).max(1000).default(0),
});
export type RoadmapItem = {
 id: string; title: string; description: string; category: string;
 visibility: "pending" | "public" | "hidden"; status: typeof roadmapStatuses[number];
 priority: "none" | "next" | "later"; response: string; decidedAt: string | null;
 createdAt: string; updatedAt: string; responseDueAt: string;
 upvotes: number; downvotes: number; score: number; myVote: -1 | 0 | 1; mine: boolean; canBlock?: boolean;
};
export type RoadmapList = { generatedAt: string; items: RoadmapItem[]; total: number; page: number };
export function roadmapError(code?: string) {
 if (code === "42501") return { status: 401, error: "Sign in to share ideas and vote." };
 if (code === "P0001") return { status: 429, error: "You’ve shared five ideas today. You can add another tomorrow." };
 if (code === "P0002") return { status: 404, error: "This idea is no longer available. Refresh the roadmap." };
 if (code === "22023") return { status: 409, error: "This submission changed. Check Your ideas before trying again." };
 return { status: 503, error: "We couldn’t confirm that change. Please retry the same action." };
}
