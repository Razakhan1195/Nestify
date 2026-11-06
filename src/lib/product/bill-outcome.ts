import { isUnreliableReadingQuality } from "../ezgb/reading-quality";
import { createHash } from "node:crypto";
import { billReviewBaseline } from "./bill-review";
import { currentReviewedEvidence, currentReviewedEnergyEvidence } from "./statement-evidence";
import { isTelecomCategory } from "../../../apps/mobile/src/lib/bill-review";
import type { OutcomeStatement, BillOutcomeKind } from "../../../apps/mobile/src/lib/bill-outcome";

export type OutcomeBill = Parameters<typeof currentReviewedEvidence>[0] & {
 id:string; name?:string|null; provider_id?:string|null; original_document_id?:string|null;
 usage_amount?:number|null; usage_unit?:string|null;
};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function outcomeStatement(b:OutcomeBill):{kind:BillOutcomeKind;statement:OutcomeStatement;hash:string;raw:Record<string,unknown>}|null{
 const raw=object(b.raw_data),category=text(raw.category),energy=/^(electricity|gas|natural gas)$/i.test(category);
 if(b.currency!=="CAD"||["draft","incomplete"].includes(b.status))return null;
 const manual=b.source==="manual"&&b.status==="archived"&&raw.record_kind==="historical"&&raw.amount_basis==="period_charges";
 const connected=b.source==="ezgb"&&!!b.provider_id&&energy;
 const telecom=b.source==="deck"&&!!b.provider_id&&raw.telecom_contract==="v1"&&raw.amount_basis==="statement_total"&&/^[a-f0-9]{64}$/.test(text(raw.account_key));
 if(!manual&&!connected&&!telecom||!energy&&!isTelecomCategory(category)&&!telecom)return null;
 if(manual&&(!b.custom_provider_name?.trim()||!b.account_number_masked?.trim()))return null;
 const kind=energy?"usage_change":"agreed_amount";
 const reviewed=manual?currentReviewedEvidence(b):null,scope=manual?currentReviewedEnergyEvidence(b):null;
 const rawUnit=manual?reviewed?.unit:b.usage_unit;
 const unit=rawUnit?.trim().toLowerCase();
 const usageUnit=unit==="kwh"?"kWh":unit==="m3"||unit==="m³"?"m³":unit==="gj"?"GJ":null;
 const usage=manual?(reviewed?.usage?Number(reviewed.usage):null):b.usage_amount??null;
 const quality=manual?reviewed?.reading:text(raw.quality_of_reading);
 const estimated=isUnreliableReadingQuality(quality);
 const actual=/^actual$/i.test(quality??"");
 const compatible=/^electricity$/i.test(category)?usageUnit==="kWh":["m³","GJ"].includes(usageUnit??"");
 const scopeSafe=!scope||scope.scope==="single_service"&&scope.service===(/^electricity$/i.test(category)?"electricity":"gas");
 const statement:OutcomeStatement={
  id:b.id,provider:b.custom_provider_name?.trim()||text(raw.utility)||b.name||"Connected provider",
  account:b.account_number_masked?.trim()||"Connected account",category,currency:b.currency,
  amount:b.amount,start:b.billing_period_start,end:b.billing_period_end,hasOriginal:!!b.original_document_id,
  source:b.source??undefined,providerId:b.provider_id??null,
  accountKey:telecom?text(raw.account_key):connected?digest([b.provider_id,raw.service_point_key||b.account_number_masked||""]):null,
  amountBasis:manual?"period_charges":telecom?"statement_total":"amount_due",
  usageAmount:typeof usage==="number"&&Number.isFinite(usage)?usage:null,usageUnit,
  usageQuality:estimated?"estimated":actual?"actual":manual?"unknown":"provider_reported",
  usageEligible:energy&&compatible&&scopeSafe&&typeof usage==="number"&&Number.isFinite(usage)&&usage>=0&&!(usageUnit==="kWh"&&usage>20000)&&!estimated&&(!manual||actual),
 };
 // Keep legacy manual price-action fingerprints stable.
 const hash=manual&&!energy?billReviewBaseline(b):digest({...statement,hasOriginal:undefined,id:undefined});
 return {kind,statement,hash,raw};
}
