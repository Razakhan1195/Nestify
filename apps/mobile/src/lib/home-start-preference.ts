import { supabase } from "@/lib/supabase";
import type { StartingGoal } from "./home-start";

export async function saveStartingGoal(homeId: string, goal: StartingGoal) {
  const { error } = await supabase.auth.updateUser({
    data: { rezlee_start: { version: 1, homeId, goal } },
  });
  if (error) throw new Error("We couldn’t save your starting choice. Please try again.");
}
