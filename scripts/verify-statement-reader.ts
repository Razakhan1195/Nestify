import {readFile,writeFile} from "node:fs/promises";
import {historicalStatementExtractionSchema} from "../src/lib/ai/historical-statement";
async function main(){
const cases=JSON.parse(await readFile("tests/fixtures/statement-reader-cases.json","utf8")) as Array<{id:string;text:string;expected:Record<string,unknown>}>;
if(!process.argv.includes("--authorized-live"))throw Error("Live model calls require explicit approval. No calls made.");
const token=process.env.REZLEE_STAGING_TEST_TOKEN;
if(!token)throw Error("Provide a disposable staging account token via REZLEE_STAGING_TEST_TOKEN. Never use production.");
const base=process.env.REZLEE_READER_TEST_BASE ?? "https://staging.rezlee.com";
if(!["https://staging.rezlee.com","http://127.0.0.1:3109"].includes(base))throw Error("Only isolated staging or the local acceptance server is allowed.");
const headers={Authorization:"Bearer "+token};
const capability=await fetch(base+"/api/mobile/v1/ai/scan",{headers,redirect:"error",signal:AbortSignal.timeout(15000)});
if(!capability.ok||(await capability.json()).receiptExtraction!==true)throw Error("Reader is disabled or unavailable (HTTP "+capability.status+"). No model calls made.");
function pdf(text:string){
 const escape=(v:string)=>v.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
 const content="BT /F1 10 Tf 40 760 Td "+text.split("\n").flatMap(line=>line.match(/.{1,80}(?:\s|$)|.{1,80}/g)??[""]).map((line,i)=>(i?"0 -16 Td ":"")+"("+escape(line)+") Tj").join("\n")+" ET";
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+Buffer.byteLength(content)+" >>\nstream\n"+content+"\nendstream"];
 let out="%PDF-1.4\n";const offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";});
 const xref=Buffer.byteLength(out);out+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
 return new Uint8Array(Buffer.from(out));
}
const results:Array<Record<string,unknown>>=[];
for(const item of cases.slice(0,6)){
 const form=new FormData();form.append("kind","bill_history");form.append("file",new File([pdf(item.text)],item.id+".pdf",{type:"application/pdf"}));
 const start=Date.now();
 try{
  const response=await fetch(base+"/api/mobile/v1/ai/scan",{method:"POST",headers,body:form,redirect:"error",signal:AbortSignal.timeout(55000)});
  if(!response.ok){results.push({id:item.id,status:response.status,passed:false,ms:Date.now()-start});break;}
  const data=historicalStatementExtractionSchema.parse((await response.json()).data);
  const mismatches=Object.entries(item.expected).filter(([key,value])=>data[key as keyof typeof data]!==value).map(([key])=>key);
  results.push({id:item.id,passed:mismatches.length===0,mismatches,ms:Date.now()-start});
 }catch{results.push({id:item.id,passed:false,error:"Request or schema failure; no retry",ms:Date.now()-start});break;}
}
await writeFile("/tmp/rezlee-reader-live-results.json",JSON.stringify({synthetic:true,results},null,2));
for(const result of results)console.log(JSON.stringify(result));
if(results.length!==6||results.some(r=>!r.passed))process.exitCode=1;

}
void main().catch(error=>{console.error(error instanceof Error ? error.message : "Reader verification failed");process.exitCode=1;});
