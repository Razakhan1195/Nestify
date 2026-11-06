import type {AiFilePart} from "./extraction";
import {statementEvidenceSuggestions,type StatementSuggestions} from "../../../apps/mobile/src/lib/statement-suggestions";
export type ReadWork={
 claim():Promise<boolean>;
 original():Promise<AiFilePart>;
 reserve():Promise<boolean>;
 current():Promise<boolean>;
 extract(file:AiFilePart):Promise<unknown>;
 complete(result:StatementSuggestions):Promise<void>;
 fail():Promise<void>;
 period:{periodStart:string|null;periodEnd:string|null};
};
export async function runStatementRead(work:ReadWork){
 if(!await work.claim())return;
 try{
  const file=await work.original();
  if(!await work.current()||!await work.reserve())throw Error("Unavailable");
  const raw=await work.extract(file);
  if(!await work.current())throw Error("Statement changed");
  await work.complete(statementEvidenceSuggestions(raw,work.period));
 }catch{
  // No automatic retry: the model may have processed a timed-out request.
  await work.fail();
 }
}

export function publicReadAttempt(row: {status:string;created_at:string;source_basis:string;result:unknown}|null,basis:string){
 if(!row)return null;
 if(row.source_basis!==basis)return {status:"changed",result:null};
 if(["queued","running"].includes(row.status)&&Date.now()-Date.parse(row.created_at)>120000)return {status:"failed",result:null};
 return {status:row.status,result:row.status==="complete"?row.result:null};
}
