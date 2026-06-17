import {
  FileText,
  Home,
  PackageCheck,
  Sparkles,
  History,
  LifeBuoy,
  Hammer,
  ReceiptText,
  Settings,
  Wrench,
} from "lucide-react";

export const appNavItems = [
  {
    title: "Dashboard",
    href: "/app",
    icon: Home,
  },
  {
    title: "Bills & Costs",
    href: "/app/bills",
    icon: ReceiptText,
  },
  {
    title: "Maintenance",
    href: "/app/maintenance",
    icon: Wrench,
  },
  {
    title: "Projects",
    href: "/app/projects",
    icon: Hammer,
  },
  {
    title: "Home Vault",
    href: "/app/documents",
    icon: FileText,
  },
  {
    title: "Inventory",
    href: "/app/inventory",
    icon: PackageCheck,
  },
  {
    title: "Assistant",
    href: "/app/assistant",
    icon: Sparkles,
  },
  {
    title: "Timeline",
    href: "/app/timeline",
    icon: History,
  },
  {
    title: "Providers",
    href: "/app/providers",
    icon: LifeBuoy,
  },
  {
    title: "Home Profile",
    href: "/app/settings",
    icon: Settings,
  },
] as const;
