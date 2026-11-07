import { retiredCustomerPath } from "@/lib/customer-web";
import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  // Retire old sessions and saved URLs before any customer page or action runs.
  if (request.headers.has("next-action") || retiredCustomerPath(request.nextUrl.pathname)) {
    if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.json({ error: "Continue in the Rezlee mobile app." }, { status: 410, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(new URL("/open#", request.url), { status: 307, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/mobile/v1 (bearer-authenticated routes validate their own session)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image assets (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!api/mobile/v1(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
