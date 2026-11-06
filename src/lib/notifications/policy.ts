export const notificationCategories = ["connections","bills","care","recalls","shared_expenses"] as const;
export type NotificationCategory = typeof notificationCategories[number];
export const defaultNotificationPreferences = {push_enabled:true,connections:true,bills:false,care:false,recalls:true,shared_expenses:true,timezone:"America/Toronto"};
export type NotificationPreferences = typeof defaultNotificationPreferences;
export function validTimezone(value:string) { try {new Intl.DateTimeFormat("en",{timeZone:value}).format();return value.length<=80;} catch {return false;} }
export function localNotificationTime(zone:string,now=new Date()) {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:validTimezone(zone)?zone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
 const get=(key:string)=>parts.find(x=>x.type===key)?.value??"";
 return {date:get("year")+"-"+get("month")+"-"+get("day"),hour:Number(get("hour"))};
}
export function safeNotificationHref(value:unknown):string|null {
 if(typeof value!=="string")return null;
 return /^\/(?:provider|bill|care|shared)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)||["/shared","/recalls","/notifications","/(tabs)/care","/(tabs)/bills","/provider"].includes(value)?value:null;
}
export function notificationHref(row:{metadata?:unknown;related_table?:unknown;related_id?:unknown}) {
 const m=row.metadata&&typeof row.metadata==="object"?row.metadata as Record<string,unknown>:{};
 const direct=safeNotificationHref(m.mobileHref);if(direct)return direct;
 const base=row.related_table==="providers"?"/provider/":row.related_table==="bills"?"/bill/":row.related_table==="maintenance_tasks"?"/care/":null;
 return base?safeNotificationHref(base+row.related_id):null;
}
