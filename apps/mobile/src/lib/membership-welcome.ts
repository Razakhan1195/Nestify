import type { Membership } from "./membership-types";

/** Copy follows verified access; a shared or temporary grant is never called lifetime. */
export function proWelcomeCopy(m: Membership) {
  if (m.household) return { label: "SHARED WITH YOUR HOUSEHOLD", detail: "Your household includes Pro. Your own bills and records stay private." };
  if (m.lifetime) return { label: "YOURS FOR LIFE", detail: m.founderReason === "waitlist" ? "Thank you for joining our waitlist. Your Rezlee Pro membership is free for life, with no renewal." : m.founderReason === "first_1000" ? "You’re one of our first 1,000 members. Enjoy Rezlee Pro free for life, with no renewal." : "Your founding membership includes Rezlee Pro free for life, with no renewal." };
  if (m.source === "referral") return { label: "A GIFT FROM A FRIEND", detail: "Enjoy your free month of Pro. No card needed and no automatic renewal." };
  if (m.source === "store") return { label: "YOUR MEMBERSHIP IS ACTIVE", detail: "Your subscription is confirmed. Manage your plan or renewal at any time in your app store." };
  return { label: "MORE HELP AT HOME", detail: "Your Pro access is ready. Your membership page shows how long it’s included." };
}
