import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RezleeLogo } from "@/components/brand/rezlee-logo";
import { createClient } from "@/lib/supabase/server";
import { invitationNeedsPassword, type InviteContext } from "@/lib/household/invitation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function acceptInvite(formData: FormData) {
  "use server";
  const memberId=String(formData.get("member")??"");
  if(!uuidPattern.test(memberId))redirect("/invite/open?error=invalid");
  const supabase=await createClient();
  const {data:authData}=await supabase.auth.getUser();
  if(!authData.user)redirect("/invite/open?error=expired");
  const {data,error:contextError}=await supabase.rpc("get_rezlee_household_invite",{member_id:memberId});
  const context=data as InviteContext|null;
  if(context?.state==="active")redirect(`/invite/accept?member=${encodeURIComponent(memberId)}`);
  if(contextError||context?.state!=="pending")redirect(`/invite/accept?member=${encodeURIComponent(memberId)}`);
  // Hidden form values never decide account state or whether membership exists.
  if(invitationNeedsPassword(authData.user.user_metadata,memberId)) {
    const password=String(formData.get("password")??""),confirmation=String(formData.get("passwordConfirm")??"");
    const issue=password.length<8||password.length>128?"Choose a password with 8 to 128 characters.":password!==confirmation?"Those passwords do not match.":null;
    if(issue)redirect(`/invite/accept?member=${encodeURIComponent(memberId)}&error=${encodeURIComponent(issue)}`);
    const {error}=await supabase.auth.updateUser({password});
    if(error)redirect(`/invite/accept?member=${encodeURIComponent(memberId)}&error=${encodeURIComponent("We could not save your password. Please try again.")}`);
  }
  const {error}=await supabase.rpc("accept_household_invite",{member_id:memberId});
  if(error)redirect(`/invite/accept?member=${encodeURIComponent(memberId)}&error=${encodeURIComponent("We could not confirm joining. Your current household is unchanged; review the invitation and try again.")}`);
  redirect(`/invite/accept?member=${encodeURIComponent(memberId)}`);
}

type InvitePageProps = {
  searchParams: Promise<{
    member?: string | string[];
    error?: string | string[];
    joined?: string | string[];
  }>;
};

function Feature({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#D9DED5] bg-white/80 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E5EEE7] text-lg">{icon}</div>
      <p className="font-semibold text-[#1E352B]">{title}</p>
      <p className="mt-1 text-sm leading-5 text-[#657068]">{detail}</p>
    </div>
  );
}

