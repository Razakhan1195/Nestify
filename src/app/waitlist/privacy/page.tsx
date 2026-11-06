import Link from "next/link";
import { waitlistConfig } from "@/lib/waitlist/server";

export const metadata = { title: "Waitlist privacy | Rezlee" };

export default function Page() {
  const { contact } = waitlistConfig();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-14">
      <Link href="/#waitlist">← Back to Rezlee</Link>
      <h1 className="text-3xl font-semibold">Your privacy matters</h1>
      <p>
        When you join the Rezlee waitlist, we use your email address to send
        launch updates and keep track of your eligibility for our founding
        member offer. You can join without verifying your email first. You can unsubscribe from
        marketing emails at any time.
      </p>
      <p>
        We do not sell your personal information. We work with trusted service
        providers to run the website, store registrations and deliver emails.
        Some information may be processed outside Canada.
      </p>
      <p>
        We keep information needed to manage your registration, honour any
        eligible reservation, respect your communication choices and meet
        applicable legal obligations. You can request access, correction or
        deletion. Deleting reservation information may affect our ability to
        recognise your offer.
      </p>
      <p>
        Optional advertising measurement is separate from joining the waitlist.
        You can decline marketing tracking and still sign up. Review the{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>{" "}
        for more about our data practices and your choices.
      </p>
      <p>
        Questions or privacy requests?{" "}
        {contact ? <a className="underline" href={"mailto:" + contact}>{contact}</a> : <Link href="/contact" className="underline">Contact Rezlee</Link>}.
      </p>
      <p className="text-sm text-muted-foreground">Updated October 12, 2026.</p>
    </main>
  );
}
