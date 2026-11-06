import {guidedStep,type GuidanceJob} from "./repair-guides";
import type {AdaptiveGuidance} from "./adaptive-guidance";
import { z } from "zod";
export const startSchema=z.object({
 title:z.string().trim().min(3).max(120),description:z.string().trim().min(8).max(1500),
 category:z.enum(["internet","appliance","plumbing","electrical","heating_cooling","other"]),
 equipment:z.string().trim().max(180),context:z.enum(["renter","owner"]),
 hazard:z.enum(["none","gas_co_fire","water_electricity","unsure"]),
}).strict();
export type Intake=z.infer<typeof startSchema>;
export const changeSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("respond"),stepId:z.string().max(80),answer:z.enum(["checked","worked","did_not_work","cannot","unsure","stop"]),note:z.string().trim().max(1000),choice:z.string().max(60).optional()}).strict(),
 z.object({action:z.literal("brief"),text:z.string().trim().min(10).max(6000)}).strict(),
 z.object({action:z.literal("resolve"),note:z.string().trim().min(3).max(1000)}).strict(),
 z.object({action:z.literal("reopen"),note:z.string().trim().min(3).max(1000)}).strict(),
 z.object({action:z.literal("escalate")}).strict(),
 z.object({action:z.literal("tailor")}).strict(),
]);
export type Change=z.infer<typeof changeSchema>;
export type Step={id:string;title:string;detail:string;kind:"observe"|"try";why?:string;choices?:{id:string;label:string}[];source?:{label:string;url:string;checkedAt:string}};
export type Attempt={stepId:string;title:string;answer:string;note:string;at:string;choice?:string;choiceLabel?:string;detail?:string;source?:Step["source"]};
export type Progress={intake:Intake;attempts:Attempt[];blocked:boolean;brief:string|null;lastRequest?:{id:string;command:Change};reopened:boolean;guideVersion?:2;guidance?:GuidanceJob;adaptiveEnabled?:boolean;adaptive?:AdaptiveGuidance};
const checkedAt="2026-09-26";
export const safetySources=[
 {label:"Enbridge Gas: gas safety",url:"https://www.enbridgegas.com/ontario/safety/smell-gas",checkedAt},
 {label:"Enbridge Gas: carbon monoxide",url:"https://www.enbridgegas.com/ontario/safety/carbon-monoxide",checkedAt},
 {label:"Electrical Safety Authority: flooding",url:"https://esasafe.com/safety/storm-safety/flood-safety/",checkedAt},
];
export function hazardDetected(input:Intake){
 // Conservative routing, not a diagnosis. Explicit confirmation is required as well.
 return input.hazard!=="none"||/ceiling.*(sag|collaps)|structural.*(crack|damage)|gas\s*(smell|leak)|smell.*gas|rotten\s*egg|carbon\s*monoxide|\bco\s*alarm|sparks?|sparking|smoke|burning|electr.*water|water.*electr|flood|exposed\s*wires|electric\s*shock/i.test(input.description+" "+input.title);
}
export function createProgress(intake:Intake,improved=false):Progress{return {...(improved?{guideVersion:2 as const}:{}),intake,attempts:[],blocked:hazardDetected(intake),brief:null,reopened:false};}
export function nextStep(p:Progress,status:string):Step|null{
 if(p.blocked||p.reopened||status!=="next_steps_ready")return null;
 if(p.adaptiveEnabled&&p.adaptive)return p.adaptive.step;
 if(p.guideVersion===2)return guidedStep(p,status);
 const observe:Step[]=[
 {id:"symptoms",title:"Notice when it happens",detail:"From a safe distance, note when the problem started, whether it is constant, and any displayed message. Do not open covers or move equipment. Add what you notice below.",kind:"observe"},
 {id:"model",title:"Identify the equipment",detail:"If its label is visible without moving or opening anything, note the manufacturer and exact model. Otherwise choose “Can’t do this”. An unknown model is fine for a service request.",kind:"observe"},
 ];
 const internet:Step[]=[
 {id:"devices",title:"Is it one device or all devices?",detail:"Check whether another device can use the same Wi-Fi. Record which devices are affected. Do not reset the router or change its settings.",kind:"observe"},
 {id:"outage",title:"Check your provider’s outage notice",detail:"Use your provider’s official outage page over mobile data, if available. If there is a known outage, stop troubleshooting and follow the provider’s update. The link below is for Rogers customers only.",kind:"observe",source:{label:"Rogers outage information",url:"https://www.rogers.com/support/outage",checkedAt}},
 {id:"wifi",title:"Reconnect the affected device",detail:"If there is no known outage, turn Wi-Fi off and back on on the affected phone or computer, then reconnect to your usual network. This does not change router settings. Did access return?",kind:"try"},
 ];
 // No mains, gas, plumbing disassembly or model-specific repair without verified instructions.
 const steps=p.intake.category==="internet"?internet:observe;
 return steps.find(step=>!p.attempts.some(a=>a.stepId===step.id))??null;
}
export function changeProgress(p:Progress,status:string,change:Change,at:string){
 if(p.attempts.length>=100&&["respond","reopen"].includes(change.action))throw new Error("This issue has a long history. Start a new issue for further checks.");
 if(change.action==="tailor")throw new Error("Guidance must be refreshed separately.");
 const next:Progress={...p,attempts:[...p.attempts]};
 if(next.guidance?.state==="reading")next.guidance={...next.guidance,state:"ready",method:"rules",reason:undefined};
 let nextStatus=status;
 if(change.action==="brief"){next.brief=change.text;return {progress:next,status:nextStatus};}
 if(change.action==="reopen"){
  if(status!=="resolved")throw new Error("Only a resolved issue can be reopened.");
  next.reopened=true;nextStatus=p.intake.context==="renter"?"waiting_on_landlord":"waiting_on_professional";
  next.attempts.push({stepId:"reopen",title:"Problem returned",answer:"reopened",note:change.note,at});
 }else if(change.action==="resolve"){
  if(status==="resolved")throw new Error("This issue is already resolved.");
  nextStatus="resolved";next.attempts.push({stepId:"resolution",title:"Customer-reported outcome",answer:"resolved",note:change.note,at});
 }else if(change.action==="escalate"){
  if(status==="resolved")throw new Error("Reopen the issue before requesting help.");
  nextStatus=p.intake.context==="renter"?"waiting_on_landlord":"waiting_on_professional";
 }else{
  const step=nextStep(p,status);
  if(!step||step.id!==change.stepId)throw new Error("This step changed. Reload your saved progress.");
  if(step.kind==="observe"&&["worked","did_not_work"].includes(change.answer))throw new Error("Record the observation before continuing.");
  if(step.kind==="try"&&change.answer==="checked")throw new Error("Choose what happened.");
  if(p.guideVersion===2&&step.kind==="observe"&&!step.choices&&change.answer==="checked"&&!change.note.trim())throw new Error("Add what you found, or choose Can’t do this.");
  if(step.choices&&change.answer==="checked"&&!step.choices.some(c=>c.id===change.choice))throw new Error("Choose what you noticed.");
  if(change.choice&&!step.choices?.some(c=>c.id===change.choice))throw new Error("This answer is unavailable for this step.");
  next.attempts.push({stepId:step.id,title:step.title,detail:step.detail,source:step.source,answer:change.answer,note:change.note,at,...(change.choice?{choice:change.choice,choiceLabel:step.choices?.find(c=>c.id===change.choice)?.label}: {})});
  if(hazardDetected({...p.intake,title:"Safety follow-up",description:change.note,hazard:"none"})){next.blocked=true;return {progress:next,status:"waiting_on_professional"};}
  if(change.answer==="worked")nextStatus="resolved";
  else if(p.adaptiveEnabled&&["checked","did_not_work","cannot","unsure"].includes(change.answer)){next.adaptive=undefined;nextStatus="next_steps_ready";}
  else if(["cannot","unsure","stop"].includes(change.answer))nextStatus=p.intake.context==="renter"?"waiting_on_landlord":"waiting_on_professional";
  else if(!nextStep(next,nextStatus))nextStatus=p.intake.context==="renter"?"waiting_on_landlord":"waiting_on_professional";
 }
 // User-reported outcomes are evidence, never a verified diagnosis or safety clearance.
 return {progress:next,status:nextStatus};
}
export function serviceBrief(p:Progress,status:string){
 const i=p.intake;
 return [i.context==="renter"?"Request to landlord":"Request for professional help",i.title,
 "Symptoms reported: "+i.description,"Equipment: "+(i.equipment||"Exact model not identified"),
 "Status: "+status.replaceAll("_"," "),
 p.blocked?"Safety concern reported or detected. Ordinary troubleshooting was stopped. This app has not confirmed the area is safe.":"",
 (p.attempts.length>8?"Latest 8 entries shown; earlier checks remain in Rezlee.":""),
 ...p.attempts.slice(-8).map(a=>a.at.slice(0,10)+" — "+a.title+": "+a.answer.replaceAll("_"," ")+(a.choice?" ("+(a.choiceLabel??a.choice)+")":"")+(a.note?" — "+a.note.slice(0,300)+(a.note.length>300?"…":""):"")),
 "Please advise the next appropriate step. Cause and warranty coverage have not been confirmed."
 ].filter(Boolean).join("\n\n");
}