export default async function HouseholdInvitePage({ searchParams }: InvitePageProps) {
  const params = await searchParams;
  const memberId = typeof params.member === "string" ? params.member : "";
  const errorMessage = typeof params.error === "string" ? params.error : null;


  if (!uuidPattern.test(memberId)) redirect("/login?error=Invalid household invitation.");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?error=${encodeURIComponent("Open the original household invitation email to continue.")}`);

  const {data,error:contextError}=await supabase.rpc("get_rezlee_household_invite",{member_id:memberId});
  const context=data as InviteContext|null;
  if(contextError||!context||!["pending","active"].includes(context.state)) {
    const title=contextError?"We couldn’t load this invitation":context?.state==="other_household"?"You already have a household":context?.state==="expired"?"This invitation has expired":"This invitation isn’t available";
    const detail=contextError?"Your household access has not changed. Try loading the invitation again.":context?.state==="other_household"?"This version supports one active household. Joining another would hide one of your households, so your existing home stays unchanged.":"Ask the household owner to cancel the pending invitation and send a new one. If you already joined, sign in to Rezlee with the invited email address.";
    return <main className="min-h-screen bg-[#F7F4EC] px-5 py-12 text-[#1E352B]"><div className="mx-auto max-w-md space-y-8"><RezleeLogo/><section className="space-y-5 rounded-3xl border border-[#D9DED5] bg-white p-7"><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm leading-6 text-[#657068]">{detail}</p>{contextError?<Link className="inline-flex min-h-12 items-center font-semibold" href={`/invite/accept?member=${encodeURIComponent(memberId)}`}>Try again</Link>:<Link className="inline-flex min-h-12 items-center font-semibold" href="/app">Return to Rezlee</Link>}</section></div></main>;
  }
  const inviterName=context.inviterName??"Your household owner",homeName=context.homeName??"your household";
  const needsPassword=invitationNeedsPassword(authData.user.user_metadata,memberId);
  if (context.state === "active") {
    return (
      <main className="min-h-screen bg-[#F7F4EC] px-5 py-10 text-[#1E352B]">
        <div className="mx-auto max-w-xl">
          <div className="mb-10 flex justify-center"><RezleeLogo /></div>
          <div className="overflow-hidden rounded-[32px] border border-[#D9DED5] bg-white shadow-sm">
            <div className="bg-[#244A3A] px-7 py-10 text-center text-white sm:px-10">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/12 text-3xl">✓</div>
              <h1 className="text-3xl font-semibold tracking-tight">You’re in.</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/75">You’ve joined {homeName} on Rezlee. Shared responsibilities can now stay with the household instead of living in one person’s head.</p>
            </div>
            <div className="space-y-5 p-7 sm:p-10">
              <a href={`rezlee://login?email=${encodeURIComponent(authData.user.email ?? "")}&joined=1&household=${encodeURIComponent(homeName)}`} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#244A3A] px-5 font-semibold text-white">Open Rezlee</a>
              <p className="text-center text-xs leading-5 text-[#778078]">We’ll prefill {authData.user.email}. Sign in to open the shared household. Bills and private records remain private to their owner unless Rezlee explicitly says otherwise.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F4EC] px-5 py-8 text-[#1E352B] sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex justify-center"><Link href="/"><RezleeLogo /></Link></div>
        <div className="overflow-hidden rounded-[32px] border border-[#D9DED5] bg-white shadow-sm">
          <div className="relative overflow-hidden bg-[#244A3A] px-7 py-10 text-white sm:px-10">
            <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-white/5" />
            <div className="relative">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F7F4EC] text-2xl">⌂</div>
              <p className="text-sm font-medium text-[#BDD0C5]">Household invitation</p>
              <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Join {homeName} on Rezlee</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/75">{inviterName} invited you to help run the household together — chores, home care and the things everyone otherwise has to remember.</p>
            </div>
          </div>

          <div className="space-y-7 p-7 sm:p-10">
            <div className="grid gap-3 sm:grid-cols-3">
              <Feature icon="✓" title="Know what’s yours" detail="See the tasks and routines you’re responsible for." />
              <Feature icon="↻" title="Share fairly" detail="Rotate recurring chores without keeping score manually." />
              <Feature icon="✦" title="Ask Rezlee" detail="Get help understanding what the home needs and what to do next." />
            </div>

            <div className="rounded-2xl bg-[#F3F1EA] p-4 text-sm leading-6 text-[#657068]">
              <strong className="text-[#1E352B]">Your privacy stays separate.</strong> Joining a household gives you access to shared household responsibilities and the shared-expense ledger. It does not automatically expose another person’s private Bills or Vault records.
            </div>

            {errorMessage ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

            <form action={acceptInvite} className="space-y-4">
              <input name="member" type="hidden" value={memberId} />
              
              {needsPassword ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    <span>Create password</span>
                    <input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required className="h-12 w-full rounded-xl border border-[#CBD2CA] bg-white px-4 outline-none ring-[#244A3A] focus:ring-2" placeholder="At least 8 characters" />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>Confirm password</span>
                    <input name="passwordConfirm" type="password" minLength={8} maxLength={128} autoComplete="new-password" required className="h-12 w-full rounded-xl border border-[#CBD2CA] bg-white px-4 outline-none ring-[#244A3A] focus:ring-2" placeholder="Repeat password" />
                  </label>
                </div>
              ) : null}
              <button className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#244A3A] px-5 font-semibold text-white transition hover:bg-[#1C3E30]" type="submit">Join household</button>
            </form>
            <p className="text-center text-xs leading-5 text-[#858C86]">Invitation sent to {context.email}. Only that email address can accept this household invitation.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
