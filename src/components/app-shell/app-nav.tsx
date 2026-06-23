"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { appNavSections } from "@/components/app-shell/nav-config";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavLinks({ onMobile }: { onMobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={cn("grid gap-5", onMobile && "px-4 pb-4")}>
      {appNavSections.map((section) => (
        <div className="grid gap-1.5" key={section.label}>
          <p className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
            {section.label}
          </p>
          <div className="grid gap-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
              const link = (
                <Link
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/68 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                    isActive &&
                      "bg-primary/10 text-sidebar-foreground ring-1 ring-primary/10 hover:bg-primary/10 hover:text-sidebar-foreground"
                  )}
                  href={item.href}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70")} />
                  <span className="truncate">{item.title}</span>
                </Link>
              );

              return onMobile ? (
                <SheetClose asChild key={item.href}>
                  {link}
                </SheetClose>
              ) : (
                <div key={item.href}>{link}</div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function DesktopNav() {
  return <NavLinks />;
}

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button aria-label="Open navigation" size="icon" variant="ghost">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-left">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
              N
            </span>
            <span>
              <span className="block">Nestify</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Household command center
              </span>
            </span>
          </SheetTitle>
        </SheetHeader>
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          Know what is due, what changed, what needs attention, and what to do next.
        </p>
        <NavLinks onMobile />
      </SheetContent>
    </Sheet>
  );
}
