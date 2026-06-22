import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  className,
}: {
  checked?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-checked={checked}
      className={cn(
        "flex size-4 items-center justify-center rounded border border-input bg-background text-primary",
        checked && "border-primary bg-primary text-primary-foreground",
        className
      )}
      role="checkbox"
    >
      {checked ? <Check className="size-3" /> : null}
    </span>
  );
}
