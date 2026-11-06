import test from "node:test";
import assert from "node:assert/strict";
import {wrapLanguageModel} from "ai";
import type {LanguageModelV3,LanguageModelV3CallOptions} from "@ai-sdk/provider";
import {spendMiddleware} from "../src/lib/ai/spend-policy";
const params:LanguageModelV3CallOptions={prompt:[{role:"user",content:[{type:"text",text:"Private household fixture"}]}],maxOutputTokens:9000};
function fake(counter:{calls:number;tokens:number},modelId="google/gemini-2.5-flash"):LanguageModelV3{return{specificationVersion:"v3",provider:"fixture",modelId,supportedUrls:{},
 doGenerate:async p=>{counter.calls++;counter.tokens=p.maxOutputTokens!;return{content:[{type:"text",text:"Fixture"}],finishReason:{unified:"stop",raw:"stop"},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}},warnings:[]};},
 doStream:async p=>{counter.calls++;counter.tokens=p.maxOutputTokens!;return{stream:new ReadableStream({start(c){c.close();}})};}
};}
test("both generated and streamed calls stop before the model when dollar admission fails",async()=>{
 const c={calls:0,tokens:0};let reservations=0;
 const model=wrapLanguageModel({model:fake(c),middleware:spendMiddleware(async()=>{reservations++;return false;})});
 await assert.rejects(async()=>model.doGenerate(params),/capacity/);await assert.rejects(async()=>model.doStream(params),/capacity/);
 assert.equal(c.calls,0);assert.equal(reservations,2);
});
test("each actual attempt reserves separately and enforces bounded output",async()=>{
 const c={calls:0,tokens:0};let reservations=0;
 const model=wrapLanguageModel({model:fake(c),middleware:spendMiddleware(async()=>++reservations<=2)});
 await model.doGenerate(params);await model.doStream(params);await assert.rejects(async()=>model.doGenerate(params),/capacity/);
 assert.equal(c.calls,2);assert.equal(c.tokens,5000);assert.equal(reservations,3);
});
test("unknown model, paid tools and audio cannot bypass the reviewed price ceiling",async()=>{
 const c={calls:0,tokens:0};let admitted=0;const middleware=spendMiddleware(async()=>{admitted++;return true;});
 const model=wrapLanguageModel({model:fake(c),middleware});
 await assert.rejects(async()=>wrapLanguageModel({model:fake(c,"other/unreviewed"),middleware}).doGenerate(params),/not available/);
 await assert.rejects(async()=>model.doGenerate({...params,tools:[{type:"provider",id:"google.search",name:"search",args:{}}]}),/not available/);
 await assert.rejects(async()=>model.doGenerate({...params,prompt:[{role:"user",content:[{type:"file",mediaType:"audio/wav",data:new Uint8Array()}]}]}),/not supported/);
 assert.equal(admitted,0);assert.equal(c.calls,0);
});

test("failed generated and initial streaming calls report failure once and retain original errors",async()=>{
 const original=new Error("provider rejected");let failures=0;
 const base=fake({calls:0,tokens:0});base.doGenerate=async()=>{throw original;};base.doStream=async()=>{throw original;};
 const model=wrapLanguageModel({model:base,middleware:spendMiddleware(async()=>({settle:async()=>{},failed:async e=>{assert.equal(e,original);failures++;throw Error("accounting unavailable");}}))});
 await assert.rejects(async()=>model.doGenerate(params),(e: unknown)=>e===original);await assert.rejects(async()=>model.doStream(params),(e: unknown)=>e===original);assert.equal(failures,2);
});
