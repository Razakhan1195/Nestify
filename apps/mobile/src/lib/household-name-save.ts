import { householdName } from "./profile-identity";
export type HouseholdNameStore = {
  access: () => Promise<{ id: string; role: string } | null>;
  update: (homeId: string, expected: string, name: string) => Promise<boolean>;
  read: (homeId: string) => Promise<string | null>;
};
/** Narrow, idempotent rename. Never resubmit the address/profile to rename a home. */
export async function saveHouseholdName(store: HouseholdNameStore, homeId: string, expected: string, input: string) {
  const name = householdName(input);
  const access = await store.access();
  if (!access || access.id !== homeId || access.role !== "owner") throw new Error("Only the household owner can change this name.");
  if (await store.update(homeId, expected, name)) return name;
  if (await store.read(homeId) === name) return name;
  throw new Error("The household changed or is no longer available. Reopen this screen to load its current name.");
}
