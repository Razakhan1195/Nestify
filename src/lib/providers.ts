import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const providerStates = [
  "not_added",
  "added_manual",
  "connecting",
  "connected",
  "syncing",
  "healthy",
  "needs_attention",
  "sync_failed",
  "disconnected",
] as const;

export type ProviderState = (typeof providerStates)[number];

export const providerSetup = [
  {
    name: "Electricity",
    priority: 1,
    value:
      "Track bill amount, due date, usage changes, and seasonal spikes.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: true,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Natural Gas",
    priority: 2,
    value:
      "Track bill amount, due date, usage changes, and winter spikes.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: true,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Water",
    priority: 3,
    value: "Catch unusual usage and upcoming due dates.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: true,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Internet",
    priority: 4,
    value: "Catch price increases, promo expiry, and due dates.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Property Tax",
    priority: 5,
    value: "Track installment dates and major home cost events.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "quarterly",
  },
  {
    name: "Home Insurance",
    priority: 6,
    value: "Track renewal dates and premium changes.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "annual",
  },
  {
    name: "Security",
    priority: 7,
    value: "Track recurring home service cost.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Water Heater Rental",
    priority: 8,
    value: "Track rental cost and price creep.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Waste",
    priority: 9,
    value: "Track recurring service cost.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: true,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "monthly",
  },
  {
    name: "Other service",
    priority: 10,
    value: "Track any other household service, contact, or recurring provider.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: false,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "manual",
  },
  {
    name: "Rent / landlord",
    priority: 11,
    value: "Track rent, landlord contacts, lease records, and recurring housing due dates.",
    capabilities: {
      amount: true,
      due_date: true,
      pdf: false,
      usage: false,
      billing_period: true,
    },
    syncFrequency: "manual",
  },
] as const;

export type ProviderSetupItem = (typeof providerSetup)[number];

export const recommendedProviderCategories = [
  "Electricity",
  "Natural Gas",
  "Water",
  "Internet",
  "Property Tax",
  "Home Insurance",
] as const;

export const suggestedProvidersByCategory: Record<string, string[]> = {
  Electricity: ["Hydro One", "Alectra", "Toronto Hydro", "Elexicon"],
  "Natural Gas": ["Enbridge Gas"],
  Water: ["Durham Region Water", "City of Toronto Water", "York Region Water"],
  Internet: ["Rogers", "Bell", "Telus", "Cogeco"],
  "Property Tax": [
    "Town of Pickering",
    "Town of Whitby",
    "City of Toronto",
    "City of Mississauga",
  ],
  "Home Insurance": ["TD Insurance", "Aviva", "Intact", "Sonnet"],
  Security: ["Bell Smart Home", "Telus SmartHome Security", "Rogers Smart Home"],
  "Water Heater Rental": ["Enercare", "Reliance"],
  Waste: ["GFL", "Waste Connections"],
  "Rent / landlord": ["Landlord", "Property manager", "Condo management"],
  "Other service": [],
};

export type ProviderCategoryRow = {
  id: string;
  name: string;
};

export type ProviderRow = {
  id: string;
  user_id: string;
  home_id: string;
  category_id: string | null;
  name: string;
  display_name: string | null;
  provider_priority: number | null;
  connection_status: ProviderState | string;
  health_status: ProviderState | string;
  last_successful_sync_at: string | null;
  next_expected_bill_date: string | null;
  sync_frequency: string | null;
  requires_user_action: boolean | null;
  user_action_message: string | null;
  data_capabilities: Record<string, boolean> | null;
  deck_connection_id: string | null;
  deck_connection_status: string | null;
  deck_connection_metadata: Record<string, unknown> | null;
  account_number: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function getProviderSetupByName(name: string) {
  return providerSetup.find((item) => item.name === name);
}

export function getProviderSetupByPriority(priority: number | null | undefined) {
  return providerSetup.find((item) => item.priority === priority);
}

export function getProviderAction(state: ProviderState | string | undefined) {
  switch (state) {
    case "not_added":
      return "Add";
    case "added_manual":
      return "Connect";
    case "connecting":
    case "needs_attention":
      return "Review";
    case "sync_failed":
    case "disconnected":
      return "Reconnect";
    case "connected":
    case "healthy":
      return "Sync";
    case "syncing":
      return "Syncing";
    default:
      return "Add";
  }
}

export function getProviderStatusLabel(
  state: ProviderState | string | null | undefined
) {
  switch (state) {
    case "healthy":
    case "connected":
      return "Connected";
    case "added_manual":
      return "Added, not connected";
    case "needs_attention":
      return "Needs your attention";
    case "sync_failed":
      return "Sync issue";
    case "disconnected":
      return "Disconnected";
    case "syncing":
      return "Syncing";
    case "connecting":
      return "Connecting";
    case "not_added":
    case undefined:
    case null:
      return "Not added yet";
    default:
      return state.replaceAll("_", " ");
  }
}

export function isProviderNameMissing(
  providerName: string | null | undefined,
  categoryName: string | null | undefined
) {
  if (!providerName?.trim()) return true;
  if (!categoryName?.trim()) return false;

  return providerName.trim().toLowerCase() === categoryName.trim().toLowerCase();
}

export function getActualProviderName(
  providerName: string | null | undefined,
  categoryName: string | null | undefined
) {
  return isProviderNameMissing(providerName, categoryName)
    ? "Provider not selected yet"
    : providerName?.trim() ?? "Provider not selected yet";
}

export async function getProviderCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_categories")
    .select("id,name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProviderCategoryRow[];
}

export async function getHomeProviders(homeId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id,user_id,home_id,category_id,name,display_name,provider_priority,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,sync_frequency,requires_user_action,user_action_message,data_capabilities,deck_connection_id,deck_connection_status,deck_connection_metadata,account_number,website_url,phone,email,notes,created_at,updated_at"
    )
    .eq("home_id", homeId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProviderRow[];
}

export async function requireOwnedProvider(providerId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id,user_id,home_id,category_id,name,display_name,provider_priority,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,sync_frequency,requires_user_action,user_action_message,data_capabilities,deck_connection_id,deck_connection_status,deck_connection_metadata,account_number,website_url,phone,email,notes,created_at,updated_at"
    )
    .eq("id", providerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    notFound();
  }

  return data as ProviderRow;
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
