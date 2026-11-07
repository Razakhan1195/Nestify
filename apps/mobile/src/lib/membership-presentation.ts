import type { MembershipPayload } from "./membership-types";
export function membershipPresentation(data: MembershipPayload | null) {
  const m = data?.membership;
  if (!data || (data.enabled && !m)) return { title: "Your membership", badge: "CHECKING ACCESS", detail: "Your plan will appear once it’s confirmed.", action: "View membership", pro: false, lifetime: false };
  if (m?.plan === "pro" && m.household) return { title: "Rezlee Pro", badge: "SHARED WITH YOUR HOUSEHOLD", detail: "More help at home, included through your household. Your private records stay private.", action: "See your benefits", pro: true, lifetime: false };
  if (m?.plan === "pro" && m.lifetime) return { title: "Rezlee Pro", badge: "FOUNDING MEMBER · PRO FOR LIFE", detail: m.founderReason === "first_1000" ? "You’re one of Rezlee’s first 1,000 members. That includes free Pro for life—even without joining the waitlist." : m.founderReason === "waitlist" ? "Your waitlist membership includes free Pro for life." : "Your founding membership includes free Pro for life, with no renewal.", action: "See your benefits", pro: true, lifetime: true };
  if (m?.plan === "pro" && m.source === "annual_gift") return {title:"Rezlee Pro",badge:"YOUR ANNUAL GIFT",detail:`A year of help at home${m.expiresAt ? " through " + new Date(m.expiresAt).toLocaleDateString("en-CA") : ""}. No automatic renewal.`,action:"See your benefits",pro:true,lifetime:false};
  if (m?.plan === "pro" && m.source === "referral") return {title:"Rezlee Pro",badge:"YOUR GIFT MONTH",detail:"A month of Pro from a friend. No payment details or automatic renewal.",action:"See your benefits",pro:true,lifetime:false};
  if (m?.plan === "pro") return { title: "Rezlee Pro", badge: "YOUR CURRENT PLAN", detail: "Connected bills and practical help for the decisions around your home.", action: "Manage membership", pro: true, lifetime: false };
  return { title: "Rezlee", badge: "YOUR FREE PLAN", detail: "Keep your bills, home records and shared to-dos together. A useful home base, on us.", action: "Explore Rezlee Pro", pro: false, lifetime: false };
}
export const membershipComparison = [
  { feature: "Saved bills, originals & home records", free: "Included", pro: "Included" },
  { feature: "Shared routines, assignments & recurring reminders", free: "Included", pro: "Included" },
  { feature: "AI bill scans", free: "3 / month", pro: "No monthly bill-count limit" },
  { feature: "Supported provider imports", free: "Manual uploads", pro: "Connect & retrieve" },
  { feature: "Other AI help around your home", free: "3 requests / month", pro: "50 requests / month" },
  { feature: "Quote, compatibility & repair-or-replace decisions", free: "—", pro: "Included" },
  { feature: "Pro benefits for your household", free: "—", pro: "Included" },
] as const;

