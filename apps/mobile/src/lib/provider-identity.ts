export type ProviderMark="rogers"|"bell"|"telus"|"enbridge"|"elexicon"|"hydro";
export function providerMark(name:string):ProviderMark|null{
 const normalized=name.normalize("NFKC").trim().toLowerCase().replace(/[.,]/g,"").replace(/\s+/g," ");
 const known:Record<string,ProviderMark>={"bell":"bell","bell canada":"bell","bell mobility":"bell","bell internet":"bell","mybell":"bell","telus":"telus","telus communications":"telus","telus mobility":"telus","rogers":"rogers","rogers communications":"rogers","rogers communications inc":"rogers","rogers cable":"rogers","rogers wireless":"rogers","rogers internet":"rogers","enbridge":"enbridge","enbridge gas":"enbridge","enbridge gas inc":"enbridge","elexicon":"elexicon","elexicon energy":"elexicon","elexicon energy inc":"elexicon","hydro one":"hydro","hydro one networks":"hydro","hydro one networks inc":"hydro"};
 return Object.prototype.hasOwnProperty.call(known,normalized)?known[normalized]:null;
}
export function billServiceIdentity(category:string){
 const value=category.trim().toLowerCase().replace(/[ _-]+/g," ");
 if(["electricity","electric","hydro"].includes(value))return {icon:"zap" as const,tone:"energy" as const};
 if(["gas","natural gas"].includes(value))return {icon:"wind" as const,tone:"energy" as const};
 if(["water","water sewer","water and sewer"].includes(value))return {icon:"droplet" as const,tone:"water" as const};
 if(["internet","telecom","telecommunications","internet tv","cable"].includes(value))return {icon:"wifi" as const,tone:"connection" as const};
 if(["mobile","phone","mobile phone","wireless","cellphone"].includes(value))return {icon:"smartphone" as const,tone:"connection" as const};
 if(value==="insurance")return {icon:"shield" as const,tone:"other" as const};
 return {icon:"file-text" as const,tone:"other" as const};
}
export function billAmountLabel(historical:boolean,amount:number|null|undefined){
 if(typeof amount==="number"&&Number.isFinite(amount)&&amount<0)return historical?"Period credit":"Saved credit";
 return historical?"Period charges":"Saved bill amount";
}
