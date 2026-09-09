import { cn } from "@/lib/utils";

/** A folded ribbon: one continuous place for the pieces of everyday life. */
export function RezleeMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-8 shrink-0", className)}
    >
      <path
        d="M7 27V6h10a7 7 0 0 1 0 14h-3l11 7"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 13h10"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RezleeLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2.5 text-primary", className)}
    >
      <RezleeMark />
      {!compact && (
        <span className="text-[1.45rem] font-semibold tracking-[-0.055em]">
          rezlee
        </span>
      )}
      <span className="sr-only">{compact ? "Rezlee" : ""}</span>
    </span>
  );
}
