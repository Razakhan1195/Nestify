import Link from "next/link";
import { waitlistConfig } from "@/lib/waitlist/server";
export const metadata = { title: "Waitlist privacy | Rezlee" };
export default function Page() {
  const c = waitlistConfig();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-14">
      <Link href="/#waitlist">← Rezlee</Link>
      <h1 className="text-3xl font-semibold">Your waitlist information</h1>
      <p>
        We collect your email, signup and confirmation dates, consent record,
        email-delivery status and any lifetime-membership reservation. We use
        these to confirm your signup, reserve eligible memberships and send the
        waitlist and launch updates you requested.
      </p>
      <p>
        Rezlee uses Supabase to store the list, Vercel to operate this website
        and Resend to deliver confirmation emails. These providers may process
        information outside Canada. We do not sell the waitlist or publish email
        addresses.
      </p>
      <p>
        Administrative access is restricted and logged. We use a keyed hash of
        the request’s network address for rate limiting; this waitlist database
        does not store the raw address. Hosting providers may retain network
        information in their operational logs.
      </p>
      <p>
        You can unsubscribe using the link in our emails. We retain your
        reservation and the information necessary to honour it, and keep an
        unsubscribe record to prevent further marketing. The list is reviewed at
        launch and after the campaign; inactive, unneeded records should then be
        removed. Retention cleanup is not currently automatic.
      </p>
      <p>
        To request access, correction or deletion,{" "}
        {c.contact ? (
          <a href={"mailto:" + c.contact}>email {c.contact}</a>
        ) : (
          "use the contact details provided when waitlist signup becomes available"
        )}
        . Deleting the record needed to identify a reservation may prevent us
        from recognising it; we will explain this before proceeding.
      </p>
      <p>Updated September 30, 2026.</p>
    </main>
  );
}
