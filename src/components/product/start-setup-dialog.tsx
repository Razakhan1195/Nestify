"use client";

import Link from "next/link";
import { FileText, PackageCheck, ReceiptText, RotateCw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const setupOptions = [
  {
    action: "Add bill",
    description: "Track rent, utilities, internet, insurance, or any recurring household cost.",
    href: "/app/bills#manual-bill",
    icon: ReceiptText,
    title: "Bill or rent",
  },
  {
    action: "Add document",
    description: "Save leases, policies, receipts, warranties, manuals, and PDFs.",
    href: "/app/documents#add-record",
    icon: FileText,
    title: "Document",
  },
  {
    action: "Add reminder",
    description: "Remember chores, repairs, renewals, and recurring care tasks.",
    href: "/app/maintenance#add-reminder",
    icon: PackageCheck,
    title: "Reminder",
  },
  {
    action: "Connect provider",
    description: "Connect supported providers to bring in bills and PDFs automatically when available.",
    href: "/app/providers",
    icon: RotateCw,
    title: "Provider automation",
  },
];

export function StartSetupDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          Start setup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose your first step</DialogTitle>
          <DialogDescription>
            Start with one thing. You can add the rest later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          {setupOptions.map((option, index) => {
            const Icon = option.icon;

            return (
              <div
                className="grid gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/35 sm:grid-cols-[2rem_1fr_auto] sm:items-center"
                key={option.title}
              >
                <div className="flex size-8 items-center justify-center rounded-xl bg-muted text-primary">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="font-medium">{option.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {option.description}
                  </p>
                  {option.title === "Provider automation" ? (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Optional
                    </p>
                  ) : null}
                </div>
                <Button asChild size="sm" variant={index === 0 ? "default" : "outline"}>
                  <Link href={option.href}>{option.action}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
