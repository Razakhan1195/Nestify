"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleHelp, Plus } from "lucide-react";

import { MobileNav } from "@/components/app-shell/app-nav";
import { appNavItems } from "@/components/app-shell/nav-config";
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

export function AppHeader({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const current =
    appNavItems.find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/app" && pathname.startsWith(`${item.href}/`))
    ) ?? appNavItems[0];

  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] flex-1 shrink-0 items-center gap-2 bg-background/78 px-4 backdrop-blur-xl sm:px-6">
      <div className="lg:hidden">
        <MobileNav />
      </div>
      <Separator className="hidden h-5 sm:block lg:hidden" orientation="vertical" />
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-sm font-semibold leading-tight md:text-base">
          {current.title}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {current.description}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <Button asChild className="hidden sm:inline-flex" size="sm" variant="ghost">
          <Link href="/app/assistant">
            <CircleHelp className="size-4" />
            AI Assistant
          </Link>
        </Button>

        <Button asChild className="hidden sm:inline-flex" size="sm" variant="outline">
          <Link href="/app/bills#manual-bill">
            <Plus className="size-4" />
            Add
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Open notifications" size="icon" variant="ghost">
              <Bell className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Home updates</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-3 text-sm text-muted-foreground">
              Important bill, record, and maintenance updates will appear here.
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app">Open dashboard</Link>
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
