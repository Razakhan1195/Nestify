import Link from "next/link";
export const metadata = { title: "Founding member offer | Rezlee" };
export default function Page() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-14">
      <Link href="/#waitlist">← Rezlee</Link>
      <h1 className="text-3xl font-semibold">The founding 10,000</h1>
      <p>
        Available public founding memberships are reserved in signup order,
        one per email address. Email confirmation is not required to join.
        When all public founding places are allocated, you can still join
        the launch waitlist without a lifetime membership.
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
      <p className="text-sm text-muted-foreground">Updated October 12, 2026.</p>
      <a href="/waitlist/privacy">Waitlist privacy →</a>
    </main>
  );
}
