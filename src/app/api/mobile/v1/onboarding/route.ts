import { NextResponse } from "next/server";

import {
  homeTypeOptions,
  onboardingActions,
  onboardingGoals,
  ownershipTypeOptions,
} from "@/lib/onboarding/config";
import {
  homeProfileSchema,
  homeProfileValidationMessage,
  homeProfileToDatabase,
} from "@/lib/onboarding/home-profile";
import { resolveAccessibleHome } from "@/lib/household/access";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

const homeSelect =
  "id,nickname,street_address,city,province,postal_code,home_type,ownership_type,closing_date,approximate_year_built,created_at";

async function getMobileHome(
  supabase: NonNullable<Awaited<ReturnType<typeof authenticateMobileRequest>>["supabase"]>,
  userId: string,
) {
  return supabase
    .from("homes")
    .select(homeSelect)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
}
function configPayload() {
  return {
    addressSearchAvailable: process.env.GOOGLE_PLACES_ENABLED === "true" && Boolean(process.env.GOOGLE_PLACES_API_KEY),
    goals: onboardingGoals,
    actions: onboardingActions,
    homeTypeOptions,
    ownershipTypeOptions,
  };
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const { data: ownedHome, error } = await getMobileHome(auth.supabase, auth.user.id);
  if (error) {
    return NextResponse.json(
      { error: "Could not load your place profile." },
      { status: 500 },
    );
  }
  if (ownedHome) {
    return NextResponse.json({ home: ownedHome, accessRole: "owner", ...configPayload() });
  }

  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error) {
    return NextResponse.json({ error: "Could not load your household." }, { status: 500 });
  }
  if (access.data?.role === "member") {
    const { data: joinedHome, error: joinedHomeError } = await auth.supabase
      .from("homes")
      .select(homeSelect)
      .eq("id", access.data.home.id)
      .maybeSingle();
    if (joinedHomeError) {
      return NextResponse.json({ error: "Could not load your household." }, { status: 500 });
    }
    return NextResponse.json({ home: joinedHome, accessRole: "member", ...configPayload() });
  }

  const groups = await auth.supabase.rpc("rezlee_has_expense_groups");
  if (groups.error) return NextResponse.json({ error: "Could not check your expense groups. Try again." }, { status: 503 });
  return NextResponse.json({ home: null, accessRole: null, expenseGroupsAvailable: groups.data === true, ...configPayload() });
}

async function parseHomeRequest(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = homeProfileSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        {
          error: homeProfileValidationMessage(parsed.error.flatten().fieldErrors),
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    } as const;
  }

  return { values: parsed.data } as const;
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const parsed = await parseHomeRequest(request);
  if ("error" in parsed) return parsed.error;

  const current = await getMobileHome(auth.supabase, auth.user.id);
  if (current.error) {
    return NextResponse.json(
      { error: "Could not check your existing place profile." },
      { status: 500 },
    );
  }
  if (current.data) {
    return NextResponse.json({
      home: current.data,
      alreadyExists: true,
      ...configPayload(),
    });
  }

  const { data: home, error } = await auth.supabase
    .from("homes")
    .insert({
      user_id: auth.user.id,
      ...homeProfileToDatabase(parsed.values),
    })
    .select(homeSelect)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not create your place profile." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { home, created: true, ...configPayload() },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }
  const parsed = await parseHomeRequest(request);
  if ("error" in parsed) return parsed.error;

  const current = await getMobileHome(auth.supabase, auth.user.id);
  if (current.error) {
    return NextResponse.json(
      { error: "Could not load your place profile." },
      { status: 500 },
    );
  }
  if (!current.data) {
    return NextResponse.json(
      { error: "Set up your place before editing it." },
      { status: 404 },
    );
  }

  const { data: home, error } = await auth.supabase
    .from("homes")
    .update(homeProfileToDatabase(parsed.values))
    .eq("id", current.data.id)
    .eq("user_id", auth.user.id)
    .select(homeSelect)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not save your place profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({ home, ...configPayload() });
}
