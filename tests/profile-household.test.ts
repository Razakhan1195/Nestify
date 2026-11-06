import test from "node:test";
import assert from "node:assert/strict";
import { badgeMetadata, profileBadge, householdName, profileName } from "../apps/mobile/src/lib/profile-identity";
import { saveHouseholdName, type HouseholdNameStore } from "../apps/mobile/src/lib/household-name-save";

test("badge data accepts bounded initials and palette values, ignoring unrelated or malformed metadata", () => {
  assert.equal(profileBadge({ full_name: "Raza Khan" }).initials, "RK");
  assert.equal(profileBadge({ rezlee_badge: { initials: "<script>", colour: "javascript:" } }).colour.id, "forest");
  assert.deepEqual(badgeMetadata(" rk ", "lake"), { rezlee_badge: { initials: "RK", colour: "lake" } });
  assert.throws(() => badgeMetadata("ABC", "forest"));
  assert.throws(() => badgeMetadata("RK", "unknown"));
  assert.throws(() => householdName("   "));
  assert.throws(() => householdName("x".repeat(81)));
});
function store(role = "owner") {
  let name = "Old name", writes = 0;
  const adapter: HouseholdNameStore = {
    access: async () => ({ id: "home", role }),
    update: async (_, expected, next) => { writes++; if (name !== expected) return false; name = next; return true; },
    read: async () => name,
  };
  return { adapter, name: () => name, writes: () => writes };
}
test("household rename persists only after permitted write and safely retries a lost success", async () => {
  const s = store();
  assert.equal(await saveHouseholdName(s.adapter, "home", "Old name", " New name "), "New name");
  assert.equal(await saveHouseholdName(s.adapter, "home", "Old name", "New name"), "New name");
  assert.equal(s.name(), "New name");
});
test("members and mismatched households cannot initiate rename", async () => {
  const s = store("member");
  await assert.rejects(saveHouseholdName(s.adapter, "home", "Old name", "New"));
  assert.equal(s.writes(), 0);
  const owner = store();
  await assert.rejects(saveHouseholdName(owner.adapter, "foreign", "Old name", "New"));
  assert.equal(owner.writes(), 0);
});
test("concurrent household edits and failed persistence never report success", async () => {
  const s = store();
  await assert.rejects(saveHouseholdName(s.adapter, "home", "Stale name", "New"), /changed/);
  assert.equal(s.name(), "Old name");
  await assert.rejects(saveHouseholdName({ ...s.adapter, update: async () => { throw Error("offline"); } }, "home", "Old name", "New"), /offline/);
});

test("chosen display names survive stale provider metadata without inventing surnames",()=>{
 assert.equal(profileName({rezlee_display_name:"李 明",full_name:"Old provider"}),"李 明");
 assert.equal(profileName({rezlee_display_name:"Prince",name:"Provider Name"}),"Prince");
 assert.equal(profileName({full_name:"",name:"Amélie O’Neil"}),"Amélie O’Neil");
 assert.equal(profileName({email:"name@example.com"}),"");
 assert.equal(profileName({rezlee_display_name:"Jean-Luc van der Meer"}),"Jean-Luc van der Meer");
});
