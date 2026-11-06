import { validBearer } from "@/lib/security/bearer";
import { checkRecoveryBackup } from "@/lib/ops/backup-watchdog";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request) {
  if (!validBearer(request.headers.get("authorization"),process.env.CRON_SECRET)) return Response.json({error:"Unauthorized"},{status:401});
  if (process.env.REZLEE_BACKUP_WATCHDOG_ENABLED!=="true" || !process.env.REZLEE_BACKUP_GITHUB_TOKEN) return Response.json({error:"Backup watchdog is not configured"},{status:503});
  try {
    return Response.json({ok:true,...await checkRecoveryBackup({token:process.env.REZLEE_BACKUP_GITHUB_TOKEN})},{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    console.error("Backup watchdog could not verify or trigger recovery export");
    return Response.json({error:"Backup verification failed"},{status:503});
  }
}
