"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = ComponentProps<typeof Button> & {
  label: string;
  pendingLabel: string;
};

export function SubmitButton({
  children,
  className,
  label,
  pendingLabel,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} className={className} disabled={pending || props.disabled} type="submit">
      {pending ? null : children}
      {pending ? pendingLabel : label}
    </Button>
  );
}
