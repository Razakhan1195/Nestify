"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  createBillActivityEvent,
  markBillEventsHandled,
  refreshProviderConnectionIntelligence,
  refreshBillIntelligenceForBill,
} from "@/lib/insights/bill-intelligence";
import {
  hasSupabaseEnv,
  missingSupabaseEnvMessage,
} from "@/lib/supabase/env";
import { getCurrentUserHome } from "@/lib/homes";
import {
  getIssueGuidance,
  suggestedDueDateForIssue,
} from "@/lib/issues/guidance";
import {
  categoryNameForRegistryUtility,
  getProviderRegistryById,
} from "@/lib/provider-registry";
import { getProviderSetupByName, requireOwnedProvider } from "@/lib/providers";
import {
  guidedIssueHelpMigrationMessage,
  homeownerOsMigrationMessage,
  isMissingSchemaError,
} from "@/lib/schema-errors";
import {
  isBillIncomplete,
  statusAfterBillDetailsCompleted,
  statusForNewManualBill,
} from "@/lib/product/rules";
import { disconnectProvider as disconnectDeckProvider } from "@/lib/sync/provider-sync";

export type ActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
};

const signupSchema = z
  .object({
    city: z.string().min(1, "Enter your city.").max(100),
    email: z.string().email("Enter a valid email address."),
    full_name: z.string().min(2, "Enter your full name.").max(120),
    home_nickname: z.string().min(1, "Enter a home nickname.").max(80),
    home_type: z.string().min(1, "Choose a home type.").max(80),
    ownership_type: z.string().min(1, "Choose an ownership type.").max(80),
    password: z.string().min(8, "Use at least 8 characters."),
    password_confirm: z.string().min(1, "Confirm your password."),
    postal_code: z.string().min(1, "Enter your postal code.").max(20),
    province: z.string().min(1, "Enter your province.").max(80),
    street_address: z.string().min(1, "Enter your street address.").max(160),
  })
  .refine((value) => value.password === value.password_confirm, {
    message: "Passwords do not match.",
    path: ["password_confirm"],
  });

const homeSchema = z.object({
  nickname: z.string().min(1, "Enter a home nickname.").max(80),
  street_address: z.string().max(160).optional(),
  city: z.string().min(1, "Enter a city.").max(100),
  province: z.string().min(1, "Enter a province.").max(80),
  postal_code: z.string().min(1, "Enter a postal code.").max(20),
  home_type: z.string().min(1, "Choose a home type.").max(80),
  ownership_type: z.string().min(1, "Choose an ownership type.").max(80),
  closing_date: z.string().optional(),
  approximate_year_built: z
    .string()
    .refine(
      (value) =>
        !value ||
        (/^\d{4}$/.test(value) &&
          Number(value) >= 1600 &&
          Number(value) <= 2100),
      "Enter a valid year."
    )
    .optional(),
});

const providerSetupSchema = z.object({
  category_id: z.string().uuid().optional().or(z.literal("")),
  category_name: z.string().min(1),
  provider_name: z.string().min(1, "Enter the provider name.").max(120),
  registry_provider_id: z.string().uuid().optional().or(z.literal("")),
  account_number: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
  sync_frequency_days: z
    .string()
    .optional()
    .refine((value) => !value || value === "15" || value === "30", {
      message: "Choose a 15 or 30 day refresh cadence.",
    }),
});

const providerNameSchema = z.object({
  provider_id: z.string().uuid(),
  provider_name: z.string().min(1, "Enter the provider name.").max(120),
  account_number: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

const manualBillSchema = z.object({
  bill_title: z.string().min(1, "Enter a bill title.").max(140),
  category: z.string().min(1, "Choose a category.").max(80),
  provider_id: z.string().uuid().optional().or(z.literal("")),
  provider_name: z.string().max(120).optional(),
  issue_date: z.string().optional(),
  billing_period_start: z.string().optional(),
  billing_period_end: z.string().optional(),
  amount: z
    .string()
    .min(1, "Enter the bill amount.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid amount."),
  amount_paid: z
    .string()
    .optional()
    .refine((value) => !value || Number.isFinite(Number(value)), "Enter a valid amount paid."),
  due_date: z.string().min(1, "Choose a due date."),
  frequency: z.string().optional(),
  payment_status: z.enum(["unpaid", "scheduled", "paid", "overdue"]).optional(),
  account_number: z.string().max(80).optional(),
  reminder_date: z.string().optional(),
  notes: z.string().optional(),
});

const providerSyncPreferenceSchema = z.object({
  provider_id: z.string().uuid(),
  sync_frequency_days: z.enum(["15", "30"]),
});

const providerDeleteSchema = z.object({
  provider_id: z.string().uuid(),
  return_path: z.string().startsWith("/").default("/app/providers"),
});

const maintenanceTaskSchema = z.object({
  title: z.string().min(1, "Enter a task title.").max(140),
  category: z.string().min(1, "Choose a task type.").max(80),
  due_date: z.string().optional(),
  recurrence: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  relevance: z.string().optional(),
});

const planTasksSchema = z
  .array(
    z.object({
      title: z.string().min(1).max(160),
      category: z.string().max(80).optional(),
      recurrence: z.string().max(80).optional(),
      due_date: z.string().optional(),
      description: z.string().max(400).optional(),
      priority: z.string().max(20).optional(),
    }),
  )
  .min(1)
  .max(12);

const documentRecordSchema = z.object({
  title: z.string().min(1, "Enter a document title.").max(160),
  category: z.string().min(1, "Choose a document category.").max(80),
  issued_on: z.string().optional(),
  expires_on: z.string().optional(),
  notes: z.string().optional(),
  reminder_title: z.string().optional(),
  reminder_date: z.string().optional(),
});

const inventoryItemSchema = z.object({
  name: z.string().min(1, "Enter an item name.").max(140),
  category: z.string().optional(),
  room_or_area: z.string().optional(),
  brand: z.string().optional(),
  model_number: z.string().optional(),
  serial_number: z.string().optional(),
  purchase_date: z.string().optional(),
  purchase_price: z.string().optional(),
  warranty_expires_on: z.string().optional(),
  notes: z.string().optional(),
});

const projectSchema = z.object({
  title: z.string().min(1, "Enter a project title.").max(160),
  project_type: z.string().optional(),
  room_or_area: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  budget: z.string().optional(),
  target_completion_on: z.string().optional(),
  notes: z.string().optional(),
});

const repairIssueSchema = z.object({
  title: z.string().min(1, "Enter an issue title.").max(160),
  category: z.string().min(1, "Choose a category.").max(80),
  location: z.string().min(1, "Choose a location.").max(80),
  urgency: z.enum(["low", "medium", "high", "urgent"]),
  renter_owner_context: z.string().optional(),
  description: z.string().min(1, "Describe what is happening.").max(1200),
  status: z.string().optional(),
});

const issueActionSchema = z.object({
  issue_id: z.string().uuid(),
  return_path: z.string().startsWith("/").default("/app/help"),
});

const issueNoteSchema = issueActionSchema.extend({
  note: z.string().min(1, "Enter a note.").max(1000),
});

const attentionResolutionSchema = z.object({
  attention_key: z.string().min(1),
  event_type: z.string().min(1),
  related_table: z.string().optional(),
  related_id: z.string().uuid().optional().or(z.literal("")),
  return_path: z.string().startsWith("/").default("/app"),
  resolution_action: z.enum(["dismiss", "handled", "snooze"]),
  snooze_for: z.enum(["tomorrow", "week", "month"]).optional(),
});

const billActionSchema = z.object({
  bill_id: z.string().uuid(),
  attention_key: z.string().optional(),
  event_type: z.string().optional(),
  return_path: z.string().startsWith("/").default("/app/bills"),
});

const recordDeleteSchema = z.object({
  record_id: z.string().uuid(),
  return_path: z.string().startsWith("/").default("/app"),
});

const billDueDateSchema = z.object({
  bill_id: z.string().uuid(),
  amount: z.string().optional(),
  due_date: z.string().min(1, "Choose a due date."),
  return_path: z.string().startsWith("/").default("/app/bills"),
});

const maintenanceActionSchema = z.object({
  attention_key: z.string().optional(),
  event_type: z.string().optional(),
  return_path: z.string().startsWith("/").default("/app/maintenance"),
  task_id: z.string().uuid(),
});

const starterTaskActionSchema = z.object({
  attention_key: z.string().min(1),
  return_path: z.string().startsWith("/").default("/app/maintenance"),
  resolution_action: z.enum(["dismiss", "snooze"]),
});

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: string) {
  return value || null;
}

function nullableDate(value: string) {
  return value || null;
}

function nullableMoney(value: string) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addCalendarMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function redirectWithNotice(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}notice=${encodeURIComponent(message)}`);
}

async function getRequestOrigin() {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  return process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${protocol}://${host}` : "");
}

