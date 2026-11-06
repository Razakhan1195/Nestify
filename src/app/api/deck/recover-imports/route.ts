import { recoverHostedAuth } from "@/lib/deck/hosted-auth";
import { after } from "next/server";
import { validBearer } from "@/lib/security/bearer";
import { recoverTelecomImports } from "@/lib/sync/deck-telecom-runtime";
export const maxDuration=300;
export const dynamic="force-dynamic";
function acceptRecovery() {
 if(process.env.REZLEE_DECK_TELECOM_ENABLED!=="true")return Response.json({checked:0});
 // Continue only work already requested by a customer. This does not queue recurring provider pulls.
 after(async()=>{try{await recoverHostedAuth();await recoverTelecomImports();}catch{console.error("[deck:telecom] pending work needs another recovery attempt");}});
 return Response.json({accepted:true},{status:202});
}
export async function POST(request:Request) {
 if(!validBearer(request.headers.get("authorization"),process.env.DECK_IMPORT_WORKER_SECRET))return Response.json({error:"Unauthorized"},{status:401});
 return acceptRecovery();
}
/** Vercel sends its configured CRON_SECRET on scheduled GET requests. */
export async function GET(request:Request) {
 if(!validBearer(request.headers.get("authorization"),process.env.CRON_SECRET))return Response.json({error:"Unauthorized"},{status:401});
 return acceptRecovery();
}
