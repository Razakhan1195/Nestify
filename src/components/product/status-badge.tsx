import { Badge } from "@/components/ui/badge";

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const label = value?.replaceAll("_", " ") ?? "not set";
  const normalized = value ?? "";
  const variant =
    normalized.includes("failed") ||
    normalized.includes("overdue") ||
    normalized.includes("urgent")
      ? "destructive"
      : normalized.includes("paid") ||
          normalized.includes("healthy") ||
          normalized.includes("completed")
        ? "secondary"
        : "outline";

  return <Badge variant={variant}>{label}</Badge>;
}
