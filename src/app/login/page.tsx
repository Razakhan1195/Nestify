import Link from "next/link";

import { login } from "@/app/actions";
import { AuthForm } from "@/components/auth/auth-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col bg-muted/30">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link className="text-lg font-semibold" href="/">
          Dwellwise
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <AuthForm
          action={login}
          alternateHref="/signup"
          alternateLabel="Sign up"
          alternateText="New to Dwellwise?"
          error={typeof error === "string" ? error : undefined}
          pendingLabel="Logging in..."
          submitLabel="Log in"
          subtitle="App routes are protected. Sign in to continue."
          title="Welcome back"
        />
      </div>
    </main>
  );
}
