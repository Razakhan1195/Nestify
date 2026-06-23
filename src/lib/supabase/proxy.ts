import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseEnv, supabaseCookieOptions } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Without Supabase env configured there is no session to refresh.
  if (!hasSupabaseEnv()) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getUser().
  // Calling getUser() here refreshes the access token and writes the updated
  // auth cookies onto supabaseResponse, keeping the browser and server in sync.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[v0] middleware", {
    path: request.nextUrl.pathname,
    hasUser: Boolean(user),
    cookieNames: request.cookies.getAll().map((c) => c.name),
  });

  // Redirect unauthenticated users away from protected app routes.
  if (!user && request.nextUrl.pathname.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return the supabaseResponse object as-is so refreshed auth
  // cookies are preserved. Mutating/replacing it can terminate the session.
  return supabaseResponse;
}
