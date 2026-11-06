export const evidenceDefaults = {
 previousBalance: "", amountDue: "", subtotal: "", tax: "", credits: "",
 usage: "", unit: "", reading: "", ratePlan: "", discountEnds: "",
};
export type StatementEvidence = typeof evidenceDefaults;
export const moneyFields = ["previousBalance", "amountDue", "subtotal", "tax", "credits"] as const;
export function moneyCents(value: string): number | null {
 if (!/^-?\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
 const negative=value.startsWith("-"), parts=value.replace("-","").split(".");
 const cents=Number(parts[0])*100+Number((parts[1]??"").padEnd(2,"0"));
 return negative?-cents:cents;
}
export function evidenceError(value: unknown): string | null {
 if(!value || typeof value!=="object" || Array.isArray(value))return "Check the statement details.";
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!(Object.hasOwn(evidenceDefaults,k))))return "Only statement details can be saved here.";
 for(const key of Object.keys(evidenceDefaults)){
  if(typeof v[key]!=="string" || (v[key] as string).length>120)return "Check the statement details.";
 }
 const fields=v as StatementEvidence;
 for(const key of moneyFields) if(fields[key]!=="" && moneyCents(fields[key])===null)return "Enter amounts with up to two decimal places, without commas or currency symbols.";
 if(fields.credits!=="" && moneyCents(fields.credits)!<0)return "Enter discounts and credits as a positive reduction.";
 if(fields.usage!=="" && !/^\d{1,10}(?:\.\d{1,6})?$/.test(fields.usage))return "Enter the printed usage as a positive number or zero, without commas.";
 if(!["","kWh","m³","GJ","L","Other"].includes(fields.unit))return "Choose the printed usage unit.";
 if(Boolean(fields.usage)!==Boolean(fields.unit))return "Add both usage and its printed unit, or leave both blank.";
 if(!["","actual","estimated","mixed","unknown"].includes(fields.reading))return "Choose the reading type.";
 const d=fields.discountEnds;
 if(d && (!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))return "Choose a valid discount end date.";
 return null;
}
export function parseEvidence(value: unknown): StatementEvidence | null {
 if(evidenceError(value))return null;
 return Object.fromEntries(Object.keys(evidenceDefaults).map(k=>[k,(value as Record<string,string>)[k]])) as StatementEvidence;
}
export type EvidenceContext = { amount: number | null; category: string; periodStart: string | null; periodEnd: string | null };
function iso(value: string|null): value is string {
 return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
}
export function explainStatement(context: EvidenceContext, fields: StatementEvidence) {
 const facts:string[]=[], checks:string[]=[];
 const amount=context.amount===null?null:moneyCents(String(context.amount));
 const subtotal=moneyCents(fields.subtotal), tax=moneyCents(fields.tax),credits=moneyCents(fields.credits);
 const format=(c:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(c/100);
 // Explicit zero is evidence; empty never becomes zero.
 if(fields.previousBalance)facts.push(`Previous balance shown: ${format(moneyCents(fields.previousBalance)!)}. Kept outside this period’s charges.`);
 if(fields.amountDue)facts.push(`Amount due when issued: ${format(moneyCents(fields.amountDue)!)}. This does not establish the balance today or whether it was paid.`);
 let differenceCents:number|null=null;
 if(amount!==null && subtotal!==null && tax!==null && credits!==null){
  differenceCents=amount-(subtotal+tax-credits);
  if(differenceCents===0)facts.push("The entered subtotal plus tax minus credits matches the saved period charges. This checks arithmetic, not whether the tariff or charges are correct.");
  else checks.push(`The entered breakdown differs from the saved period charges by ${format(Math.abs(differenceCents))}. Check for a missing fee, an already-applied credit or a transcription error before contacting the provider.`);
 }
 if(fields.usage){
  facts.push(`Printed usage: ${fields.usage} ${fields.unit}. ${fields.reading==="estimated"?"The statement describes this as estimated.":fields.reading==="actual"?"The statement describes this as an actual reading.":"Reading coverage has not been independently verified."}`);
 }
 let usagePerDay:number|null=null;
 if(fields.usage && fields.unit!=="Other" && iso(context.periodStart)&&iso(context.periodEnd)){
  const days=(Date.parse(context.periodEnd)-Date.parse(context.periodStart))/86400000+1;
  if(days>0&&days<=366){usagePerDay=Number(fields.usage)/days;facts.push(`${usagePerDay.toLocaleString("en-CA",{maximumFractionDigits:3})} ${fields.unit} per day on average across ${days} days. This is not interval data or a time-of-day pattern.`);}
 }
 if(fields.ratePlan)facts.push(`Plan recorded from the statement: ${fields.ratePlan}.`);
 if(fields.discountEnds)checks.push(`Discount end date recorded: ${fields.discountEnds}. Check the next applicable statement for the actual price after the discount; no future saving is assumed.`);
 const category=context.category.toLowerCase();
 if(fields.reading==="estimated"||fields.reading==="mixed")checks.push("Compare the statement’s opening and closing meter readings with the provider’s reading history. Ask how any estimated portion will be reconciled; an estimate alone does not establish an error.");
 const next = checks[0] ?? (/internet|phone|mobile|telecom/.test(category)
  ? "No billing issue is identified in these saved details. Compare another statement from the same account if you want to check for a price change."
  : /electric|hydro|power/.test(category)
  ? fields.usage ? "Add a previous statement for this account to compare usage and billing days. A cheaper electricity plan cannot be established from total kWh alone; time-band data or clearly labelled scenarios are needed."
   : "Add the total kWh and printed rate plan from the original. This separates how much electricity was billed from the amount charged."
  : /gas|water/.test(category)
  ? "Compare usage, units and actual versus estimated readings with the previous statement. A higher bill alone cannot diagnose a leak or equipment fault."
  : "Check the original for optional services, one-time charges and discount terms before treating this amount as your usual cost.");
 return {facts,checks,next,differenceCents,usagePerDay};
}
