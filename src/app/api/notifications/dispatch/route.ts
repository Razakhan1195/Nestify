import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { appNotificationsEnabled, dispatchAppNotifications } from "@/lib/notifications/service";
export const maxDuration=300;
export async function POST(request:Request) {
 const expected=process.env.APP_NOTIFICATION_WORKER_SECRET;const received=request.headers.get("authorization")??"";
 const target="Bearer "+expected;
 if(!expected||received.length!==target.length||!timingSafeEqual(Buffer.from(received),Buffer.from(target)))return Response.json({error:"Unauthorized"},{status:401});
 if(!appNotificationsEnabled())return Response.json({error:"Unavailable"},{status:503});
 after(async()=>{try{await dispatchAppNotifications();}catch{console.error("[notifications] Background delivery needs attention");}});
 return Response.json({accepted:true},{status:202});
}
