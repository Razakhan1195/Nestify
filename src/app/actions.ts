"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  hasSupabaseEnv,
  missingSupabaseEnvMessage,
} from "@/lib/supabase/env";
import { getCurrentUserHome } from "@/lib/homes";
import { getProviderSetupByName, requireOwnedProvider } from "@/lib/providers";
import {
  homeownerOsMigrationMessage,
  isMissingSchemaError,
} from "@/lib/schema-errors";

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
  category_id: z.string().uuid(),
  category_name: z.string().min(1),
});

const manualBillSchema = z.object({
  provider_name: z.string().min(1, "Enter a provider or bill name.").max(120),
  amount: z.string().optional(),
  due_date: z.string().optional(),
  frequency: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const maintenanceTaskSchema = z.object({
  title: z.string().min(1, "Enter a task title.").max(140),
  category: z.string().optional(),
  due_date: z.string().optional(),
  recurrence: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
});

const documentRecordSchema = z.object({
  title: z.string().min(1, "Enter a document title.").max(160),
  category: z.string().optional(),
  expires_on: z.string().optional(),
  notes: z.string().optional(),
});

const inventoryItemSchema = z.object({
  name: z.string().min(1, "Enter an item name.").max(140),
  category: z.string().optional(),
  room_or_area: z.string().optional(),
  brand: z.string().optional(),
  model_number: z.string().optional(),
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
  area: z.string().optional(),
  urgency: z.string().optional(),
  description: z.string().optional(),
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
  });

  if (!parsed.success) {
    redirect("/app/providers?error=Choose a provider category.");
  }

  const setup = getProviderSetupByName(parsed.data.category_name);

  if (!setup) {
    redirect("/app/providers?error=Unknown provider category.");
  }

  const { data: existingProvider, error: existingError } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .eq("category_id", parsed.data.category_id)
    .maybeSingle();

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
      category_id: parsed.data.category_id,
      name: setup.name,
      display_name: setup.name,
      provider_priority: setup.priority,
      connection_status: "added_manual",
      health_status: "needs_attention",
      sync_frequency: setup.syncFrequency,
      requires_user_action: true,
      user_action_message:
        "Connect this provider when integrations are available. For now, Dwellwise will track it as a manual provider.",
      data_capabilities: setup.capabilities,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/app/providers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/providers");
  redirect(`/app/providers/${provider.id}`);
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
    provider_name: getString(formData, "provider_name"),
    amount: getString(formData, "amount"),
    due_date: getString(formData, "due_date"),
    frequency: getString(formData, "frequency"),
    status: getString(formData, "status"),
    notes: getString(formData, "notes"),
  });

  if (!parsed.success) {
    redirect("/app/bills?error=Enter at least a bill or provider name.");
  }

  const values = parsed.data;
  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      user_id: user.id,
      home_id: home.id,
      name: values.provider_name,
      amount: nullableMoney(values.amount ?? ""),
      due_date: nullableDate(values.due_date ?? ""),
      frequency: nullableString(values.frequency ?? ""),
      recurrence: nullableString(values.frequency ?? ""),
      status: values.status || "upcoming",
      source: "manual",
      notes: nullableString(values.notes ?? ""),
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
    title: `${values.provider_name} bill added`,
    body: values.due_date ? `Due ${values.due_date}` : null,
    relatedTable: "bills",
    relatedId: bill.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/bills");
  redirect("/app/bills");
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
  });

  if (!parsed.success) {
    redirect("/app/maintenance?error=Enter a maintenance task title.");
  }

  const values = parsed.data;
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
      description: nullableString(values.description ?? ""),
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
    title: `${values.title} added`,
    body: values.due_date ? `Due ${values.due_date}` : null,
    relatedTable: "maintenance_tasks",
    relatedId: task.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/maintenance");
  redirect("/app/maintenance");
}

export async function createDocumentRecord(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = documentRecordSchema.safeParse({
    title: getString(formData, "title"),
    category: getString(formData, "category"),
    expires_on: getString(formData, "expires_on"),
    notes: getString(formData, "notes"),
  });

  if (!parsed.success) {
    redirect("/app/documents?error=Enter a document title.");
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
    title: `${values.title} saved`,
    body: values.category || null,
    relatedTable: "documents",
    relatedId: document.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/documents");
  redirect("/app/documents");
}

export async function createInventoryItem(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = inventoryItemSchema.safeParse({
    name: getString(formData, "name"),
    category: getString(formData, "category"),
    room_or_area: getString(formData, "room_or_area"),
    brand: getString(formData, "brand"),
    model_number: getString(formData, "model_number"),
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

export async function createRepairIssue(formData: FormData) {
  const { home, supabase, user } = await requireUserAndHome();
  const parsed = repairIssueSchema.safeParse({
    title: getString(formData, "title"),
    area: getString(formData, "area"),
    urgency: getString(formData, "urgency"),
    description: getString(formData, "description"),
  });

  if (!parsed.success) {
    redirect("/app/assistant?error=Describe the home issue first.");
  }

  const values = parsed.data;
  const { data: issue, error } = await supabase
    .from("repair_issues")
    .insert({
      user_id: user.id,
      home_id: home.id,
      title: values.title,
      area: nullableString(values.area ?? ""),
      urgency: values.urgency || "monitor",
      description: nullableString(values.description ?? ""),
      recommended_action:
        values.urgency === "urgent"
          ? "Consider contacting a licensed professional."
          : "Track this issue and decide whether it should become a project or maintenance task.",
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    const message = isMissingSchemaError(error)
      ? homeownerOsMigrationMessage
      : error.message;
    redirect(`/app/assistant?error=${encodeURIComponent(message)}`);
  }

  await createTimelineEvent({
    userId: user.id,
    homeId: home.id,
    eventType: "repair_issue_added",
    title: `${values.title} issue logged`,
    body: values.area || null,
    relatedTable: "repair_issues",
    relatedId: issue.id,
  });

  revalidatePath("/app");
  revalidatePath("/app/assistant");
  redirect("/app/assistant");
}

export async function logout() {
  if (!hasSupabaseEnv()) {
    redirect("/");
  }

  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/");
}
