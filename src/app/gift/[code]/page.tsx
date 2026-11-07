import Link from "next/link";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your Rezlee gift", robots: { index: false, follow: false }, referrer: "no-referrer" };
async function requestTime() { return Date.now(); }
export default async function GiftLanding({ params }: { params: Promise<{ code: string }> }) {
 const { code } = await params;
 const now = await requestTime();
 const valid = z.string().uuid().safeParse(code);
 let gift: { realtor_name: string; claim_by: string; revoked_at: string | null; claimed_at: string | null } | null = null;
 let receipt: { expires_at: string; revoked_at: string | null } | null = null;
 let unavailable = false;
 try {
  if (valid.success) {
   const db = createAdminClient();
   const result = await db.from("rezlee_gift_invitations").select("realtor_name,claim_by,revoked_at,claimed_at").eq("id", code).maybeSingle();
   if (result.error) throw Error("Gift lookup unavailable");
   gift = result.data;
   if (gift?.claimed_at) {
    const claim = await db.from("rezlee_annual_gifts").select("expires_at,revoked_at").eq("id", code).maybeSingle();
    if (claim.error) throw Error("Gift receipt unavailable");
    receipt = claim.data;
   }
  }
 } catch { unavailable = true; }
 const active = !unavailable && gift && !gift.revoked_at && (gift.claimed_at ? receipt && !receipt.revoked_at && Date.parse(receipt.expires_at) > now : Date.parse(gift.claim_by) > now);
 const ended = !unavailable && gift?.claimed_at && receipt && !receipt.revoked_at && Date.parse(receipt.expires_at) <= now;
 return <main className="min-h-screen bg-background px-6 py-10"><div className="mx-auto max-w-lg space-y-7">
  <Link href="/" className="text-2xl font-semibold tracking-tight">rezlee</Link>
  <p className="text-xs font-semibold uppercase tracking-widest text-primary">A thoughtful start at home</p>
  <h1 className="font-serif text-5xl leading-tight">{unavailable ? "Let’s try that again." : ended ? "Your gift year has ended." : active ? gift?.claimed_at ? "Your welcome-home gift." : "A little less to manage. A year on us." : "Let’s check your invitation."}</h1>
  {unavailable ? <><p>We couldn’t check this invitation right now. Your account and any existing membership are unchanged.</p><Link className="inline-block rounded-xl bg-primary px-6 py-4 font-semibold text-primary-foreground" href={"/gift/" + code}>Try again</Link></> : active && gift ? <>
   <p className="text-lg text-muted-foreground">{gift.realtor_name}{gift.claimed_at ? " gave you a year of Rezlee Pro." : " has invited you to a year of Rezlee Pro."}</p>
   <section className="space-y-4 rounded-3xl bg-primary p-8 text-primary-foreground"><h2 className="text-xl font-semibold">Make yourself at home.</h2><p>Keep bills and records together. Share everyday costs and tasks. Get more help with the decisions around your home.</p><p>{receipt ? "This gift runs through " + new Date(receipt.expires_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) + "." : "365 days from activation."} No card required. No automatic renewal.</p></section>
   <p>{gift.claimed_at ? "Open Rezlee and sign in with the account that claimed this gift." : "Open the invitation in Rezlee, then sign up or sign in with the email your realtor invited. We’ll link the gift after your email is verified."}</p>
   <a className="block rounded-xl bg-primary px-6 py-4 text-center font-semibold text-primary-foreground" href={"rezlee://gift?code=" + code}>Open my gift in Rezlee</a>
   <p className="text-sm text-muted-foreground">If you haven’t installed Rezlee, use your app listing or testing invitation, then reopen this link. Already have Pro? Your existing membership is protected; contact support before replacing it.</p>
   <p className="text-sm text-muted-foreground">Your realtor cannot see your bills, documents or household activity.</p>
  </> : ended && receipt ? <><p>This gift ended on {new Date(receipt.expires_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}. Your saved records remain available. Open Rezlee to check your current membership.</p><a className="block rounded-xl bg-primary px-6 py-4 text-center font-semibold text-primary-foreground" href={"rezlee://gift?code=" + code}>Open Rezlee</a></> : <p>This link may have expired or been withdrawn. Ask your realtor for a new invitation, or contact <a className="underline" href="mailto:support@rezlee.com">support@rezlee.com</a>. Your existing account is unaffected.</p>}
 </div></main>;
}
