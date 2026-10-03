import { NextResponse, type NextRequest } from "next/server";

import { customerWebAccessEnabled, isCustomerWebRoute } from "@/lib/auth/web-access";

import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  // Block before auth refresh, for anonymous users and existing customer sessions.
  // Do not revoke shared Supabase sessions: native apps and admins still use them.
  if (!customerWebAccessEnabled() && isCustomerWebRoute(request.nextUrl.pathname)) {
    const response = NextResponse.redirect(new URL("/login", request.url), 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image assets (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
