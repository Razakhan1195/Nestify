import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Waitlist update | Rezlee",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-5 px-6 py-16">
      <p className="font-semibold text-primary">REZLEE · FOUNDING MEMBERS</p>
      <h1 className="text-3xl font-semibold">No confirmation needed.</h1>
      <p>
        We’ve simplified the Rezlee waitlist. If you previously signed up,
        you no longer need to confirm your email. Existing reservations are
        preserved.
      </p>
      <p>
        Want to check? Enter the same email on our waitlist form.
        Your existing registration won’t use another membership place.
      </p>
      <Link href="/#waitlist" className="inline-block underline">
        Back to Rezlee
      </Link>
    </main>
  );
}
