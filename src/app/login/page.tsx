import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { customerWebAccessEnabled } from "@/lib/auth/web-access";
import { operatorAccess } from "@/lib/ops/auth";
import { RezleeLogo } from "@/components/brand/rezlee-logo";
import Link from "next/link";

import { login } from "@/app/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    notice?: string | string[];
  }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (!customerWebAccessEnabled()) {
    const access = await operatorAccess();
    if (access.state === "ready") redirect("/admin");
    return <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <Link href="/" aria-label="Rezlee home"><RezleeLogo /></Link>
      <h1 className="text-3xl font-semibold">Customer web sign-in is paused</h1>
      <p className="text-base text-muted-foreground">If you already have the Rezlee mobile app, continue there. Your account and saved information are still available in the app.</p>
      <Link href="/#waitlist" className="font-medium text-primary underline">Join the waitlist</Link>
      <Link href="/" className="text-sm underline">Back to Rezlee</Link>
    </main>;
  }
  const { error, notice } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthBrandPanel />
      <div className="flex flex-col bg-background">
        <div className="flex h-16 items-center px-6 lg:hidden">
          <Link className="text-lg font-semibold" href="/">
            <RezleeLogo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <AuthForm
            action={login}
            alternateHref="/signup"
            alternateLabel="Sign up"
            alternateText="New to Rezlee?"
            error={typeof error === "string" ? error : undefined}
            notice={typeof notice === "string" ? notice : undefined}
            pendingLabel="Logging in..."
            submitLabel="Log in"
            subtitle="Sign in to get back to your home dashboard."
            title="Welcome back"
          />
        </div>
      </div>
    </main>
  );
}
