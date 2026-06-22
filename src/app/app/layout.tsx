import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { logout } from "@/app/actions";
import { AppHeader } from "@/components/app-shell/app-header";
import { DesktopNav } from "@/components/app-shell/app-nav";
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
              Nestify
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
    <div className="app-bg min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--sidebar-width)] border-r border-sidebar-border/70 bg-sidebar/88 px-3 py-4 shadow-[8px_0_32px_rgba(52,64,84,0.035)] backdrop-blur-xl lg:block">
        <Link className="group mb-5 flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-sidebar-accent/50" href="/app">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
            N
          </span>
          <span>
            <span className="block text-base font-semibold tracking-tight">
              Nestify
            </span>
            <span className="block text-xs text-sidebar-foreground/60">
              Household command center
            </span>
          </span>
        </Link>
        <DesktopNav />
        <div className="absolute inset-x-3 bottom-4 rounded-2xl border border-sidebar-border/60 bg-card/60 p-3 text-xs text-sidebar-foreground/70">
          <p className="font-semibold text-sidebar-foreground">{home.nickname}</p>
          <p className="mt-1 truncate">
            {[home.city, home.province].filter(Boolean).join(", ") || "Place profile"}
          </p>
        </div>
      </aside>

      <div className="lg:pl-[var(--sidebar-width)]">
        <div className="flex items-center border-b border-border/60 bg-background/78 backdrop-blur-xl">
          <AppHeader email={user.email} />
          <form action={logout} className="hidden pr-4 sm:block">
            <Button size="sm" type="submit" variant="ghost">
              Log out
            </Button>
          </form>
        </div>

        <main className="mx-auto w-full max-w-[var(--page-max-width)] px-4 py-5 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
