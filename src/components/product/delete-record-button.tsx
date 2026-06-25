"use client";

import { Trash2 } from "lucide-react";

import {
  deleteDocumentRecord,
  deleteInventoryItem,
  deleteMaintenanceTask,
  deleteManualBill,
  deleteProject,
  deleteRepairIssue,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeleteRecordKind =
  | "document"
  | "inventory"
  | "maintenance"
  | "manual-bill"
  | "project"
  | "repair-issue";

const deleteActions = {
  document: deleteDocumentRecord,
  inventory: deleteInventoryItem,
  maintenance: deleteMaintenanceTask,
  "manual-bill": deleteManualBill,
  project: deleteProject,
  "repair-issue": deleteRepairIssue,
} satisfies Record<DeleteRecordKind, (formData: FormData) => Promise<void>>;

const confirmCopy = {
  document: "Remove this document from your Vault?",
  inventory: "Remove this item from your home inventory?",
  maintenance: "Remove this maintenance task?",
  "manual-bill": "Remove this manual bill?",
  project: "Remove this repair record?",
  "repair-issue": "Remove this household issue?",
} satisfies Record<DeleteRecordKind, string>;

type DeleteRecordButtonProps = {
  className?: string;
  iconOnly?: boolean;
  id: string;
  kind: DeleteRecordKind;
  label?: string;
  returnPath: string;
};

export function DeleteRecordButton({
  className,
  iconOnly = false,
  id,
  kind,
  label = "Delete",
  returnPath,
}: DeleteRecordButtonProps) {
  const action = deleteActions[kind];

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmCopy[kind])) {
          event.preventDefault();
        }
      }}
    >
      <input name="record_id" type="hidden" value={id} />
      <input name="return_path" type="hidden" value={returnPath} />
      <Button
        aria-label={label}
        className={cn(
          iconOnly ? "text-destructive" : "gap-1 text-destructive",
          className
        )}
        size={iconOnly ? "icon-sm" : "sm"}
        type="submit"
        variant="ghost"
      >
        <Trash2 className="size-3.5" />
        {iconOnly ? null : label}
      </Button>
    </form>
  );
}
