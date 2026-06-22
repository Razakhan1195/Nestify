import {
  FileText,
  Home,
  Plug,
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
    title: "Providers",
    href: "/app/providers",
    icon: Plug,
  },
  {
    title: "Bills",
    href: "/app/bills",
    icon: ReceiptText,
  },
  {
    title: "Vault",
    href: "/app/documents",
    icon: FileText,
  },
  {
    title: "Maintenance",
    href: "/app/maintenance",
    icon: Wrench,
  },
  {
    title: "Home",
    href: "/app/settings",
    icon: Settings,
  },
] as const;
