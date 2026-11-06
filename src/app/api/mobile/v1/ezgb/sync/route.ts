import { ezgbJobCancelled } from "@/lib/ezgb/job-cancellation";
import { connectionAttempt, publicEzgbConnection, verifyEzgbConnectionIntent } from "@/lib/ezgb/connection-attempt";
import {ezgbBillsAvailable} from "../../../../../../../apps/mobile/src/lib/ezgb-progress";
import { after, NextResponse } from "next/server";

import {
  retryEzgbConnectionJob,
  cancelEzgbSyncJob,
  createEzgbSyncJob,
  findActiveEzgbSyncJob,
  getEzgbSyncJob,
  processEzgbSyncJob,
} from "@/lib/ezgb/background-sync";
import { ezgbUserIdentifier } from "@/lib/ezgb/identity";
import { resolveAccessibleHome } from "@/lib/household/access";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const emptyStats = {
  accountsSeen: 0,
  integrationsConnected: 0,
  billsImported: 0,
  quarantined: 0,
  errors: 0,
};

function responseForJob(job: Awaited<ReturnType<typeof getEzgbSyncJob>>) {
  if (!job || ezgbJobCancelled(job.stats)) {
    return {
      ok: true as const,
      ready: false,
      jobId: job?.id ?? null,
      cancelled: Boolean(job),
      status: "idle" as const,
      stats: emptyStats,
    };
  }

  const connection = connectionAttempt(job.stats?.connection);
  const publicConnection = connection ? publicEzgbConnection(connection) : undefined;
  return {
    ...(publicConnection ? { connection: publicConnection } : {}),
    ok: true as const,
    ready: connection ? connection.phase === "bills_ready" : ezgbBillsAvailable({status:job.status,stats:{...emptyStats,...(job.stats??{})}}),
    jobId: job.id,
    status: job.status,
    stats: {
      ...emptyStats,
      ...(job.stats ?? {}),
    },
    error: ["failed", "waiting"].includes(job.status) ? job.last_error : null,
  };
}

async function ownerContext(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return { response: NextResponse.json(
    { error: auth.error.message },
    { status: auth.error.status },
  ) };

  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data) {
    return { response: NextResponse.json(
      { error: "Set up your place first." },
      { status: 409 },
    ) };
  }
  if (access.data.role !== "owner") {
    return { response: NextResponse.json(
      { error: "Only the household owner can sync utility data." },
      { status: 403 },
    ) };
  }

  return {
    userId: auth.user.id,
    homeId: access.data.home.id,
    userIdentifier: ezgbUserIdentifier(auth.user.id, access.data.home.id),
  };
}

export async function GET(request: Request) {
  const context = await ownerContext(request);
  if ("response" in context) return context.response;

  const url = new URL(request.url);
  const job = await getEzgbSyncJob({
    jobId: url.searchParams.get("job"),
    userId: context.userId,
    homeId: context.homeId,
  });

  return NextResponse.json(responseForJob(job));
}

export async function POST(request: Request) {
  const context = await ownerContext(request);
  if ("response" in context) return context.response;
  let body: { expectedUserIdentifier?: unknown; connectionIntent?: unknown; retryJobId?: unknown; cancelJobId?: unknown };
  try { const raw = await request.text(); body = raw ? JSON.parse(raw) : {}; }
  catch { return NextResponse.json({ error: "Invalid connection request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid connection request." }, { status: 400 });
  if (body.expectedUserIdentifier !== undefined && body.expectedUserIdentifier !== context.userIdentifier) {
    return NextResponse.json({ error: "Your household changed. Start the connection again." }, { status: 409 });
  }

  try {
    if (body.cancelJobId !== undefined) {
      if (typeof body.cancelJobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.cancelJobId) || body.retryJobId !== undefined || body.connectionIntent !== undefined) {
        return NextResponse.json({ error: "Invalid cancellation request." }, { status: 400 });
      }
      try {
        return NextResponse.json(responseForJob(await cancelEzgbSyncJob({ jobId: body.cancelJobId, userId: context.userId, homeId: context.homeId })));
      } catch {
        return NextResponse.json({ error: "Could not remove this attempt. Please try again." }, { status: 409 });
      }
    }
    if (process.env.REZLEE_MEMBERSHIPS_ENABLED === "true") {
      const { requirePro, MembershipRequired } = await import("@/lib/membership/server");
      try { await requirePro(context.userId); }
      catch (error) {
        return NextResponse.json({ error: error instanceof MembershipRequired ? error.message : "Membership could not be checked. Try again." }, { status: error instanceof MembershipRequired ? 402 : 503 });
      }
    }
    if (body.retryJobId !== undefined) {
      if (typeof body.retryJobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.retryJobId) || body.connectionIntent !== undefined) {
        return NextResponse.json({ error: "Invalid connection retry." }, { status: 400 });
      }
      try {
        const job = await retryEzgbConnectionJob({ jobId: body.retryJobId, userId: context.userId, homeId: context.homeId });
        if (job?.status === "queued") after(async () => { await processEzgbSyncJob(job.id); });
        return NextResponse.json(responseForJob(job), { status: 202 });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resume this connection." }, { status: 409 });
      }
    }
    let connection;
    if (body.connectionIntent !== undefined) {
      try { connection = verifyEzgbConnectionIntent(body.connectionIntent, context); }
      catch { return NextResponse.json({ error: "This connection has expired or belongs to another household. Start again." }, { status: 409 }); }
      const same = await getEzgbSyncJob({ jobId: connection.attemptId, userId: context.userId, homeId: context.homeId });
      if (same) return NextResponse.json(responseForJob(same), { status: 202 });
    }
    const existing = await findActiveEzgbSyncJob(
      context.userId,
      context.homeId,
    );
    if (existing) {
      if (connection) return NextResponse.json({ error: "Another utility import is running. Let it finish before checking this connection." }, { status: 409 });
      return NextResponse.json(responseForJob(existing), { status: 202 });
    }

    const job = await createEzgbSyncJob({
      userId: context.userId,
      homeId: context.homeId,
      userIdentifier: context.userIdentifier,
      connection,
    });

    after(async () => {
      try {
        await processEzgbSyncJob(job.id);
      } catch {
        console.error("[ezgb:background-sync] failed");
      }
    });

    return NextResponse.json(responseForJob(job), { status: 202 });
  } catch {
    console.error("[ezgb:sync] could not start");
    return NextResponse.json(
      { error: "Rezlee could not start the utility refresh." },
      { status: 502 },
    );
  }
}
