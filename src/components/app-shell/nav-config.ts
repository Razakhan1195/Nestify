import {
  FileText,
  Hammer,
  LayoutDashboard,
  PackageCheck,
  Plug,
  ReceiptText,
  Refrigerator,
  Settings,
  ShieldCheck,
  Sparkles,
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
        icon: LayoutDashboard,
        title: "Dashboard",
      },
      {
        description: "Connect services that power your monthly report",
        href: "/app/providers",
        icon: Plug,
        title: "Providers",
      },
    ],
  },
  {
    label: "Stay on top of the home",
    items: [
      {
        description: "Recurring upkeep and seasonal tasks",
        href: "/app/maintenance",
        icon: Wrench,
        title: "Maintenance",
      },
      {
        description: "Active fixes, quotes, and contractors",
        href: "/app/repairs",
        icon: Hammer,
        title: "Repairs",
      },
      {
        description: "Due dates, costs, and renewals",
        href: "/app/bills",
        icon: ReceiptText,
        title: "Bills & Reminders",
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
        title: "Documents",
      },
      {
        description: "Coverage and expiry tracking",
        href: "/app/warranties",
        icon: ShieldCheck,
        title: "Warranties",
      },
      {
        description: "Everything in your home and its history",
        href: "/app/appliances",
        icon: Refrigerator,
        title: "Appliances & Systems",
      },
      {
        description: "Home profile, systems, and history",
        href: "/app/home",
        icon: PackageCheck,
        title: "Home",
      },
    ],
  },
  {
    label: "Help",
    items: [
      {
        description: "Ask about your home and get safe next steps",
        href: "/app/assistant",
        icon: Sparkles,
        title: "AI Assistant",
      },
      {
        description: "Home profile and preferences",
        href: "/app/settings",
        icon: Settings,
        title: "Settings",
      },
    ],
  },
];

export const appNavItems = appNavSections.flatMap((section) => section.items);
