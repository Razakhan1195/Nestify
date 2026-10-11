/** Release/weekly reference check. Public source reads only; no AI or customer data.
 * Reports upcoming expiry; never automatically changes a human review date.
 * npx tsx scripts/qa/check-repair-references.ts [--online]
 */
import {repairSources,reviewedReferences,readArticle,evidenceFailureCode} from "../../src/lib/issues/repair-evidence";
import {repairEvidencePassages} from "../../src/lib/issues/repair-citations";
const norm=(s:string)=>s.toLowerCase().replace(/\s+/g," ").trim();
async function main(){
 const rows=await Promise.all(Object.entries(reviewedReferences).map(async([id,review])=>{
  const source=repairSources.find(s=>s.id===id)!;
  const expiresAt=new Date(Date.parse(review.checkedAt)+30*86400000).toISOString();
  const daysRemaining=Math.floor((Date.parse(expiresAt)-Date.now())/86400000);
  let online="not_requested";
  if(process.argv.includes("--online"))try{
   const text=await readArticle(source.url);
   const passages=repairEvidencePassages([{...source,...review,scope:"general"}]);
   online=passages.every(p=>norm(text).includes(norm(p.quote)))?"excerpt_verified":"review_required_content_changed";
  }catch(error){online=evidenceFailureCode(error);}
  return {id,url:source.url,checkedAt:review.checkedAt,expiresAt,daysRemaining,needsReview:daysRemaining<=7||online==="review_required_content_changed",online};
 }));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),rows,aiCalls:0,customerDataAccess:false},null,2));
 if(rows.some(r=>r.needsReview))process.exitCode=1;
}
void main().catch(()=>{console.error("Reference check unavailable; review the official sources before renewing.");process.exitCode=1;});
