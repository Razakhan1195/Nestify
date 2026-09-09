import {
  Bell,
  Boxes,
  CircleHelp,
  FileText,
  Hammer,
  History,
  Home,
  LayoutDashboard,
  MessageCircle,
  Plug,
  ReceiptText,
  Refrigerator,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
export type AppNavItem = {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
};
export type AppNavSection = { items: AppNavItem[]; label: string };
export const appNavSections: AppNavSection[] = [
  {
    label: "Your everyday",
    items: [
      {
        title: "Dashboard",
        href: "/app",
        icon: LayoutDashboard,
        description: "What needs you next",
      },
      {
        title: "Bills",
        href: "/app/bills",
        icon: ReceiptText,
        description: "Due dates and changes",
      },
      {
        title: "Vault",
        href: "/app/documents",
        icon: FileText,
        description: "Important household records",
      },
      {
        title: "Care",
        href: "/app/maintenance",
        icon: Wrench,
        description: "Tasks and follow-ups",
      },
      {
        title: "Help",
        href: "/app/help",
        icon: CircleHelp,
        description: "Understand and track an issue",
      },
      {
        title: "Providers",
        href: "/app/providers",
        icon: Plug,
        description: "Services and optional connections",
      },
      {
        title: "Place",
        href: "/app/home",
        icon: Home,
        description: "Your place and its history",
      },
    ],
  },
  {
    label: "Records & follow-ups",
    items: [
      {
        title: "Repairs & projects",
        href: "/app/repairs",
        icon: Hammer,
        description: "Work, quotes, costs, and history",
      },
      {
        title: "Warranties",
        href: "/app/warranties",
        icon: ShieldCheck,
        description: "Coverage and expiry dates",
      },
      {
        title: "Appliances & systems",
        href: "/app/appliances",
        icon: Refrigerator,
        description: "Models, receipts, and context",
      },
      {
        title: "Inventory",
        href: "/app/inventory",
        icon: Boxes,
        description: "All items in your place",
      },
      {
        title: "Timeline",
        href: "/app/timeline",
        icon: History,
        description: "Search your household history",
      },
      {
        title: "Attention",
        href: "/app/attention",
        icon: Bell,
        description: "Review, snooze, and handled items",
      },
      {
        title: "Ask Rezlee",
        href: "/app/assistant",
        icon: MessageCircle,
        description: "Assistant and saved conversations",
      },
      {
        title: "Settings",
        href: "/app/settings",
        icon: Settings,
        description: "Profile and preferences",
      },
    ],
  },
];
export const appNavItems = appNavSections.flatMap((section) => section.items);
