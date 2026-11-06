import assert from 'node:assert/strict';
import test from 'node:test';
import {checkRecoveryBackup} from '../src/lib/ops/backup-watchdog';
const now=Date.parse('2026-10-20T12:00:00Z');
const artifact=(hours:number,extra={})=>({id:1,name:'rezlee-recovery-1',expired:false,size_in_bytes:1000,created_at:new Date(now-hours*3600000).toISOString(),...extra});
function mock(responses:unknown[]) { const calls:{url:string;init:RequestInit|undefined}[]=[];const request:typeof fetch=async (input,init)=>{calls.push({url:String(input),init});const body=responses.shift();return body===null?new Response(null,{status:204}):Response.json(body);};return {calls,request}; }
test('a complete fresh archive suppresses exports without consulting or triggering jobs',async()=>{const m=mock([{artifacts:[artifact(19.9)]}]);assert.equal((await checkRecoveryBackup({token:'test',now,request:m.request})).action,'fresh_backup');assert.equal(m.calls.length,1);});
test('expired and empty archives cannot hide a missing usable backup',async()=>{const m=mock([{artifacts:[artifact(1,{expired:true}),artifact(2,{size_in_bytes:0})]},{workflow_runs:[]},null]);assert.equal((await checkRecoveryBackup({token:'test',now,request:m.request})).action,'dispatched');assert.deepEqual(JSON.parse(String(m.calls[2].init?.body)),{ref:'main',inputs:{respect_freshness:true}});});
test('an export in progress suppresses duplicate dispatch even when overdue',async()=>{const m=mock([{artifacts:[artifact(25)]},{workflow_runs:[{status:'in_progress'}]}]);assert.equal((await checkRecoveryBackup({token:'test',now,request:m.request})).action,'already_running');assert.equal(m.calls.length,2);});
test('malformed upstream state and future timestamps fail closed',async()=>{for(const data of [{unexpected:true},{artifacts:[artifact(-1)]}]){const m=mock([data]);await assert.rejects(checkRecoveryBackup({token:'test',now,request:m.request}));assert.equal(m.calls.length,1);}});
test('missing credentials perform no network requests',async()=>{const m=mock([]);await assert.rejects(checkRecoveryBackup({token:'',now,request:m.request}));assert.equal(m.calls.length,0);});
