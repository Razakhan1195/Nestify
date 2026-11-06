import type { Intake,Progress,Step } from "./session";
export type GuideKey="internet"|"faucet_flow"|"faucet_drip"|"fridge"|"heating"|"electrical"|"general";
export type GuidanceJob={state:"reading"|"ready"|"fallback";startedAt:string;requestId:string;method:"rules"|"ai";key:GuideKey;reason?:string};
export const guideKeys=["internet","faucet_flow","faucet_drip","fridge","heating","electrical","general"] as const;
const checkedAt="2026-09-30";
const rogers={label:"Rogers: connection checks",url:"https://www.rogers.com/support/internet/unable-to-access-the-internet-rogers-xfinity-gateway",checkedAt};
const moen={label:"Moen: identify your aerator",url:"https://solutions.moen.com/Article_Library/Faucet_Aerator_Cleaning",checkedAt};
const fridge={label:"Whirlpool Canada: refrigerator checks",url:"https://www.whirlpool.ca/en_ca/blog/kitchen/refrigerator-troubleshooting.html",checkedAt};
type Guide={title:string;summary:string;payoff:string;steps:Step[]};
const observe=(id:string,title:string,detail:string,why:string,choices?:{id:string;label:string}[],source?:Step["source"]):Step=>({id,title,detail,why,kind:"observe",choices,source});
export const guides:Record<GuideKey,Guide>={
 internet:{title:"Find where the connection breaks",summary:"We can separate a device problem from a household connection problem before changing any settings.",payoff:"Your request will say which devices are affected and what you have already tried.",steps:[
 observe("network-scope","Is it one device or the whole home?","Try your usual Wi-Fi on another phone or computer, if one is available.","This helps decide whether to focus on the device or the provider.",[{id:"one",label:"Only one device"},{id:"all",label:"All devices"},{id:"unknown",label:"I can’t check"}]),
 observe("network-outage","Is your provider reporting an outage?","Check your own provider’s official outage page using mobile data. The linked page applies to Rogers customers.","An outage means a repair at home is unlikely to help.",[{id:"outage",label:"There is an outage"},{id:"clear",label:"No outage reported"},{id:"unknown",label:"I can’t confirm"}],rogers),
 {id:"network-reconnect",title:"Reconnect the affected device",detail:"Turn Wi-Fi off and back on on the affected phone or computer, then reconnect to your usual network. Do not factory-reset the router.",why:"This refreshes the device’s connection without changing your household network settings.",kind:"try",source:rogers}
 ]},
 faucet_flow:{title:"Work out why the flow is weak",summary:"Weak flow at one tap and weak flow throughout the home need different next steps. We’ll start there.",payoff:"You’ll know whether to investigate the tap itself or ask about the wider water supply.",steps:[
 observe("tap-scope","Is the flow weak at another cold tap?","Briefly compare the affected tap with another cold tap, if it is safe. Do not adjust supply valves or open plumbing.","This separates a single fixture issue from a possible supply issue.",[{id:"one",label:"Only this tap"},{id:"all",label:"Other taps too"},{id:"unknown",label:"I can’t compare"}]),
 observe("tap-outlet","What can you see at the end of the tap?","Look without removing anything. Do you see mineral buildup, debris or an uneven spray?","Buildup can restrict flow, but it does not prove which part needs attention.",[{id:"buildup",label:"Visible buildup or uneven spray"},{id:"clear",label:"Nothing obvious"},{id:"unknown",label:"I’m unsure"}],moen),
 observe("tap-model","Find the faucet model, if available","Add the brand and model from an accessible label, receipt or manual in the note below. Skip this if you cannot find it. Moen’s guide shows different aerator designs; it is not permission to remove an unknown part.","Aerators attach differently. The exact model is needed before choosing cleaning instructions or replacement parts.",undefined,moen)
 ]},
 faucet_drip:{title:"Locate the leak before choosing a fix",summary:"A drip from the spout, a leak around the handle and water beneath the sink can require different work. We won’t guess a replacement part.",payoff:"Get a focused service request with the leak location and symptoms, instead of a vague “faucet broken” message.",steps:[
 observe("leak-location","Where is the water coming from?","Look without moving pipes or removing covers. Stop if water is spreading or near electricity.","This helps the landlord or plumber bring the right information and equipment.",[{id:"spout",label:"Spout, even when turned off"},{id:"handle",label:"Around the handle or base"},{id:"under",label:"Under the sink"},{id:"unknown",label:"I can’t tell"}]),
 observe("leak-model","Do you know the faucet brand or model?","Use an existing receipt, manual or a label you can see safely. Add it below, or skip. Do not force the handle or dismantle the faucet.","A cartridge or seal cannot be selected reliably from the word “faucet” alone.")
 ]},
 fridge:{title:"Check the simple reasons a fridge is warm",summary:"We can check the door and airflow without opening electrical parts or moving the appliance. These are general checks; your model’s manual takes priority.",payoff:"If the problem persists, your service request will include the checks already completed.",steps:[
 {id:"fridge-door",title:"Check whether the door closes fully",detail:"Move any container that prevents the door closing normally. Look for an obvious gap; do not force the door or remove its parts. Keep perishable food safe while cooling is uncertain.",why:"A blocked door allows warm air in. Correcting an obstruction is a simple first check.",kind:"try",source:fridge},
 {id:"fridge-vents",title:"Give the inside vents some space",detail:"If food is pressed against a visible interior air vent, move it away without removing covers. Keep the door closed afterwards. If cooling remains uncertain, contact service rather than waiting on this app.",why:"Blocked interior vents can restrict circulation. Clearing them does not confirm that the appliance is working properly.",kind:"try",source:fridge}
 ]},
 heating:{title:"Gather the right heating or cooling details",summary:"We’ll read the visible controls and symptoms. Gas equipment, wiring and internal repairs need qualified help.",payoff:"A focused request with the displayed mode, temperature and any error code.",steps:[
 observe("heating-display","What does the thermostat display?","Note the mode, room temperature, target temperature and any warning or code. Do not remove the thermostat or equipment cover.","The display helps distinguish a setting or control issue from a system that is not responding."),
 observe("heating-model","Find the equipment name if it is accessible","Add the brand/model from a manual, receipt or safely visible label. Do not move equipment to find it.","The model and code allow the correct manufacturer instructions to be checked.")
 ]},
 electrical:{title:"Leave electrical faults to qualified help",summary:"Do not open outlets, touch wiring or repeatedly reset a breaker. We can organise what you observed for an electrician or your landlord.",payoff:"A concise request describing what stopped working and when. If there are sparks, smoke, shocks or exposed wires, stop and get urgent help.",steps:[]},
 general:{title:"Narrow down the problem",summary:"Describe the symptom, not just the item name. For example: “Kitchen faucet drips when off” or “Fridge is warm but the light works.”",payoff:"A clearer symptom helps us choose relevant guidance. You can also prepare a help request now.",steps:[
 observe("problem-detail","What happens when you use it?","Add where the problem is, what you expected, and what actually happens. Include any visible message. Do not open or dismantle anything.","One specific symptom is more useful than a list of unrelated questions.")
 ]}
};
export function inferGuide(i:Intake):GuideKey{
 const text=(i.title+" "+i.description+" "+i.equipment).toLowerCase();
 if(i.category==="electrical"||/outlet|breaker|wiring/.test(text))return "electrical";
 if(i.category==="internet"||/wi.?fi|internet|router|modem/.test(text))return "internet";
 if(/fridge|refrigerator|freezer/.test(text)&&/warm|cool|cold|door|temperature|air.?flow/.test(text))return "fridge";
 if(/faucet|\btaps?\b/.test(text)&&/low|weak|flow|pressure|spray/.test(text))return "faucet_flow";
 if(/faucet|\btaps?\b|sink/.test(text)&&/drip|leak/.test(text))return "faucet_drip";
 if(i.category==="heating_cooling"||/thermostat|furnace|heating|air condition/.test(text))return "heating";
 return "general";
}
export function guidanceKey(p:Progress):GuideKey{
 const chosen=p.guidance?.key??inferGuide(p.intake);
 return chosen==="general"?inferGuide({...p.intake,description:[p.intake.description,...p.attempts.map(a=>a.note)].join(" ")}):chosen;
}
function modelAlreadyUnavailable(p:Progress){return /(?:do not|don.t|cannot|can.t) (?:know|find|identify) (?:the |its |my )?(?:exact )?model|(?:exact )?model (?:is )?unknown/i.test([p.intake.description,...p.attempts.map(a=>a.note)].join(" "));}
function hasCoolingSymptom(p:Progress){return /warm|cool|cold|temperature|air.?flow/i.test([p.intake.title,p.intake.description,...p.attempts.map(a=>a.note)].join(" "));}
function picked(p:Progress,id:string){return p.attempts.find(a=>a.stepId===id)?.choice;}
export function knownTapScope(p:Progress):"one"|"all"|undefined {
 const explicit=picked(p,"tap-scope");
 if(explicit==="one"||explicit==="all")return explicit;
 const text=[p.intake.description,...p.attempts.map(a=>a.note)].join(" ").toLowerCase();
 if(/(?:all|every|other|multiple) taps? (?:are |have |also have )?(?:weak|low|reduced)/.test(text))return "all";
 if(/other taps?.{0,20}(?:normal|fine|unaffected)|only (?:the |my )?(?:kitchen |bathroom )?(?:tap|faucet).{0,25}(?:weak|low|affected)/.test(text))return "one";
 return undefined;
}
export function knownNetworkScope(p:Progress):"one"|"all"|undefined {
 const explicit=picked(p,"network-scope");if(explicit==="one"||explicit==="all")return explicit;
 const text=[p.intake.description,...p.attempts.map(a=>a.note)].join(" ");
 if(/other devices (?:work normally|work fine|are online|are working)/i.test(text))return "one";
 if(/(?:all|every) (?:our |my |the )?devices (?:cannot|can’t|can't|do not|don’t|don't) connect/i.test(text))return "all";
 return undefined;
}
export function repairStopReason(p:Progress):"provider_outage"|"wider_water_supply"|"cannot_compare_water"|"leak_needs_help"|"unsupported_problem"|null {
 const key=guidanceKey(p);
 const description=[p.intake.title,p.intake.description,p.intake.equipment,...p.attempts.map(a=>a.note)].join(" ");
 if(key==="general"&&/dishwash|washing machine|washer|dryer|microwave|oven|stove|toilet|garage door|ice maker/i.test(description)&&/won.t|doesn.t|not (?:start|drain|work|heat)|leak|noise|grind|knock|stuck|error|rattl/i.test(description))return "unsupported_problem";
 if(key==="internet"&&(picked(p,"network-outage")==="outage"||/\b(?:provider|rogers|bell|telus) (?:reports|reported|confirmed|has confirmed) (?:an? |a known )?outage\b/i.test([p.intake.description,...p.attempts.map(a=>a.note)].join(" "))))return "provider_outage";
 if(key==="faucet_flow"){
  if(knownTapScope(p)==="all")return "wider_water_supply";
  const scope=p.attempts.find(a=>a.stepId==="tap-scope");
  if(scope&&(scope.choice==="unknown"||["cannot","unsure","stop"].includes(scope.answer)))return "cannot_compare_water";
 }
 if(key==="faucet_drip"&&["under","unknown"].includes(picked(p,"leak-location")??""))return "leak_needs_help";
 return null;
}
export function remainingGuideSteps(p:Progress):Step[]{
 const key=guidanceKey(p);
 if(p.blocked||p.reopened)return [];
 if(repairStopReason(p))return [];
 return guides[key].steps.filter(s=>!p.attempts.some(a=>a.stepId===s.id||a.title===s.title)
  &&!(s.id==="network-scope"&&knownNetworkScope(p))
  &&!(s.id==="network-outage"&&knownNetworkScope(p)==="one")
  &&!(s.id==="fridge-vents"&&!hasCoolingSymptom(p))
  &&!(s.id.endsWith("-model")&&(p.intake.equipment.trim()||modelAlreadyUnavailable(p)))
  &&!(s.id==="tap-scope"&&knownTapScope(p))
  &&!(s.id==="fridge-door"&&/door (?:closes|shuts) (?:fully|properly|normally)/i.test(p.intake.description)));
}
export function guidedStep(p:Progress,status:string):Step|null{
 if(p.blocked||p.reopened||status!=="next_steps_ready")return null;
 if(repairStopReason(p))return null;
 return remainingGuideSteps(p)[0]??null;
}
export function guideOutcome(p:Progress,status:string){
 const key=guidanceKey(p),g=guides[key];
 if(p.blocked)return {title:"Safety comes first",summary:"Stop ordinary troubleshooting and get appropriate help. Your report is saved.",next:"Use the safety guidance below. Do not wait for an AI response."};
 if(status==="resolved")return {title:"You reported it resolved",summary:"Your checks and outcome are saved together.",next:"If the symptom returns, reopen this issue. A reported fix is not a safety inspection."};
 if(p.reopened)return {title:"The problem returned",summary:"Your previous checks are kept. Avoid repeating a failed repair.",next:"Update the help request with what happened again."};
 if(p.adaptive&&status==="next_steps_ready")return {title:p.adaptive.disposition==="clarify"?"One detail will help":"What this tells us",summary:p.adaptive.explanation,next:p.adaptive.uncertainty};
 if(p.adaptive&&status!=="resolved")return {title:p.intake.context==="renter"?"Time to ask your landlord":"A useful next step",summary:p.adaptive.explanation,next:p.adaptive.uncertainty};
 if(picked(p,"network-outage")==="outage")return {title:"An outage was reported",summary:"Further device checks are unlikely to help while the provider is restoring service.",next:"Follow your provider’s updates. Record a resolution when your connection returns."};
 if(key==="faucet_flow"&&knownTapScope(p)==="all")return {title:"More than one tap is affected",summary:"That points to a wider supply question, not proof that this faucet needs a new part.",next:"Check your municipality’s water-service notices or contact your landlord/water provider. Include when the change started."};
 if(status!=="next_steps_ready"||!guidedStep(p,status))return {title:p.intake.context==="renter"?"Your landlord request is ready":"Your service request is ready",summary:g.payoff,next:"Review the summary and share it if you choose. Nothing has been sent or booked."};
 if(key==="fridge"&&!hasCoolingSymptom(p))return {title:"Check why the fridge door won’t close",summary:"Start with anything preventing the door from closing normally. We won’t assume there is a cooling fault.",next:g.payoff};
 return {title:g.title,summary:g.summary,next:g.payoff};
}
