import type { Metadata } from "next";
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