async function requireUserAndHome() {
  if (!hasSupabaseEnv()) {
    throw new Error(missingSupabaseEnvMessage);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: home, error: homeError } = await getCurrentUserHome(user.id);

  if (homeError) {
    throw new Error(homeError.message);
  }

  if (!home) {
    redirect("/app/onboarding");
  }

  return { home, supabase, user };
}

async function createTimelineEvent(input: {
  title: string;
  body?: string | null;
  eventType: string;
  homeId: string;
  relatedId?: string;
  relatedTable?: string;
  userId: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("timeline_events").insert({
    user_id: input.userId,
    home_id: input.homeId,
    event_type: input.eventType,
    title: input.title,
    body: input.body ?? null,
    related_table: input.relatedTable ?? null,
    related_id: input.relatedId ?? null,
  });

  if (error) {
    console.warn("[timeline:create] skipped timeline event", {
      code: error.code,
      event_type: input.eventType,
      message: error.message,
    });
  }
}

async function upsertAttentionResolution(input: {
  attentionKey: string;
  eventType: string;
  homeId: string;
  note?: string;
  relatedId?: string | null;
  relatedTable?: string | null;
  resolutionStatus: "dismissed" | "handled" | "snoozed";
  snoozedUntil?: string | null;
  userId: string;
}) {
  const now = new Date().toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("attention_resolutions").upsert(
    {
      user_id: input.userId,
      home_id: input.homeId,
      attention_key: input.attentionKey,
      event_type: input.eventType,
      related_table: input.relatedTable ?? null,
      related_id: input.relatedId || null,
      resolution_status: input.resolutionStatus,
      dismissed_at: input.resolutionStatus === "dismissed" ? now : null,
      handled_at: input.resolutionStatus === "handled" ? now : null,
      snoozed_until:
        input.resolutionStatus === "snoozed" ? input.snoozedUntil ?? null : null,
      note: input.note ?? null,
    },
    { onConflict: "user_id,home_id,attention_key" }
  );

  if (error) {
    throw new Error(
      isMissingSchemaError(error)
        ? "Attention actions need the attention resolution migration."
        : error.message
    );
  }
}

async function supabaseUpdateBillEventResolution(input: {
  attentionKey: string;
  homeId: string;
  resolutionStatus: "dismissed" | "handled" | "snoozed";
  snoozedUntil?: string | null;
  userId: string;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("bill_events")
    .update({
      resolution_status: input.resolutionStatus,
      dismissed_at: input.resolutionStatus === "dismissed" ? now : null,
      handled_at: input.resolutionStatus === "handled" ? now : null,
      snoozed_until:
        input.resolutionStatus === "snoozed" ? input.snoozedUntil ?? null : null,
    })
    .eq("user_id", input.userId)
    .eq("home_id", input.homeId)
    .eq("event_key", input.attentionKey);

  if (error && !isMissingSchemaError(error)) {
    throw new Error(error.message);
  }
}

function redirectWithError(path: "/login" | "/signup", message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData) {
  if (!hasSupabaseEnv()) {
    redirectWithError("/login", missingSupabaseEnvMessage);
  }

  const email = getString(formData, "email");
  const password = getString(formData, "password");

  if (!email || !password) {
    redirectWithError("/login", "Enter your email and password.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirectWithError("/login", error.message);
  }

  redirect("/app");
}

export async function signup(formData: FormData) {
  if (!hasSupabaseEnv()) {
    redirectWithError("/signup", missingSupabaseEnvMessage);
  }

  const parsed = signupSchema.safeParse({
    city: getString(formData, "city"),
    email: getString(formData, "email"),
    full_name: getString(formData, "full_name"),
    home_nickname: getString(formData, "home_nickname"),
    home_type: getString(formData, "home_type"),
    ownership_type: getString(formData, "ownership_type"),
    password: getString(formData, "password"),
    password_confirm: getString(formData, "password_confirm"),
    postal_code: getString(formData, "postal_code"),
    province: getString(formData, "province"),
    street_address: getString(formData, "street_address"),
  });

  if (!parsed.success) {
    redirectWithError(
      "/signup",
      parsed.error.issues[0]?.message ?? "Check the signup details and try again."
    );
  }

  const values = parsed.data;
  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      data: {
        full_name: values.full_name,
        home_city: values.city,
        home_nickname: values.home_nickname,
        home_ownership_type: values.ownership_type,
        home_postal_code: values.postal_code,
        home_province: values.province,
        home_street_address: values.street_address,
        home_type: values.home_type,
        signup_context: "home_onboarding",
      },
      emailRedirectTo: origin
        ? `${origin}/auth/callback?next=/app/onboarding`
        : undefined,
    },
  });

  if (error) {
    redirectWithError("/signup", error.message);
  }

  if (data.user && data.session) {
    await supabase.from("profiles").upsert(
      {
        user_id: data.user.id,
        email: data.user.email ?? values.email,
        full_name: values.full_name,
      },
      { onConflict: "user_id" }
    );
  }

  if (data.session) {
    redirect("/app/onboarding");
  }

  redirect(`/signup/check-email?email=${encodeURIComponent(values.email)}`);
}

