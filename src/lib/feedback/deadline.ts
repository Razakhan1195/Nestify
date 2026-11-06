/** Conservative support target: end of the third Toronto weekday after receipt.
 * Holidays are counted, making the internal target earlier rather than missing
 * the promised business-day deadline. No claim to a legal holiday calendar. */
export function feedbackDueDate(createdAt:string):string {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(createdAt));
 const part=(name:string)=>Number(parts.find(p=>p.type===name)?.value);
 const date=new Date(Date.UTC(part("year"),part("month")-1,part("day")));
 let weekdays=0;while(weekdays<3){date.setUTCDate(date.getUTCDate()+1);if(![0,6].includes(date.getUTCDay()))weekdays++;}
 return date.toISOString().slice(0,10);
}
export function torontoDate(now=new Date()):string {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 return ["year","month","day"].map(k=>parts.find(p=>p.type===k)?.value).join("-");
}
