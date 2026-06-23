import {
  FileText,
  Hammer,
  LayoutDashboard,
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
    ],
  },
  {
    label: "Stay on top of your home",
    items: [
      {
        description: "Due dates, costs, and renewals",
        href: "/app/bills",
        icon: ReceiptText,
        title: "Bills & Reminders",
      },
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
    ],
  },
  {
    label: "Assistant & settings",
    items: [
      {
        description: "Ask about your home and get safe next steps",
        href: "/app/assistant",
        icon: Sparkles,
        title: "Assistant",
      },
      {
        description: "Home profile, providers, and preferences",
        href: "/app/settings",
        icon: Settings,
        title: "Settings",
      },
    ],
  },
];

export const appNavItems = appNavSections.flatMap((section) => section.items);
