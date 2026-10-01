import Link from "next/link";
export const metadata = { title: "Founding member offer | Rezlee" };
export default function Page() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-14">
      <Link href="/#waitlist">← Rezlee</Link>
      <h1 className="text-3xl font-semibold">The founding 10,000</h1>
      <p>
        Rezlee’s founding offer includes 10,000 free lifetime app memberships.
        Of these, 5,321 are initially available through the public waitlist and
        4,679 are held back from public signup. Held-back places are an allocation,
        not a claim that people have signed up.
        Joining the waitlist is free. No payment card is required.
      </p>
      <p>
        Places are allocated when you submit the signup form, one membership per
        person. No email confirmation is required. The success message shows
        whether a lifetime place was reserved. Repeat submissions of the same
        email do not use another place. After public places are allocated,
        you can still join the launch waitlist without a lifetime membership.
      </p>
      <p>
        Create your Rezlee account using your waitlist email to claim
        your membership at launch. Your reservation is personal and
        non-transferable. Lifetime means for as long as Rezlee operates the app;
        it is not a guarantee that the service will operate indefinitely.
      </p>
      <p>
        The offer covers your app membership. It does not pay your utility
        bills, purchases or third-party services you separately choose. No
        subscription fee will be charged for the reserved membership.
      </p>
      <p>
        You can unsubscribe from launch emails without losing an existing
        reservation. App availability and the launch date are not yet
        guaranteed.
      </p>
      <p>Offer version: founding-public-v3 · September 30, 2026.</p>
      <a href="/waitlist/privacy">Waitlist privacy →</a>
    </main>
  );
}
