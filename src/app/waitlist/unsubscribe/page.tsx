import Link from "next/link";
import { WaitlistAction } from "@/components/marketing/waitlist-action";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; token?: string }>;
}) {
  const p = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-16">
      <p className="mb-8 font-semibold text-primary">
        REZLEE · FOUNDING MEMBERS
      </p>
      <WaitlistAction
        action="unsubscribe"
        id={p.id ?? ""}
        token={p.token ?? ""}
      />
      <Link href="/#waitlist" className="mt-8 block underline">
        Back to Rezlee
      </Link>
    </main>
  );
}
