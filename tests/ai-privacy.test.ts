import test from "node:test";
import assert from "node:assert/strict";
import {wrapLanguageModel} from "ai";
import type {LanguageModelV3, LanguageModelV3CallOptions} from "@ai-sdk/provider";
import {privateAiMiddleware, privateGatewayModelId} from "../src/lib/ai/privacy-policy";
import {spendMiddleware} from "../src/lib/ai/spend-policy";

const params: LanguageModelV3CallOptions = {prompt:[{role:"user",content:[{type:"text",text:"Synthetic saved Gmail bill fixture"}]}]};
function fixture(provider = "gateway") {
  const calls: LanguageModelV3CallOptions[] = [];
  let reservations = 0;
  const base: LanguageModelV3 = {specificationVersion:"v3", provider, modelId:"google/gemini-2.5-flash", supportedUrls:{},
    doGenerate: async p => {calls.push(p);return {content:[{type:"text",text:"fixture"}],finishReason:{unified:"stop",raw:"stop"},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}},warnings:[]};},
    doStream: async p => {calls.push(p);return {stream:new ReadableStream({start(c){c.close();}})};},
  };
  const model = wrapLanguageModel({model:base,middleware:[privateAiMiddleware(),spendMiddleware(async()=>{reservations++;return true;})]});
  return {model, calls, reservations:()=>reservations};
}
test("saved Gmail-derived records use protected routing for generated and streamed answers",async()=>{
  const f=fixture();await f.model.doGenerate(params);await f.model.doStream(params);
  assert.equal(f.calls.length,2);assert.equal(f.reservations(),2);
  for(const p of f.calls){assert.equal(p.providerOptions?.gateway?.zeroDataRetention,true);assert.equal(p.providerOptions?.gateway?.disallowPromptTraining,true);}
});
test("privacy cannot be disabled by a feature while model reasoning options remain intact",async()=>{
  const f=fixture();await f.model.doGenerate({...params,providerOptions:{gateway:{zeroDataRetention:false,disallowPromptTraining:false},google:{thinkingConfig:{thinkingBudget:0}}}});
  assert.deepEqual(f.calls[0].providerOptions,{gateway:{zeroDataRetention:true,disallowPromptTraining:true},google:{thinkingConfig:{thinkingBudget:0}}});
});
test("direct-provider fallback and request-level credential overrides fail before disclosure or spend",async()=>{
  for(const provider of ["google.generative-ai","openai.responses","custom"]){
    const f=fixture(provider);await assert.rejects(async()=>f.model.doGenerate(params),/Private AI processing/);await assert.rejects(async()=>f.model.doStream(params),/Private AI processing/);assert.equal(f.calls.length,0);assert.equal(f.reservations(),0);
  }
  const f=fixture();await assert.rejects(async()=>f.model.doGenerate({...params,providerOptions:{gateway:{byok:{}}}}),/Private AI processing/);assert.equal(f.calls.length,0);assert.equal(f.reservations(),0);
});
test("each retry retains privacy restrictions and cannot bypass model spending restrictions",async()=>{
  const f=fixture();for(let i=0;i<3;i++)await f.model.doGenerate(params);
  assert.equal(f.reservations(),3);assert.ok(f.calls.every(p=>p.providerOptions?.gateway?.zeroDataRetention===true));
  await assert.rejects(async()=>f.model.doGenerate({...params,providerOptions:{gateway:{models:["unreviewed/model"]}}}),/not available/);assert.equal(f.calls.length,3);
});
test("legacy Gemini settings normalize to the same gateway model",()=>{
  assert.equal(privateGatewayModelId("gemini-2.5-flash-lite"),"google/gemini-2.5-flash-lite");
  assert.equal(privateGatewayModelId("google/gemini-2.5-flash"),"google/gemini-2.5-flash");
});
