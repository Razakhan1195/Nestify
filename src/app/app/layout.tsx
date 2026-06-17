import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { logout } from "@/app/actions";
import { DesktopNav, MobileNav } from "@/components/app-shell/app-nav";
import { Button } from "@/components/ui/button";
import {
  hasSupabaseEnv,
  missingSupabaseEnvMessage,
} from "@/lib/supabase/env";
import { getCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  if (!hasSupabaseEnv()) {
    redirect(`/login?error=${encodeURIComponent(missingSupabaseEnvMessage)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: home, error: homeError } = await getCurrentUserHome(user.id);

  if (homeError) {
    console.error("[app:shell] home check failed", {
      user_id: user.id,
      message: homeError.message,
      details: homeError.details,
      hint: homeError.hint,
      code: homeError.code,
    });
  }

  if (!home) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
            <Link className="text-base font-semibold tracking-tight" href="/app/onboarding">
              Dwellwise
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:block">
                {user.email}
              </span>
              <form action={logout}>
                <Button size="sm" type="submit" variant="outline">
                  Log out
                </Button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-68 border-r bg-sidebar px-4 py-5 lg:block">
        <Link className="mb-1 block text-lg font-semibold tracking-tight" href="/app">
          Dwellwise
        </Link>
        <p className="mb-8 text-sm text-sidebar-foreground/65">
          Your monthly home command center.
        </p>
        <DesktopNav />
      </aside>

      <div className="lg:pl-68">
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="lg:hidden">
                <MobileNav />
              </div>
              <Link className="text-base font-semibold tracking-tight lg:hidden" href="/app">
                Dwellwise
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:block">
                {user.email}
              </span>
              <form action={logout}>
                <Button size="sm" type="submit" variant="outline">
                  Log out
                </Button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