export async function createHome(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!hasSupabaseEnv()) {
    return { message: missingSupabaseEnvMessage };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: existingHome, error: existingHomeError } =
    await getCurrentUserHome(user.id);

  if (existingHomeError) {
    console.error("[home:create] existing home check failed", {
      user_id: user.id,
      message: existingHomeError.message,
      details: existingHomeError.details,
      hint: existingHomeError.hint,
      code: existingHomeError.code,
    });

    return {
      message: existingHomeError.message,
    };
  }

  if (existingHome) {
    console.log("[home:create] duplicate create blocked", {
      user_id: user.id,
      home_id: existingHome.id,
    });
    redirect("/app");
  }

  const validatedFields = homeSchema.safeParse({
    nickname: getString(formData, "nickname"),
    street_address: getString(formData, "street_address"),
    city: getString(formData, "city"),
    province: getString(formData, "province"),
    postal_code: getString(formData, "postal_code"),
    home_type: getString(formData, "home_type"),
    ownership_type: getString(formData, "ownership_type"),
    closing_date: getString(formData, "closing_date"),
    approximate_year_built: getString(formData, "approximate_year_built"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Check the highlighted fields and try again.",
    };
  }

  const values = validatedFields.data;
  const insertPayload = {
    user_id: user.id,
    nickname: values.nickname,
    street_address: values.street_address || null,
    city: values.city || null,
    province: values.province || null,
    postal_code: values.postal_code || null,
    country: "Canada",
    home_type: values.home_type || null,
    ownership_type: values.ownership_type || null,
    closing_date: values.closing_date || null,
    approximate_year_built: values.approximate_year_built
      ? Number(values.approximate_year_built)
      : null,
  };

  console.log("[home:create] inserting public.homes row", {
    user_id: user.id,
    nickname: insertPayload.nickname,
  });

  const { data: home, error } = await supabase
    .from("homes")
    .insert(insertPayload)
    .select("id,user_id,nickname,created_at")
    .single();

  if (error) {
    console.error("[home:create] insert failed", {
      user_id: user.id,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return {
      message: error.message,
    };
  }

  console.log("[home:create] insert succeeded", {
    home_id: home.id,
    user_id: home.user_id,
    nickname: home.nickname,
  });

  revalidatePath("/app");
  redirect("/app/onboarding?step=goals");
}

export async function updateHome(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!hasSupabaseEnv()) {
    return { message: missingSupabaseEnvMessage };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: existingHome, error: existingHomeError } =
    await getCurrentUserHome(user.id);

  if (existingHomeError) {
    return { message: existingHomeError.message };
  }

  if (!existingHome) {
    redirect("/app/onboarding");
  }

  const validatedFields = homeSchema.safeParse({
    nickname: getString(formData, "nickname"),
    street_address: getString(formData, "street_address"),
    city: getString(formData, "city"),
    province: getString(formData, "province"),
    postal_code: getString(formData, "postal_code"),
    home_type: getString(formData, "home_type"),
    ownership_type: getString(formData, "ownership_type"),
    closing_date: getString(formData, "closing_date"),
    approximate_year_built: getString(formData, "approximate_year_built"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Check the highlighted fields and try again.",
    };
  }

  const values = validatedFields.data;
  const { error } = await supabase
    .from("homes")
    .update({
      nickname: values.nickname,
      street_address: values.street_address || null,
      city: values.city || null,
      province: values.province || null,
      postal_code: values.postal_code || null,
      home_type: values.home_type || null,
      ownership_type: values.ownership_type || null,
      closing_date: values.closing_date || null,
      approximate_year_built: values.approximate_year_built
        ? Number(values.approximate_year_built)
        : null,
    })
    .eq("id", existingHome.id)
    .eq("user_id", user.id);

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/settings");

  return { message: "Home details saved." };
}

export async function addProvider(formData: FormData) {
  if (!hasSupabaseEnv()) {
    redirect(`/app/providers?error=${encodeURIComponent(missingSupabaseEnvMessage)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: home, error: homeError } = await getCurrentUserHome(user.id);

  if (homeError) {
    redirect(`/app/providers?error=${encodeURIComponent(homeError.message)}`);
  }

  if (!home) {
    redirect("/app/onboarding");
  }

  const parsed = providerSetupSchema.safeParse({
    category_id: getString(formData, "category_id"),
    category_name: getString(formData, "category_name"),
    provider_name: getString(formData, "provider_name"),
    registry_provider_id: getString(formData, "registry_provider_id"),
    account_number: getString(formData, "account_number"),
    notes: getString(formData, "notes"),
    sync_frequency_days: getString(formData, "sync_frequency_days"),
  });

  if (!parsed.success) {
    redirect("/app/providers?error=Choose a category and enter the provider name.");
  }

  const registryProvider = parsed.data.registry_provider_id
    ? await getProviderRegistryById(parsed.data.registry_provider_id)
    : null;
  const categoryName = registryProvider
    ? categoryNameForRegistryUtility(registryProvider.utility_type)
    : parsed.data.category_name;
  const setup = getProviderSetupByName(categoryName);

  if (!setup) {
    redirect("/app/providers?error=Unknown provider category.");
  }

  const providerName = registryProvider?.name ?? parsed.data.provider_name;
  const categoryId = parsed.data.category_id || null;
  const syncFrequencyDays = Number(parsed.data.sync_frequency_days || "30");
  const nextScheduledSyncAt =
    syncFrequencyDays === 15 || syncFrequencyDays === 30
      ? addCalendarDays(new Date(), syncFrequencyDays).toISOString()
      : null;

  let existingProviderQuery = supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  existingProviderQuery = registryProvider
    ? existingProviderQuery.eq("registry_provider_id", registryProvider.id)
    : categoryId
      ? existingProviderQuery.eq("category_id", categoryId)
      : existingProviderQuery.eq("name", providerName);

  const { data: existingProvider, error: existingError } =
    await existingProviderQuery.maybeSingle();

  if (existingError) {
    redirect(`/app/providers?error=${encodeURIComponent(existingError.message)}`);
  }

  if (existingProvider) {
    redirect(`/app/providers/${existingProvider.id}`);
  }

  const { data: provider, error } = await supabase
    .from("providers")
    .insert({
      user_id: user.id,
      home_id: home.id,
      category_id: categoryId,
      registry_provider_id: registryProvider?.id ?? null,
      name: providerName,
      display_name: providerName,
      account_number: nullableString(parsed.data.account_number ?? ""),
      website_url: registryProvider?.website_url ?? null,
      notes: nullableString(parsed.data.notes ?? ""),
      provider_priority: setup.priority,
      connection_status: "added_manual",
      health_status: "needs_attention",
      sync_frequency: `${syncFrequencyDays} days`,
      sync_frequency_days: syncFrequencyDays,
      next_scheduled_sync_at: nextScheduledSyncAt,
      sync_status:
        registryProvider?.status === "active" ? "initial_sync_pending" : "manual_bill_available",
      requires_user_action: true,
      user_action_message:
        registryProvider?.status === "active"
          ? "Provider selected. Connect when ready to retrieve bills, due dates, PDFs, and changes automatically."
          : "This provider is saved. Automation is not fully mapped yet, so you can add bills manually while connection support is prepared.",
      data_capabilities: setup.capabilities,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/app/providers?error=${encodeURIComponent(error.message)}`);
  }

  await refreshProviderConnectionIntelligence({
    userId: user.id,
    homeId: home.id,
    provider: {
      id: provider.id,
      display_name: providerName,
      name: providerName,
      provider_priority: setup.priority,
      connection_status: "added_manual",
      health_status: "needs_attention",
      sync_frequency: `${syncFrequencyDays} days`,
      requires_user_action: true,
      user_action_message:
        registryProvider?.status === "active"
          ? "Provider selected. Connect when ready to retrieve bills, due dates, PDFs, and changes automatically."
          : "This provider is saved. Automation is not fully mapped yet, so you can add bills manually while connection support is prepared.",
    },
    supabase,
  });

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "provider_added",
    title: "Provider added",
    body: `${setup.name}: ${providerName}`,
    relatedTable: "providers",
    relatedId: provider.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/providers");
  redirectWithNotice(`/app/providers/${provider.id}`, "Provider added.");
}

export async function updateProviderName(formData: FormData) {
  const parsed = providerNameSchema.safeParse({
    provider_id: getString(formData, "provider_id"),
    provider_name: getString(formData, "provider_name"),
    account_number: getString(formData, "account_number"),
    notes: getString(formData, "notes"),
  });

  if (!parsed.success) {
    redirect("/app/providers?error=Enter the provider company or municipality.");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const provider = await requireOwnedProvider(parsed.data.provider_id, user.id);

  const { error } = await supabase
    .from("providers")
    .update({
      name: parsed.data.provider_name,
      display_name: parsed.data.provider_name,
      account_number: nullableString(parsed.data.account_number ?? ""),
      notes: nullableString(parsed.data.notes ?? ""),
      requires_user_action: provider.connection_status === "added_manual",
      user_action_message:
        provider.connection_status === "added_manual"
          ? "Provider selected. Connect when ready to retrieve bills, due dates, PDFs, and changes automatically."
          : provider.user_action_message,
    })
    .eq("id", provider.id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/app/providers?error=${encodeURIComponent(error.message)}`);
  }

  await refreshProviderConnectionIntelligence({
    userId: user.id,
    homeId: provider.home_id,
    provider: {
      ...provider,
      display_name: parsed.data.provider_name,
      name: parsed.data.provider_name,
    },
    supabase,
  });

  revalidatePath("/app");
  revalidatePath("/app/providers");
  revalidatePath(`/app/providers/${provider.id}`);
  redirect("/app/providers");
}

export async function updateProviderSyncPreference(formData: FormData) {
  const parsed = providerSyncPreferenceSchema.safeParse({
    provider_id: getString(formData, "provider_id"),
    sync_frequency_days: getString(formData, "sync_frequency_days"),
  });

  if (!parsed.success) {
    redirectWithNotice("/app/providers", "Choose a 15 or 30 day refresh cadence.");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const provider = await requireOwnedProvider(parsed.data.provider_id, user.id);
  const days = Number(parsed.data.sync_frequency_days);
  const anchor = provider.last_successful_sync_at
    ? new Date(provider.last_successful_sync_at)
    : new Date();
  const nextScheduledSyncAt = addCalendarDays(anchor, days).toISOString();

  const { error } = await supabase
    .from("providers")
    .update({
      sync_frequency: `${days} days`,
      sync_frequency_days: days,
      next_scheduled_sync_at: nextScheduledSyncAt,
    })
    .eq("id", provider.id)
    .eq("user_id", user.id);

  if (error) {
    redirectWithNotice(`/app/providers/${provider.id}`, error.message);
  }

  revalidatePath("/app/providers");
  revalidatePath(`/app/providers/${provider.id}`);
  redirectWithNotice(
    `/app/providers/${provider.id}`,
    `Refresh cadence updated to every ${days} days.`
  );
}

export async function deleteProvider(formData: FormData) {
  const parsed = providerDeleteSchema.safeParse({
    provider_id: getString(formData, "provider_id"),
    return_path: getString(formData, "return_path") || "/app/providers",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/providers", "That provider could not be deleted.");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const provider = await requireOwnedProvider(parsed.data.provider_id, user.id);

  if (
    provider.deck_connection_id &&
    provider.deck_connection_status !== "disconnected"
  ) {
    await disconnectDeckProvider({
      providerId: provider.id,
      userId: user.id,
    });
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: provider.home_id,
    eventType: "provider_deleted",
    title: "Provider removed",
    body: provider.display_name ?? provider.name,
    relatedTable: "providers",
    relatedId: provider.id,
  });

  const { error } = await supabase
    .from("providers")
    .delete()
    .eq("id", provider.id)
    .eq("user_id", user.id);

  if (error) {
    redirectWithNotice(parsed.data.return_path, error.message);
  }

  revalidatePath("/app");
  revalidatePath("/app/providers");
  revalidatePath("/app/bills");
  redirectWithNotice("/app/providers", "Provider deleted. Historical bills and records were kept.");
}

export async function updateProviderConnectionState(formData: FormData) {
  const providerId = getString(formData, "provider_id");
  const nextState = getString(formData, "next_state");

  if (!providerId) {
    redirect("/app/providers");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const provider = await requireOwnedProvider(providerId, user.id);

  const state =
    nextState === "syncing"
      ? {
          connection_status: "healthy",
          health_status: "healthy",
          last_successful_sync_at: new Date().toISOString(),
          requires_user_action: false,
          user_action_message: null,
        }
      : {
          connection_status: "needs_attention",
          health_status: "needs_attention",
          requires_user_action: true,
          user_action_message:
            "Deck integration is not enabled yet. Review this provider and keep its details ready.",
        };

  const { error } = await supabase
    .from("providers")
    .update(state)
    .eq("id", provider.id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/app/providers/${provider.id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/providers");
  revalidatePath(`/app/providers/${provider.id}`);
  redirect(`/app/providers/${provider.id}`);
}

export async function createManualBill(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = manualBillSchema.safeParse({
    bill_title: getString(formData, "bill_title") || getString(formData, "name"),
    category: getString(formData, "category"),
    provider_id: getString(formData, "provider_id"),
    provider_name:
      getString(formData, "provider_name") || getString(formData, "provider_contact"),
    issue_date: getString(formData, "issue_date"),
    billing_period_start: getString(formData, "billing_period_start"),
    billing_period_end: getString(formData, "billing_period_end"),
    amount: getString(formData, "amount"),
    amount_paid: getString(formData, "amount_paid"),
    due_date: getString(formData, "due_date"),
    frequency: getString(formData, "frequency"),
    payment_status: getString(formData, "payment_status") || undefined,
    account_number: getString(formData, "account_number"),
    reminder_date: getString(formData, "reminder_date"),
    notes: getString(formData, "notes"),
  });

  if (!parsed.success) {
    redirect("/app/bills?error=Enter a bill title and choose a category.");
  }

  const values = parsed.data;
  const provider = values.provider_id
    ? await requireOwnedProvider(values.provider_id, user.id)
    : null;
  const amount = nullableMoney(values.amount ?? "");
  const paymentStatus = values.payment_status ?? "unpaid";
  const billStatus =
    paymentStatus === "paid"
      ? "paid"
      : paymentStatus === "overdue"
        ? "overdue"
        : statusForNewManualBill(values.due_date);

  const duplicateQuery = supabase
    .from("bills")
    .select("id")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .eq("due_date", values.due_date)
    .eq("amount", amount);

  const { data: duplicateBill } = provider
    ? await duplicateQuery.eq("provider_id", provider.id).maybeSingle()
    : await duplicateQuery
        .eq("custom_provider_name", values.provider_name ?? values.bill_title)
        .maybeSingle();

  if (duplicateBill) {
    redirectWithNotice(
      `/app/bills?provider=${provider?.id ?? ""}#manual-bill`,
      "A similar manual bill already exists."
    );
  }

  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      user_id: user.id,
      home_id: home.id,
      provider_id: provider?.id ?? null,
      provider_connection_id: provider?.id ?? null,
      custom_provider_name: provider ? null : nullableString(values.provider_name ?? ""),
      name: values.bill_title,
      amount,
      amount_paid: nullableMoney(values.amount_paid ?? ""),
      due_date: nullableDate(values.due_date ?? ""),
      issue_date: nullableDate(values.issue_date ?? ""),
      billing_period_start: nullableDate(values.billing_period_start ?? ""),
      billing_period_end: nullableDate(values.billing_period_end ?? ""),
      account_number_masked: nullableString(values.account_number ?? ""),
      payment_status: paymentStatus,
      reminder_date: nullableDate(values.reminder_date ?? ""),
      frequency: nullableString(values.frequency ?? ""),
      recurrence: nullableString(values.frequency ?? ""),
      status: billStatus,
      source: "manual",
      notes: nullableString(values.notes ?? ""),
      raw_data: {
        category: values.category,
        provider_contact: nullableString(
          provider?.display_name ?? provider?.name ?? values.provider_name ?? ""
        ),
        manual_fallback: true,
      },
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/app/bills?error=${encodeURIComponent(error.message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "bill_added",
    title: "Bill added",
    body: values.due_date
      ? `${values.bill_title} due ${values.due_date}`
      : values.bill_title,
    relatedTable: "bills",
    relatedId: bill.id,
  });

  await refreshBillIntelligenceForBill({
    billId: bill.id,
    homeId: home.id,
    supabase,
    userId: user.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  if (provider) {
    revalidatePath(`/app/providers/${provider.id}`);
  }
  redirectWithNotice("/app/bills", "Manual bill added.");
}

export async function resolveAttentionItem(formData: FormData) {
  const { home, user } = await requireUserAndHome();
  const parsed = attentionResolutionSchema.safeParse({
    attention_key: getString(formData, "attention_key"),
    event_type: getString(formData, "event_type"),
    related_table: getString(formData, "related_table"),
    related_id: getString(formData, "related_id"),
    return_path: getString(formData, "return_path") || "/app",
    resolution_action: getString(formData, "resolution_action"),
    snooze_for: getString(formData, "snooze_for") || undefined,
  });

  if (!parsed.success) {
    redirectWithNotice("/app", "That attention item could not be updated.");
  }

  const values = parsed.data;
  const now = new Date();
  const snoozedUntil =
    values.snooze_for === "tomorrow"
      ? addCalendarDays(now, 1)
      : values.snooze_for === "week"
        ? addCalendarDays(now, 7)
        : values.snooze_for === "month"
          ? addCalendarMonths(now, 1)
          : null;
  const resolutionStatus =
    values.resolution_action === "dismiss"
      ? "dismissed"
      : values.resolution_action === "snooze"
        ? "snoozed"
        : "handled";

  await upsertAttentionResolution({
    userId: user.id,
    homeId: home.id,
    attentionKey: values.attention_key,
    eventType: values.event_type,
    relatedTable: nullableString(values.related_table ?? ""),
    relatedId: nullableString(values.related_id ?? ""),
    resolutionStatus,
    snoozedUntil: snoozedUntil?.toISOString() ?? null,
  });

  await supabaseUpdateBillEventResolution({
    attentionKey: values.attention_key,
    homeId: home.id,
    resolutionStatus,
    userId: user.id,
    snoozedUntil: snoozedUntil?.toISOString() ?? null,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  revalidatePath("/app/providers");
  redirectWithNotice(
    values.return_path,
    resolutionStatus === "dismissed"
      ? "Dismissed from Needs Attention."
      : resolutionStatus === "snoozed"
        ? "Snoozed until later."
        : "Marked as handled."
  );
}

export async function markBillPaid(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = billActionSchema.safeParse({
    bill_id: getString(formData, "bill_id"),
    attention_key: getString(formData, "attention_key"),
    event_type: getString(formData, "event_type"),
    return_path: getString(formData, "return_path") || "/app/bills",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/bills", "That bill could not be updated.");
  }

  const values = parsed.data;
  const { error } = await supabase
    .from("bills")
    .update({
      paid_at: new Date().toISOString(),
      status: "paid",
    })
    .eq("id", values.bill_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(
      values.return_path,
      isMissingSchemaError(error)
        ? homeownerOsMigrationMessage
        : error.message
    );
  }

  if (values.attention_key && values.event_type) {
    await upsertAttentionResolution({
      userId: user.id,
      homeId: home.id,
      attentionKey: values.attention_key,
      eventType: values.event_type,
      relatedTable: "bills",
      relatedId: values.bill_id,
      resolutionStatus: "handled",
      note: "Bill marked as paid.",
    });
  }

  await markBillEventsHandled({
    billId: values.bill_id,
    eventTypes: ["bill_due_soon", "bill_overdue"],
    homeId: home.id,
    supabase,
    userId: user.id,
  });

  await createBillActivityEvent({
    billId: values.bill_id,
    description: "Bill marked as paid.",
    eventType: "bill_marked_paid",
    homeId: home.id,
    supabase,
    title: "Bill marked paid",
    userId: user.id,
  });

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "bill_paid",
    title: "Bill marked paid",
    relatedTable: "bills",
    relatedId: values.bill_id,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  redirectWithNotice(values.return_path, "Bill marked paid.");
}

export async function markBillReviewed(formData: FormData) {
  const { home, user } = await requireUserAndHome();
  const parsed = billActionSchema.safeParse({
    bill_id: getString(formData, "bill_id"),
    attention_key: getString(formData, "attention_key"),
    event_type: getString(formData, "event_type") || "bill_review",
    return_path: getString(formData, "return_path") || "/app/bills",
  });

  if (!parsed.success || !parsed.data.attention_key) {
    redirectWithNotice("/app/bills", "That bill review could not be saved.");
  }

  await upsertAttentionResolution({
    userId: user.id,
    homeId: home.id,
    attentionKey: parsed.data.attention_key,
    eventType: parsed.data.event_type ?? "bill_review",
    relatedTable: "bills",
    relatedId: parsed.data.bill_id,
    resolutionStatus: "handled",
    note: "Bill reviewed.",
  });

  await markBillEventsHandled({
    billId: parsed.data.bill_id,
    homeId: home.id,
    userId: user.id,
    eventTypes: [
      "bill_amount_increased",
      "bill_amount_decreased",
      "due_date_missing",
      "usage_increased",
      "usage_decreased",
      "new_fee_detected",
    ],
  });

  await createBillActivityEvent({
    billId: parsed.data.bill_id,
    description: "Bill intelligence reviewed.",
    eventType: "bill_marked_reviewed",
    homeId: home.id,
    title: "Bill marked as reviewed",
    userId: user.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  redirectWithNotice(parsed.data.return_path, "Bill marked as reviewed.");
}

export async function updateBillDueDate(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = billDueDateSchema.safeParse({
    bill_id: getString(formData, "bill_id"),
    amount: getString(formData, "amount"),
    due_date: getString(formData, "due_date"),
    return_path: getString(formData, "return_path") || "/app/bills",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/bills", "Choose a due date first.");
  }

  const values = parsed.data;
  const { data: existingBill, error: existingBillError } = await supabase
    .from("bills")
    .select("id,name,amount,raw_data,status")
    .eq("id", values.bill_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (existingBillError || !existingBill) {
    redirectWithNotice(values.return_path, "Couldn't update. Try again.");
  }

  const nextAmount =
    values.amount && Number.isFinite(Number(values.amount))
      ? Number(values.amount)
      : existingBill.amount;
  const nextStatus = isBillIncomplete({
    amount: nextAmount,
    due_date: values.due_date,
    name: existingBill.name,
    raw_data: existingBill.raw_data,
    status: null,
  })
    ? "incomplete"
    : statusAfterBillDetailsCompleted(values.due_date);
  const { error } = await supabase
    .from("bills")
    .update({
      amount: nextAmount,
      due_date: values.due_date,
      status: nextStatus,
    })
    .eq("id", values.bill_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "Could not save due date. Try again.");
  }

  await markBillEventsHandled({
    billId: values.bill_id,
    eventTypes: ["due_date_missing"],
    homeId: home.id,
    supabase,
    userId: user.id,
  });

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "bill_due_date_added",
    title: "Bill due date added",
    body: `Due ${values.due_date}`,
    relatedTable: "bills",
    relatedId: values.bill_id,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  redirectWithNotice(values.return_path, "Due date added.");
}

export async function deleteManualBill(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = recordDeleteSchema.safeParse({
    record_id: getString(formData, "record_id"),
    return_path: getString(formData, "return_path") || "/app/bills",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/bills", "That bill could not be removed.");
  }

  const values = parsed.data;
  const { data: bill, error: billError } = await supabase
    .from("bills")
    .select("id,name,source")
    .eq("id", values.record_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (billError || !bill) {
    redirectWithNotice(values.return_path, "That bill could not be found.");
  }

  if (bill.source !== "manual") {
    redirectWithNotice(
      values.return_path,
      "Provider-synced bills are kept as home history."
    );
  }

  const { error } = await supabase
    .from("bills")
    .delete()
    .eq("id", bill.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "That bill could not be removed.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "manual_bill_deleted",
    title: "Manual bill removed",
    body: bill.name,
    relatedTable: "bills",
    relatedId: bill.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  redirectWithNotice(values.return_path, "Manual bill removed.");
}

export async function completeMaintenanceTask(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = maintenanceActionSchema.safeParse({
    attention_key: getString(formData, "attention_key"),
    event_type: getString(formData, "event_type") || "maintenance_due",
    return_path: getString(formData, "return_path") || "/app/maintenance",
    task_id: getString(formData, "task_id"),
  });

  if (!parsed.success) {
    redirectWithNotice("/app/maintenance", "That maintenance task could not be updated.");
  }

  const values = parsed.data;
  const { error } = await supabase
    .from("maintenance_tasks")
    .update({
      completed_at: new Date().toISOString(),
      status: "completed",
    })
    .eq("id", values.task_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, error.message);
  }

  if (values.attention_key) {
    await upsertAttentionResolution({
      userId: user.id,
      homeId: home.id,
      attentionKey: values.attention_key,
      eventType: values.event_type ?? "maintenance_due",
      relatedTable: "maintenance_tasks",
      relatedId: values.task_id,
      resolutionStatus: "handled",
    note: "Care task completed.",
    });
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "maintenance_completed",
    title: "Task completed",
    relatedTable: "maintenance_tasks",
    relatedId: values.task_id,
  });

  revalidatePath("/app");
  revalidatePath("/app/maintenance");
  redirectWithNotice(values.return_path, "Task completed.");
}

export async function deleteMaintenanceTask(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = recordDeleteSchema.safeParse({
    record_id: getString(formData, "record_id"),
    return_path: getString(formData, "return_path") || "/app/maintenance",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/maintenance", "That task could not be removed.");
  }

  const values = parsed.data;
  const { data: task, error: taskError } = await supabase
    .from("maintenance_tasks")
    .select("id,title")
    .eq("id", values.record_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (taskError || !task) {
    redirectWithNotice(values.return_path, "That task could not be found.");
  }

  const { error } = await supabase
    .from("maintenance_tasks")
    .delete()
    .eq("id", task.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "That task could not be removed.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "maintenance_deleted",
    title: "Maintenance task removed",
    body: task.title,
    relatedTable: "maintenance_tasks",
    relatedId: task.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/maintenance");
  revalidatePath("/app/help");
  redirectWithNotice(values.return_path, "Task removed.");
}

export async function skipStarterTask(formData: FormData) {
  const { home, user } = await requireUserAndHome();
  const parsed = starterTaskActionSchema.safeParse({
    attention_key: getString(formData, "attention_key"),
    return_path: getString(formData, "return_path") || "/app/maintenance",
    resolution_action: getString(formData, "resolution_action"),
  });

  if (!parsed.success) {
    redirectWithNotice("/app/maintenance", "That starter task could not be updated.");
  }

  await upsertAttentionResolution({
    userId: user.id,
    homeId: home.id,
    attentionKey: parsed.data.attention_key,
    eventType: "starter_maintenance",
    relatedTable: "maintenance_tasks",
    resolutionStatus:
      parsed.data.resolution_action === "snooze" ? "snoozed" : "dismissed",
    snoozedUntil:
      parsed.data.resolution_action === "snooze"
        ? addCalendarDays(new Date(), 30).toISOString()
        : null,
  });

  revalidatePath("/app/maintenance");
  redirectWithNotice(
    parsed.data.return_path,
    parsed.data.resolution_action === "snooze"
      ? "Skipped for now."
      : "Marked not relevant."
  );
}

export async function createMaintenanceTask(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = maintenanceTaskSchema.safeParse({
    title: getString(formData, "title"),
    category: getString(formData, "category"),
    due_date: getString(formData, "due_date"),
    recurrence: getString(formData, "recurrence"),
    priority: getString(formData, "priority"),
    description: getString(formData, "description"),
    relevance: getString(formData, "relevance"),
  });

  if (!parsed.success) {
    redirect("/app/maintenance?error=Enter a task title and choose a type.");
  }

  const values = parsed.data;
  const reminderNotes = [
    nullableString(values.description ?? ""),
    values.relevance ? `Applies to: ${values.relevance}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const { data: task, error } = await supabase
    .from("maintenance_tasks")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      category: nullableString(values.category ?? ""),
      due_date: nullableDate(values.due_date ?? ""),
      recurrence: nullableString(values.recurrence ?? ""),
      priority: values.priority || "normal",
      description: nullableString(reminderNotes),
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/app/maintenance?error=${encodeURIComponent(error.message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "maintenance_added",
    title: "Reminder added",
    body: values.due_date ? `Due ${values.due_date}` : null,
    relatedTable: "maintenance_tasks",
    relatedId: task.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/maintenance");
  redirectWithNotice("/app/maintenance", "Reminder added.");
}

export async function createMaintenanceTasksFromPlan(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();

  let payload: unknown;
  try {
    payload = JSON.parse(getString(formData, "tasks") || "[]");
  } catch {
    redirect("/app/maintenance?error=Could not read the selected tasks.");
  }

  const parsed = planTasksSchema.safeParse(payload);
  if (!parsed.success) {
    redirect("/app/maintenance?error=Select at least one task to add.");
  }

  const rows = parsed.data.map((task) => ({
    user_id: user.id,
    home_id: home.id,
    title: task.title,
    category: nullableString(task.category ?? ""),
    recurrence: nullableString(task.recurrence ?? ""),
    due_date: nullableDate(task.due_date ?? ""),
    priority: task.priority || "normal",
    description: nullableString(task.description ?? ""),
    status: "open",
  }));

  const { error } = await supabase.from("maintenance_tasks").insert(rows);
  if (error) {
    redirect(`/app/maintenance?error=${encodeURIComponent(error.message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "maintenance_plan_added",
    title: `Added ${rows.length} ${rows.length === 1 ? "task" : "tasks"} from your maintenance plan`,
    relatedTable: "maintenance_tasks",
  });

  revalidatePath("/app");
  revalidatePath("/app/maintenance");
  redirectWithNotice(
    "/app/maintenance",
    `Added ${rows.length} ${rows.length === 1 ? "task" : "tasks"} to your plan.`,
  );
}

export async function createDocumentRecord(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = documentRecordSchema.safeParse({
    title: getString(formData, "title"),
    category: getString(formData, "category"),
    issued_on: getString(formData, "issued_on"),
    expires_on: getString(formData, "expires_on"),
    notes: getString(formData, "notes"),
    reminder_title: getString(formData, "reminder_title"),
    reminder_date: getString(formData, "reminder_date"),
  });

  if (!parsed.success) {
    redirect("/app/documents?error=Enter a document title and choose a category.");
  }

  const values = parsed.data;
  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      document_type: nullableString(values.category ?? ""),
      category: nullableString(values.category ?? ""),
      issued_on: nullableDate(values.issued_on ?? ""),
      expires_on: nullableDate(values.expires_on ?? ""),
      source: "manual",
      notes: nullableString(values.notes ?? ""),
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/app/documents?error=${encodeURIComponent(error.message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "document_added",
    title: "Document saved",
    body: values.category || null,
    relatedTable: "documents",
    relatedId: document.id,
  });

  // When the document carries a real deadline (renewal/expiry), turn it into a
  // reminder so the vault actively protects the homeowner instead of just
  // storing files. Failure here must not block saving the document.
  const reminderTitle = nullableString(values.reminder_title ?? "");
  const reminderDate = nullableDate(values.reminder_date ?? "");
  let reminderCreated = false;
  if (reminderTitle && reminderDate) {
    const { error: reminderError } = await supabase.from("maintenance_tasks").insert({
      user_id: user.id,
      home_id: home.id,
      title: reminderTitle,
      category: nullableString(values.category ?? ""),
      due_date: reminderDate,
      description: `From document: ${values.title}`,
      status: "open",
    });
    reminderCreated = !reminderError;
  }

  revalidatePath("/app");
  revalidatePath("/app/documents");
  revalidatePath("/app/maintenance");
  redirectWithNotice(
    "/app/documents",
    reminderCreated ? "Document saved and reminder added." : "Document saved.",
  );
}

export async function deleteDocumentRecord(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = recordDeleteSchema.safeParse({
    record_id: getString(formData, "record_id"),
    return_path: getString(formData, "return_path") || "/app/documents",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/documents", "That document could not be removed.");
  }

  const values = parsed.data;
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id,title")
    .eq("id", values.record_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (documentError || !document) {
    redirectWithNotice(values.return_path, "That document could not be found.");
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", document.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "That document could not be removed.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "document_deleted",
    title: "Document removed",
    body: document.title,
    relatedTable: "documents",
    relatedId: document.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/documents");
  revalidatePath("/app/warranties");
  redirectWithNotice(values.return_path, "Document removed.");
}

export async function createInventoryItem(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = inventoryItemSchema.safeParse({
    name: getString(formData, "name"),
    category: getString(formData, "category"),
    room_or_area: getString(formData, "room_or_area"),
    brand: getString(formData, "brand"),
    model_number: getString(formData, "model_number"),
    serial_number: getString(formData, "serial_number"),
    purchase_date: getString(formData, "purchase_date"),
    purchase_price: getString(formData, "purchase_price"),
    warranty_expires_on: getString(formData, "warranty_expires_on"),
    notes: getString(formData, "notes"),
  });

  if (!parsed.success) {
    redirect("/app/inventory?error=Enter an appliance or item name.");
  }

  const values = parsed.data;
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      user_id: user.id,
      home_id: home.id,
      name: values.name,
      category: nullableString(values.category ?? ""),
      room_or_area: nullableString(values.room_or_area ?? ""),
      brand: nullableString(values.brand ?? ""),
      model_number: nullableString(values.model_number ?? ""),
      serial_number: nullableString(values.serial_number ?? ""),
      purchase_date: nullableDate(values.purchase_date ?? ""),
      purchase_price: nullableMoney(values.purchase_price ?? ""),
      warranty_expires_on: nullableDate(values.warranty_expires_on ?? ""),
      notes: nullableString(values.notes ?? ""),
    })
    .select("id")
    .single();

  if (error) {
    const message = isMissingSchemaError(error)
      ? homeownerOsMigrationMessage
      : error.message;
    redirect(`/app/inventory?error=${encodeURIComponent(message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "inventory_added",
    title: `${values.name} added to inventory`,
    body: values.warranty_expires_on
      ? `Warranty expires ${values.warranty_expires_on}`
      : null,
    relatedTable: "inventory_items",
    relatedId: item.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/inventory");
  redirect("/app/inventory");
}

export async function deleteInventoryItem(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = recordDeleteSchema.safeParse({
    record_id: getString(formData, "record_id"),
    return_path: getString(formData, "return_path") || "/app/inventory",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/inventory", "That item could not be removed.");
  }

  const values = parsed.data;
  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select("id,name")
    .eq("id", values.record_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (itemError || !item) {
    redirectWithNotice(values.return_path, "That item could not be found.");
  }

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", item.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "That item could not be removed.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "inventory_deleted",
    title: "Home item removed",
    body: item.name,
    relatedTable: "inventory_items",
    relatedId: item.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/inventory");
  revalidatePath("/app/warranties");
  redirectWithNotice(values.return_path, "Item removed.");
}

export async function createProject(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = projectSchema.safeParse({
    title: getString(formData, "title"),
    project_type: getString(formData, "project_type"),
    room_or_area: getString(formData, "room_or_area"),
    status: getString(formData, "status"),
    priority: getString(formData, "priority"),
    budget: getString(formData, "budget"),
    target_completion_on: getString(formData, "target_completion_on"),
    notes: getString(formData, "notes"),
  });

  if (!parsed.success) {
    redirect("/app/projects?error=Enter a project title.");
  }

  const values = parsed.data;
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      project_type: values.project_type || "repair",
      room_or_area: nullableString(values.room_or_area ?? ""),
      status: values.status || "planning",
      priority: values.priority || "normal",
      budget: nullableMoney(values.budget ?? ""),
      target_completion_on: nullableDate(values.target_completion_on ?? ""),
      notes: nullableString(values.notes ?? ""),
    })
    .select("id")
    .single();

  if (error) {
    const message = isMissingSchemaError(error)
      ? homeownerOsMigrationMessage
      : error.message;
    redirect(`/app/projects?error=${encodeURIComponent(message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "project_added",
    title: `${values.title} project created`,
    body: values.project_type || null,
    relatedTable: "projects",
    relatedId: project.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/projects");
  redirect("/app/projects");
}

export async function deleteProject(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = recordDeleteSchema.safeParse({
    record_id: getString(formData, "record_id"),
    return_path: getString(formData, "return_path") || "/app/projects",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/projects", "That repair could not be removed.");
  }

  const values = parsed.data;
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,title")
    .eq("id", values.record_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (projectError || !project) {
    redirectWithNotice(values.return_path, "That repair could not be found.");
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", project.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "That repair could not be removed.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "project_deleted",
    title: "Repair removed",
    body: project.title,
    relatedTable: "projects",
    relatedId: project.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/projects");
  revalidatePath("/app/repairs");
  revalidatePath("/app/help");
  redirectWithNotice(values.return_path, "Repair removed.");
}

export async function createRepairIssue(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = repairIssueSchema.safeParse({
    title: getString(formData, "title"),
    category: getString(formData, "category"),
    location: getString(formData, "location"),
    urgency: getString(formData, "urgency"),
    renter_owner_context: getString(formData, "renter_owner_context"),
    description: getString(formData, "description"),
    status: getString(formData, "status"),
  });

  if (!parsed.success) {
    redirectWithNotice("/app/help", "Couldn't save. Try again.");
  }

  const values = parsed.data;
  const guidance = getIssueGuidance({
    category: values.category,
    description: values.description,
    renterOwnerContext: values.renter_owner_context,
    title: values.title,
    urgency: values.urgency,
  });
  const status = values.status === "resolved" ? "resolved" : "next_steps_ready";
  const { data: issue, error } = await supabase
    .from("repair_issues")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      area: values.location,
      category: values.category,
      location: values.location,
      renter_owner_context: nullableString(values.renter_owner_context ?? ""),
      urgency: values.urgency || "monitor",
      description: nullableString(values.description ?? ""),
      recommended_action: guidance.escalation,
      likely_causes: guidance.likelyCauses,
      recommended_steps: guidance.recommendedSteps,
      safety_notes: guidance.safetyNotes,
      escalation_recommendation: guidance.escalation,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      status,
    })
    .select("id")
    .single();

  if (error) {
    const message = isMissingSchemaError(error)
      ? guidedIssueHelpMigrationMessage
      : "Couldn't save. Try again.";
    redirect(`/app/help?error=${encodeURIComponent(message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: status === "resolved" ? "issue_resolved" : "issue_saved",
    title: status === "resolved" ? "Issue resolved" : "Issue saved",
    body: values.title,
    relatedTable: "repair_issues",
    relatedId: issue.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/help");
  revalidatePath("/app/maintenance");
  redirectWithNotice("/app/help", status === "resolved" ? "Issue marked resolved." : "Issue saved.");
}

export async function createIssueFollowUpTask(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = repairIssueSchema.safeParse({
    title: getString(formData, "title"),
    category: getString(formData, "category"),
    location: getString(formData, "location"),
    urgency: getString(formData, "urgency"),
    renter_owner_context: getString(formData, "renter_owner_context"),
    description: getString(formData, "description"),
  });

  if (!parsed.success) {
    redirectWithNotice("/app/help", "Couldn't create task. Try again.");
  }

  const values = parsed.data;
  const guidance = getIssueGuidance({
    category: values.category,
    description: values.description,
    renterOwnerContext: values.renter_owner_context,
    title: values.title,
    urgency: values.urgency,
  });
  const dueDate = suggestedDueDateForIssue(values.urgency);

  const { data: issue, error: issueError } = await supabase
    .from("repair_issues")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      area: values.location,
      category: values.category,
      location: values.location,
      renter_owner_context: nullableString(values.renter_owner_context ?? ""),
      urgency: values.urgency,
      description: values.description,
      recommended_action: guidance.escalation,
      likely_causes: guidance.likelyCauses,
      recommended_steps: guidance.recommendedSteps,
      safety_notes: guidance.safetyNotes,
      escalation_recommendation: guidance.escalation,
      status: "task_created",
    })
    .select("id,title")
    .single();

  if (issueError) {
    redirectWithNotice(
      "/app/help",
      isMissingSchemaError(issueError)
        ? guidedIssueHelpMigrationMessage
        : "Couldn't create task. Try again."
    );
  }

  const { data: task, error: taskError } = await supabase
    .from("maintenance_tasks")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      category: "repair",
      due_date: dueDate,
      recurrence: null,
      priority:
        values.urgency === "urgent" || values.urgency === "high"
          ? "high"
          : "normal",
      description: nullableString(
        [
          values.description,
          values.location ? `Location: ${values.location}` : null,
          values.category ? `Issue type: ${values.category.replaceAll("_", " ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      status: "open",
    })
    .select("id")
    .single();

  if (taskError) {
    redirectWithNotice("/app/help", "Couldn't create task. Try again.");
  }

  const { error: linkError } = await supabase
    .from("repair_issues")
    .update({ related_task_id: task.id })
    .eq("id", issue.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (linkError) {
    redirectWithNotice(
      "/app/help",
      isMissingSchemaError(linkError)
        ? guidedIssueHelpMigrationMessage
        : "Task created, but the issue could not be linked."
    );
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "issue_task_created",
    title: "Issue follow-up created",
    body: issue.title,
    relatedTable: "maintenance_tasks",
    relatedId: task.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/help");
  revalidatePath("/app/maintenance");
  redirectWithNotice("/app/help", "Task created.");
}

export async function createCareTaskFromIssue(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = issueActionSchema.safeParse({
    issue_id: getString(formData, "issue_id"),
    return_path: getString(formData, "return_path") || "/app/help",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/help", "Couldn't create task. Try again.");
  }

  const { data: issue, error: issueError } = await supabase
    .from("repair_issues")
    .select("id,title,description,urgency,category,location,related_task_id")
    .eq("id", parsed.data.issue_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (issueError || !issue) {
    const message =
      issueError && isMissingSchemaError(issueError)
        ? guidedIssueHelpMigrationMessage
        : "Couldn't create task. Try again.";
    redirectWithNotice(parsed.data.return_path, message);
  }

  if (issue.related_task_id) {
    revalidatePath("/app/help");
    revalidatePath("/app/maintenance");
    redirectWithNotice(parsed.data.return_path, "Task already exists.");
  }

  const dueDate = suggestedDueDateForIssue(issue.urgency);
  const { data: task, error } = await supabase
    .from("maintenance_tasks")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: issue.title,
      category: "repair",
      due_date: dueDate,
      recurrence: null,
      priority:
        issue.urgency === "urgent" || issue.urgency === "high"
          ? "high"
          : "normal",
      description: nullableString(
        [
          issue.description,
          issue.location ? `Location: ${issue.location}` : null,
          issue.category ? `Issue type: ${issue.category.replaceAll("_", " ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    redirectWithNotice(parsed.data.return_path, "Couldn't create task. Try again.");
  }

  const { error: updateError } = await supabase
    .from("repair_issues")
    .update({
      related_task_id: task.id,
      status: "task_created",
    })
    .eq("id", issue.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (updateError) {
    redirectWithNotice(
      parsed.data.return_path,
      isMissingSchemaError(updateError)
        ? guidedIssueHelpMigrationMessage
        : "Task created, but the issue could not be linked."
    );
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "issue_task_created",
    title: "Issue follow-up created",
    body: issue.title,
    relatedTable: "maintenance_tasks",
    relatedId: task.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/help");
  revalidatePath("/app/maintenance");
  redirectWithNotice(parsed.data.return_path, "Task created.");
}

export async function resolveRepairIssue(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = issueActionSchema.safeParse({
    issue_id: getString(formData, "issue_id"),
    return_path: getString(formData, "return_path") || "/app/help",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/help", "Couldn't save. Try again.");
  }

  const { data: issue, error } = await supabase
    .from("repair_issues")
    .update({
      resolved_at: new Date().toISOString(),
      status: "resolved",
    })
    .eq("id", parsed.data.issue_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .select("id,title")
    .single();

  if (error) {
    redirectWithNotice(
      parsed.data.return_path,
      isMissingSchemaError(error) ? guidedIssueHelpMigrationMessage : "Couldn't save. Try again."
    );
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "issue_resolved",
    title: "Issue resolved",
    body: issue.title,
    relatedTable: "repair_issues",
    relatedId: issue.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/help");
  redirectWithNotice(parsed.data.return_path, "Issue resolved.");
}

export async function deleteRepairIssue(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = recordDeleteSchema.safeParse({
    record_id: getString(formData, "record_id"),
    return_path: getString(formData, "return_path") || "/app/help",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/help", "That issue could not be removed.");
  }

  const values = parsed.data;
  const { data: issue, error: issueError } = await supabase
    .from("repair_issues")
    .select("id,title")
    .eq("id", values.record_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (issueError || !issue) {
    redirectWithNotice(values.return_path, "That issue could not be found.");
  }

  const { error } = await supabase
    .from("repair_issues")
    .delete()
    .eq("id", issue.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(values.return_path, "That issue could not be removed.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "issue_deleted",
    title: "Issue removed",
    body: issue.title,
    relatedTable: "repair_issues",
    relatedId: issue.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/help");
  revalidatePath("/app/maintenance");
  redirectWithNotice(values.return_path, "Issue removed.");
}

export async function addRepairIssueNote(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = issueNoteSchema.safeParse({
    issue_id: getString(formData, "issue_id"),
    note: getString(formData, "note"),
    return_path: getString(formData, "return_path") || "/app/help",
  });

  if (!parsed.success) {
    redirectWithNotice("/app/help", "Couldn't save. Try again.");
  }

  const { data: issue, error: issueError } = await supabase
    .from("repair_issues")
    .select("id,title,description")
    .eq("id", parsed.data.issue_id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (issueError || !issue) {
    redirectWithNotice(parsed.data.return_path, "Couldn't save. Try again.");
  }

  const noteLine = `Note ${new Date().toLocaleDateString("en-CA")}: ${parsed.data.note}`;
  const { error } = await supabase
    .from("repair_issues")
    .update({
      description: [issue.description, noteLine].filter(Boolean).join("\n\n"),
    })
    .eq("id", issue.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    redirectWithNotice(parsed.data.return_path, "Couldn't save. Try again.");
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "issue_note_added",
    title: "Note added",
    body: issue.title,
    relatedTable: "repair_issues",
    relatedId: issue.id,
  });

  revalidatePath("/app/help");
  redirectWithNotice(parsed.data.return_path, "Note added.");
}

export async function logout() {
  if (!hasSupabaseEnv()) {
    redirect("/");
  }

  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/");
}
