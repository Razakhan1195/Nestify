
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateText} from 'ai';
import {google} from '@ai-sdk/google';
import {gateway} from '@ai-sdk/gateway';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
assert.equal(url,'https://gjwvalpxnfbvryosmcbj.supabase.co');
const provider=(process.env.AI_ASSISTANT_PROVIDER||'auto').toLowerCase();
const direct=(provider==='auto'||provider==='google')&&Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
const model=process.env.AI_ASSISTANT_MODEL||(direct?'gemini-2.5-flash-lite':'google/gemini-2.5-flash-lite');
const report={at:new Date().toISOString(),provider:direct?'google':'gateway',model,googleKeyPresent:Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),gatewayKeyPresent:Boolean(process.env.AI_GATEWAY_API_KEY),scope:'One bounded direct SDK diagnostic with approved Preview environment, existing spend reservation, no retries. Not hosted acceptance.'};
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),id=randomUUID();
const reserve=await db.rpc('reserve_rezlee_ai_attempt',{p_id:id,p_feature:'assistant',p_model:model});
report.admission=reserve.error?'database-error':reserve.data;
if(!reserve.error&&reserve.data==='allowed'){
 const start=Date.now();
 try{
  const result=await generateText({model:direct?google(model):gateway(model),prompt:'Reply with the word ready.',maxOutputTokens:20,maxRetries:0,abortSignal:AbortSignal.timeout(12000)});
  report.ok=Boolean(result.text);report.ms=Date.now()-start;
  const usage=result.usage;
  if(Number.isSafeInteger(usage.inputTokens)&&Number.isSafeInteger(usage.outputTokens)){const settled=await db.rpc('settle_rezlee_ai_attempt',{p_id:id,p_input_tokens:usage.inputTokens,p_output_tokens:usage.outputTokens});report.settlement=settled.error?'database-error':settled.data;}
 }catch(e){report.ok=false;report.ms=Date.now()-start;report.errorName=e.name;report.httpStatus=e.statusCode||null;report.retryable=e.isRetryable||false;report.causeName=e.cause?.name||null;}
}
fs.writeFileSync('docs/checkpoints/launch-closeout-20261021/ai-preview-direct-diagnostic.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
