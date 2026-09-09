import Link from "next/link";
import { RezleeLogo } from "@/components/brand/rezlee-logo";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-6">
      <Link href="/">
        <RezleeLogo />
      </Link>
      <p className="text-sm text-muted-foreground">PAGE NOT FOUND</p>
      <h1 className="text-3xl font-semibold">
        Let’s get you back to your place.
      </h1>
      <p className="text-muted-foreground">
        This link may have moved, or the record may no longer be available.
      </p>
      <Button asChild className="w-fit">
        <Link href="/app">Open dashboard</Link>
      </Button>
    </main>
  );
}
