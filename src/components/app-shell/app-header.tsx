"use client";

import Link from "next/link";
import {
  Bell,
  CircleHelp,
  FileText,
  Hammer,
  Home,
  PackageCheck,
  Plus,
  ReceiptText,
  Wrench,
} from "lucide-react";

import { MobileNav } from "@/components/app-shell/app-nav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

type HeaderNotification = {
  body: string | null;
  created_at: string;
  href: string | null;
  id: string;
  title: string;
};

const quickAddItems = [
  {
    description: "Track a due date, amount, or renewal",
    href: "/app/bills#manual-bill",
    icon: ReceiptText,
    title: "Bill or reminder",
  },
  {
    description: "Save a policy, receipt, manual, or PDF",
    href: "/app/documents#add-document",
    icon: FileText,
    title: "Home record",
  },
  {
    description: "Schedule upkeep or a seasonal task",
    href: "/app/maintenance#add-task",
    icon: Wrench,
    title: "Maintenance task",
  },
  {
    description: "Track an issue, quote, or contractor follow-up",
    href: "/app/repairs#log-repair",
    icon: Hammer,
    title: "Repair",
  },
  {
    description: "Save a system, appliance, model, or warranty date",
    href: "/app/appliances#add-item",
    icon: PackageCheck,
    title: "Appliance or system",
  },
  {
    description: "Update details that make recommendations useful",
    href: "/app/home",
    icon: Home,
    title: "Home profile",
  },
];

export function AppHeader({
  email,
  notifications = [],
}: {
  email?: string | null;
  notifications?: HeaderNotification[];
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] flex-1 shrink-0 items-center gap-2 bg-background/78 px-4 backdrop-blur-xl sm:px-6">
      <div className="lg:hidden">
        <MobileNav />
      </div>
      <Separator className="hidden h-5 sm:block lg:hidden" orientation="vertical" />
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-sm font-semibold leading-tight md:text-base">
          Nestify
        </p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          What needs attention, what changed, and what to do next.
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <Button asChild className="hidden sm:inline-flex" size="sm" variant="ghost">
          <Link href="/app/assistant">
            <CircleHelp className="size-4" />
            AI Assistant
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="hidden sm:inline-flex" size="sm" variant="outline">
              <Plus className="size-4" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Add to your home</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {quickAddItems.map((item) => {
              const Icon = item.icon;

              return (
                <DropdownMenuItem asChild key={item.href}>
                  <Link className="flex items-start gap-3 py-2" href={item.href}>
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Open notifications" size="icon" variant="ghost">
              <Bell className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>What needs attention</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length ? (
              notifications.map((notification) => (
                <DropdownMenuItem asChild key={notification.id}>
                  <Link
                    className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
                    href={notification.href ?? "/app/attention"}
                  >
                    <span className="font-medium">{notification.title}</span>
                    {notification.body ? (
                      <span className="text-xs text-muted-foreground">
                        {notification.body}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                Start with your attention queue, then review due bills and care tasks.
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/attention">Open attention queue</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/app/bills">Bills due soon</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/app/maintenance">Maintenance due</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {email ? (
          <span className="hidden max-w-44 truncate text-xs text-muted-foreground xl:block">
            {email}
          </span>
        ) : null}
      </div>
    </header>
  );
}
