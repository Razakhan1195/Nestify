import Link from "next/link";
import { cn } from "@/lib/utils";
export function FilterLinks({
  basePath,
  param = "view",
  selected = "all",
  options,
  query,
}: {
  basePath: string;
  param?: string;
  selected?: string;
  options: { value: string; label: string; count?: number }[];
  query?: string;
}) {
  return (
    <nav
      aria-label="Filter records"
      className="flex flex-wrap gap-1 border-b pb-2"
    >
      {options.map((option) => {
        const params = new URLSearchParams();
        if (option.value !== "all") params.set(param, option.value);
        if (query) params.set("q", query);
        return (
          <Link
            key={option.value}
            aria-current={selected === option.value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors hover:bg-muted",
              selected === option.value
                ? "bg-secondary font-semibold text-primary"
                : "text-muted-foreground",
            )}
            href={`${basePath}${params.size ? `?${params}` : ""}`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="text-xs tabular-nums">{option.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
