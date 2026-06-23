import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";

type SignupPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link className="text-lg font-semibold" href="/">
            Nestify
          </Link>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="font-medium text-foreground underline" href="/login">
              Log in
            </Link>
          </p>
        </div>
      </header>
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6">
        <SignupForm error={typeof error === "string" ? error : undefined} />
      </div>
    </main>
  );
}
