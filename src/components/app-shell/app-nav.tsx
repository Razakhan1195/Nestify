"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { appNavItems } from "@/components/app-shell/nav-items";
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
    <nav className={cn("grid gap-1", onMobile && "px-4 pb-4")}>
      {appNavItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
        const link = (
          <Link
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive &&
                "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
            )}
            href={item.href}
          >
            <Icon className="size-4" />
            {item.title}
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
        <Button aria-label="Open navigation" size="icon" variant="outline">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>Dwellwise</SheetTitle>
        </SheetHeader>
        <p className="px-4 pb-3 text-sm text-muted-foreground">
          Your home costs, tasks, and documents in one calm place.
        </p>
        <NavLinks onMobile />
      </SheetContent>
    </Sheet>
  );
}
