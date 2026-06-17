import { redirect } from "next/navigation";

import { HomeSettingsForm } from "@/components/settings/home-settings-form";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const home = await requireCurrentUserHome(user.id);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Home identity
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Home Profile
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep the property details Dwellwise uses to organize providers, bills,
          documents, and reminders.
        </p>
      </div>
      <HomeSettingsForm home={home} />
    </div>
  );
}
