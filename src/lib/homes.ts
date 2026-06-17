import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CurrentHome = {
  id: string;
  user_id: string;
  nickname: string;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  home_type: string | null;
  ownership_type: string | null;
  closing_date: string | null;
  approximate_year_built: number | null;
  square_feet?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  heating_type?: string | null;
  cooling_type?: string | null;
  roof_year?: number | null;
  furnace_year?: number | null;
  water_heater_year?: number | null;
  insurance_renewal_date?: string | null;
  property_tax_due_date?: string | null;
  created_at: string;
};

export async function getCurrentUserHome(userId: string) {
  const supabase = await createClient();

  return supabase
    .from("homes")
    .select(
      "id,user_id,nickname,street_address,city,province,postal_code,country,home_type,ownership_type,closing_date,approximate_year_built,created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<CurrentHome>();
}

export async function requireCurrentUserHome(userId: string) {
  const { data: home, error } = await getCurrentUserHome(userId);

  if (error) {
    throw new Error(error.message);
  }

  if (!home) {
    redirect("/app/onboarding");
  }

  return home;
}
