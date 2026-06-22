import {
  CircleHelp,
  FileText,
  Home,
  PackageCheck,
  Plug,
  ReceiptText,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
};

export type AppNavSection = {
  items: AppNavItem[];
  label: string;
};

export const appNavSections: AppNavSection[] = [
  {
    label: "Overview",
    items: [
      {
        description: "What needs you this week",
        href: "/app",
        icon: Home,
        title: "Dashboard",
      },
    ],
  },
  {
    label: "Home operations",
    items: [
      {
        description: "Connect services that power your monthly report",
        href: "/app/providers",
        icon: Plug,
        title: "Providers",
      },
      {
        description: "Due dates, costs, PDFs, and renewals",
        href: "/app/bills",
        icon: ReceiptText,
        title: "Bills & Reminders",
      },
      {
        description: "Recurring upkeep, repairs, and seasonal tasks",
        href: "/app/maintenance",
        icon: Wrench,
        title: "Maintenance",
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        description: "Policies, receipts, manuals, and proof",
        href: "/app/documents",
        icon: FileText,
        title: "Vault",
      },
      {
        description: "Appliances, systems, warranties, and assets",
        href: "/app/inventory",
        icon: PackageCheck,
        title: "Inventory",
      },
      {
        description: "Home profile, systems, and history",
        href: "/app/settings",
        icon: Settings,
        title: "Home",
      },
    ],
  },
  {
    label: "Help",
    items: [
      {
        description: "Get safe next steps for household issues",
        href: "/app/help",
        icon: CircleHelp,
        title: "Ask Nestify",
      },
    ],
  },
];

export const appNavItems = appNavSections.flatMap((section) => section.items);
