import { safeLocalPath } from "@/lib/security/redirect";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeLocalPath(
    requestUrl.searchParams.get("next"),
    "/app/onboarding",
  );

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/login?error=Missing verification code. Please try the email link again.",
        requestUrl.origin,
      ),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("This sign-in link could not be verified. Request a new link and try again.")}`,
        requestUrl.origin,
      ),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from("profiles").upsert(
      {
        email: user.email,
        full_name:
          typeof user.user_metadata.full_name === "string"
            ? user.user_metadata.full_name
            : null,
        user_id: user.id,
      },
      { onConflict: "user_id" },
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
