"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  className?: string;
  label: string;
  pendingLabel: string;
};

export function SubmitButton({
  className,
  label,
  pendingLabel,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel : label}
    </Button>
  );
}
