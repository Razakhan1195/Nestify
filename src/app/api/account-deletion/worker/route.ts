import { validDeletionWorker } from "@/lib/account/deletion-worker-auth";
import { runAccountDeletionQueue } from "@/lib/account/deletion";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!validDeletionWorker(request.headers, { cron: process.env.CRON_SECRET, scheduler: process.env.APP_NOTIFICATION_WORKER_SECRET })) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  try { return Response.json(await runAccountDeletionQueue(), { headers }); }
  catch { return Response.json({ error: "Deletion worker could not finish." }, { status: 503, headers }); }
}
