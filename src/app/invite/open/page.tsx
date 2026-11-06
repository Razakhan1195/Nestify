import type { Metadata } from "next";
import Link from "next/link";
import { RezleeLogo } from "@/components/brand/rezlee-logo";
import { validInvitationLink } from "@/lib/household/invitation";
export const dynamic="force-dynamic";
// same-origin keeps tokens out of external referrers while preserving Origin on the review form POST.
export const metadata:Metadata={robots:{index:false,follow:false},referrer:"same-origin"};
export default async function OpenInvite({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const values=await searchParams;const field=(key:string)=>typeof values[key]==="string"?values[key] as string:"";
  const valid=validInvitationLink(field("member"),field("token_hash"),field("type"))&&!field("error");
  return <main className="min-h-screen bg-[#F7F4EC] px-5 py-12 text-[#1E352B]"><div className="mx-auto max-w-md space-y-8"><RezleeLogo/><section className="space-y-5 rounded-3xl border border-[#D9DED5] bg-white p-7"><h1 className="text-2xl font-semibold">{valid?"Your household invitation":"This invitation link isn’t available"}</h1><p className="text-sm leading-6 text-[#657068]">{valid?"Review who invited you and what joining shares before you decide. Your private bills and records stay private.":"The link may have expired or already been used. If you have already joined, sign in to Rezlee. Otherwise, ask the household owner to cancel the pending invitation and send a new one."}</p>{valid?<form method="post" action="/auth/invite"><input type="hidden" name="member" value={field("member")}/><input type="hidden" name="token_hash" value={field("token_hash")}/><input type="hidden" name="type" value={field("type")}/><button className="min-h-12 w-full rounded-xl bg-[#244A3A] px-5 font-semibold text-white" type="submit">Review invitation</button></form>:<Link className="inline-flex min-h-12 items-center font-semibold text-[#244A3A]" href="/login">Sign in to Rezlee</Link>}<p className="text-xs leading-5 text-[#657068]">{valid?"Continue only if you were expecting this invitation. You can leave without joining.":"Opening a link does not grant household access."}</p></section></div></main>;
}
