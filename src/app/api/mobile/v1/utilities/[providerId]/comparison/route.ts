import {effectiveBillTable} from "@/lib/product/bill-records";
import { isElectricityProvider, supportedElectricityReading } from "@/lib/utility/service";
import { NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { buildMultiPeriodComparison, supportedPeriod, type SavedStatement } from "@/lib/utility/multi-period";
import type { UsageReading } from "@/lib/utility/ontario-rpp";

import { buildCurrentPlanScenario, selectCurrentPlanStatement, emptyPlanScenario } from "@/lib/utility/current-plan";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params:Promise<{providerId:string}>}) {
  const auth = await authenticateMobileRequest(request);
  if(auth.error) return NextResponse.json({error:auth.error.message},{status:auth.error.status});
  const {providerId}=await context.params;
  const provider=await auth.supabase.from("providers").select("id,provider_categories(name)").eq("id",providerId).eq("user_id",auth.user.id).maybeSingle();
  if(provider.error) return NextResponse.json({error:"Could not load this utility."},{status:500});
  if(!provider.data) return NextResponse.json({error:"Utility connection not found."},{status:404});
  if(!isElectricityProvider(provider.data.provider_categories)) return NextResponse.json({code:"unsupported_utility",error:"Electricity-plan comparisons do not apply to this account."},{status:422});
  const current = new URL(request.url).searchParams.get("basis") === "current";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  const integration=await auth.supabase.from("provider_integrations").select("id,home_id")
    .eq("provider_id",providerId).eq("user_id",auth.user.id).eq("adapter","ezgb").maybeSingle();
  if(integration.error) return NextResponse.json({error:"Could not load saved utility data."},{status:500});
  if(!integration.data) return NextResponse.json({error:"Saved Green Button data was not found."},{status:404});
  const bills=await auth.supabase.from(effectiveBillTable())
    .select("id,currency,billing_period_start,billing_period_end,raw_data")
    .eq("provider_id",providerId).eq("user_id",auth.user.id).eq("home_id",integration.data.home_id)
    .eq("source","ezgb").eq("status","archived")
    .not("billing_period_start","is",null).not("billing_period_end","is",null)
    .order("billing_period_end",{ascending:false}).order("id",{ascending:true}).limit(12);
  if(bills.error) return NextResponse.json({error:"Could not load saved statements."},{status:500});
  const statements=(bills.data??[]) as SavedStatement[];
  if (current && bills.data?.length && bills.data[0].currency !== "CAD") return NextResponse.json(emptyPlanScenario("saved_intervals", today, "The statement currency must be confirmed as CAD before comparing Ontario plans.", bills.data[0].id), {headers:{"Cache-Control":"private, no-store"}});
  const selection = selectCurrentPlanStatement(statements, today);
  if (current && selection.blocked) return NextResponse.json(selection.blocked, {headers:{"Cache-Control":"private, no-store"}});
  const supported=(current ? statements.slice(0,1) : statements).filter(supportedPeriod);
  if (current && (!statements.length || !supported.length)) return NextResponse.json(buildCurrentPlanScenario(statements[0] ?? null, [], today), {headers:{"Cache-Control":"private, no-store"}});
  const readings:UsageReading[]=[];
  if(supported.length) {
    const start=supported.map(b=>b.billing_period_start).sort()[0];
    const end=supported.map(b=>b.billing_period_end).sort().at(-1)!;
    // Bound both date span and rows; never return calculations using truncated reads.
    if(Date.parse(end)-Date.parse(start)>400*86400000) return NextResponse.json({error:"These statements span more than 400 days. A narrower comparison is needed."},{status:422});
    const next=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);
    for(let offset=0;;offset+=1000) {
      const page=await auth.supabase.from("utility_usage_readings")
        .select("interval_start_local,interval_minutes,value,source_record_key,unit,commodity,timezone")
        .eq("provider_integration_id",integration.data.id).eq("user_id",auth.user.id).eq("home_id",integration.data.home_id)
        .gte("interval_start_local",start+"T00:00:00").lt("interval_start_local",next+"T00:00:00")
        .order("interval_start_local",{ascending:true}).order("source_record_key",{ascending:true})
        .range(offset,offset+999);
      if(page.error) return NextResponse.json({error:"Could not load saved readings. Please try again."},{status:500});
      if ((page.data ?? []).some(row => !supportedElectricityReading(row))) return NextResponse.json({code:"unsupported_readings",error:"These readings need verified electricity units and timezone before comparison."},{status:422});
      for(const row of page.data??[]) readings.push({intervalStartLocal:String(row.interval_start_local).replace("T"," ").slice(0,19),intervalMinutes:Number(row.interval_minutes),valueKwh:Number(row.value)});
      if(readings.length>40000) return NextResponse.json({error:"This comparison contains too many readings to process at once."},{status:422});
      if((page.data??[]).length<1000) break;
    }
  }
  return NextResponse.json(current ? buildCurrentPlanScenario(statements[0] ?? null, readings, today) : buildMultiPeriodComparison(statements,readings),{headers:{"Cache-Control":"private, no-store"}});
}
