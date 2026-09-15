"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, MoreHorizontal, ReceiptText, Wrench } from "lucide-react";

import { appNavSections } from "@/components/app-shell/nav-config";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const primaryTabs = [
  { title: "Home", href: "/app", icon: LayoutDashboard },
  { title: "Bills", href: "/app/bills", icon: ReceiptText },
  { title: "Vault", href: "/app/documents", icon: FileText },
  { title: "Care", href: "/app/maintenance", icon: Wrench },
];

function isActiveHref(pathname: string, href: string) {
  return pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`));
}

function MoreSheet({ isMoreActive }: { isMoreActive: boolean }) {
  const promotedHrefs = new Set(primaryTabs.map((tab) => tab.href));
  const moreSections = appNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !promotedHrefs.has(item.href)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Open more navigation options"
          className={cn(
            "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[0.68rem] font-medium transition-colors",
            isMoreActive
              ? "text-primary"
              : "text-muted-foreground active:bg-muted/60",
          )}
          type="button"
        >
          <MoreHorizontal className="size-5" />
          <span>More</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left">More</SheetTitle>
        </SheetHeader>
        <nav className="grid gap-5 px-4 pb-6">
          {moreSections.map((section) => (
            <div className="grid gap-1.5" key={section.label}>
              <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {section.label}
              </p>
              <div className="grid gap-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        className="group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted/60"
                        href={item.href}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground/80" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const isAnyPrimaryActive = primaryTabs.some((tab) =>
    isActiveHref(pathname, tab.href),
  );

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 backdrop-blur-xl lg:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex h-[var(--bottom-nav-height)] items-stretch justify-between gap-1 px-2">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = isActiveHref(pathname, tab.href);

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[0.68rem] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:bg-muted/60",
              )}
              href={tab.href}
              key={tab.href}
            >
              <Icon className="size-5" />
              <span>{tab.title}</span>
            </Link>
          );
        })}
        <MoreSheet isMoreActive={!isAnyPrimaryActive} />
      </div>
    </nav>
  );
}
