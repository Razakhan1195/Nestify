import { runRecallMonitor, checkRecallReceipts } from "@/lib/recalls/monitor";
import { monitoringActive } from "@/lib/recalls/monitor-policy";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(request:Request) {
 if(!process.env.CRON_SECRET || request.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET) return Response.json({error:"Unauthorized."},{status:401});
 const url=new URL(request.url), dryRun=url.searchParams.get("dryRun")==="1";
 if(!dryRun && !monitoringActive()) return Response.json({error:"Background recall delivery is not active."},{status:503});
 try {
  if(url.searchParams.get("receipts")==="1") return Response.json(dryRun ? {dryRun:true} : await checkRecallReceipts());
  return Response.json(await runRecallMonitor({dryRun}));
 } catch { return Response.json({error:"Recall worker could not complete."},{status:503}); }
}
