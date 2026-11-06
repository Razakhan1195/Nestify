import { createEzgbClient } from "@/lib/ezgb/client";
import { canonicalEzgbUtility, issueEzgbConnectionIntent } from "@/lib/ezgb/connection-attempt";
import { NextResponse } from "next/server";

import { ezgbPublicBaseUrl } from "@/lib/ezgb/guest";
import { ezgbUserIdentifier } from "@/lib/ezgb/identity";
import { resolveAccessibleHome } from "@/lib/household/access";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data) {
    return NextResponse.json({ error: "Set up your place first." }, { status: 409 });
  }
  if (access.data.role !== "owner") {
    return NextResponse.json(
      { error: "Only the household owner can connect utility data." },
      { status: 403 },
    );
  }

  const userIdentifier = ezgbUserIdentifier(
    auth.user.id,
    access.data.home.id,
  );
  let baseUrl: string;
  try { baseUrl = ezgbPublicBaseUrl(request.url); }
  catch {
    return NextResponse.json({ error: "Utility connections are being updated. Please try again shortly." }, { status: 503 });
  }

  const query = new URL(request.url).searchParams;
  try {if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED==="true")await (await import("@/lib/providers/operational-control")).requireEzgbOperational(query.get("utilityName"));}
  catch{return NextResponse.json({error:"This connection is temporarily unavailable. You can still upload a bill."},{status:503});}
  let connectionIntent: string | undefined;
  if (query.get("connect") === "1") {
    const utilityName = query.get("utilityName");
    if (utilityName && !canonicalEzgbUtility(utilityName)) {
      return NextResponse.json({ error: "Choose a supported utility from Find your provider." }, { status: 400 });
    }
    try {
      const accounts = await createEzgbClient().getUserAccounts(userIdentifier, { timeoutMs: 12_000, maxRetries: 1 });
      connectionIntent = issueEzgbConnectionIntent({ userId: auth.user.id, homeId: access.data.home.id, userIdentifier }, accounts, utilityName, Date.now(), query.get("checkOnly") === "1");
    } catch {
      return NextResponse.json({ error: "We couldn’t verify your existing utility connections. Try again shortly." }, { status: 503 });
    }
  }
  return NextResponse.json({
    ...(connectionIntent ? { connectionIntent } : {}),
    connectionTrackingReady: true,
    browserReturnReady: true,
    userIdentifier,
    authorizationUrl:
      `${baseUrl}/integrations/ezgb/authorize?u=${encodeURIComponent(userIdentifier)}`,
    successUrl: `${baseUrl}/integrations/ezgb/success`,
    errorUrl: `${baseUrl}/integrations/ezgb/error`,
  });
}
