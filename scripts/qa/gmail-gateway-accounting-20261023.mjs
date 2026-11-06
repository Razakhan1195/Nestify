import {createGateway} from '@ai-sdk/gateway';
const g=createGateway({fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})});
const result={at:new Date().toISOString(),keyConfigured:Boolean(process.env.AI_GATEWAY_API_KEY),report:null};
try{
 const data=await g.getSpendReport({startDate:'2026-10-23',endDate:'2026-10-23',groupBy:'day',datePart:'hour',model:'google/gemini-2.5-flash'});
 const allowed=['day','hour','totalCost','marketCost','inputTokens','outputTokens','cachedInputTokens','cacheCreationInputTokens','reasoningTokens','requestCount'];
 result.report=data.results.map(row=>Object.fromEntries(allowed.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
}catch(e){result.error={name:e?.name,statusCode:e?.statusCode??null};}
console.log(JSON.stringify(result));