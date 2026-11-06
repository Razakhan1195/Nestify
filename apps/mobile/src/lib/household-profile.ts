import { supabase } from "@/lib/supabase";
import { fetchHousehold } from "./household-data";
import { saveHouseholdName } from "./household-name-save";
export async function renameHousehold(homeId: string, expected: string, name: string, userId: string) {
  return saveHouseholdName({
    access: async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId) return null;
      const p = await fetchHousehold();
      return !("needsOnboarding" in p) && p.available ? { id: p.home.id, role: p.accessRole ?? "unknown" } : null;
    },
    update: async (id, previous, next) => {
      // Database owner RLS is the authority; a client role is never a grant.
      const { data, error } = await supabase.from("homes").update({ nickname: next }).eq("id", id).eq("user_id", userId).eq("nickname", previous).select("id").maybeSingle();
      if (error) throw new Error("Couldn’t confirm the name change. Your edit is kept here; try again.");
      return Boolean(data);
    },
    read: async id => {
      const { data, error } = await supabase.from("homes").select("nickname").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw new Error("Couldn’t check the saved name. Try again when connected.");
      return data?.nickname ?? null;
    },
  }, homeId, expected, name);
}
