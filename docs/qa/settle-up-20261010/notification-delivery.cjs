const assert=require('node:assert/strict'),esbuild=require('/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild');
(async()=>{
await esbuild.build({entryPoints:['src/lib/notifications/service.ts'],outfile:'/tmp/rezlee-settlement-service.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'admin',setup(b){b.onResolve({filter:/supabase\/admin$/},()=>({path:'admin',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const createAdminClient=()=>{throw Error("Live DB forbidden in this test")};'}));}}]});
const {dispatchAppNotifications}=require('/tmp/rezlee-settlement-service.cjs');process.env.REZLEE_APP_NOTIFICATIONS_ENABLED='true';const NativeDate=Date;global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-10T16:00:00Z']));}static now(){return new NativeDate('2026-10-10T16:00:00Z').getTime();}};
const checks=[];
for(const mode of ['success','disabled','no-device','uncertain','removed','multiple']){
 const notices=[{id:'n1',user_id:'u',home_id:'home',category:'shared_expenses',title:'Payment recorded',body:'Alex recorded a payment.',metadata:{mobileHref:'/shared/11111111-1111-4111-8111-111111111111'},delivery_status:'pending',resolved_at:null}];if(mode==='multiple')notices.push({...notices[0],id:'n2'});
 const prefs={push_enabled:true,connections:true,bills:false,care:false,recalls:true,shared_expenses:mode!=='disabled',timezone:'America/Toronto'};const sends=[];
 global.fetch=async(url,input)=>{assert.equal(url,'https://exp.host/--/api/v2/push/send');sends.push(JSON.parse(input.body));if(mode==='uncertain')throw Error('Lost response');return{ok:true,json:async()=>({data:{status:'ok'}})};};
 const db={rpc:async name=>{if(name==='refresh_rezlee_settlement_notices'&&mode==='removed')notices.forEach(n=>{n.resolved_at='now';n.delivery_status='suppressed';});return{error:null};},from(table){let action='select',patch,filters=[];const q={select(){return q;},update(v){action='update';patch=v;return q;},eq(k,v){filters.push(n=>n[k]===v);return q;},is(k,v){filters.push(n=>n[k]===v);return q;},lt(){filters.push(()=>false);return q;},lte(){return q;},or(){return q;},in(k,v){filters.push(n=>v.includes(n[k]));return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){try{let data;if(table==='notification_preferences'){if(action==='update')throw Error('Shared events must not claim daily bill/care slots');data=prefs;}else if(table==='device_push_tokens')data=mode==='no-device'?[]:[{id:'t',expo_push_token:'synthetic-token'}];else if(table==='notifications'){data=notices.filter(n=>filters.every(f=>f(n)));if(action==='update')data.forEach(n=>Object.assign(n,patch));data=data.map(n=>({...n}));}else throw Error(table);return Promise.resolve({data,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;}};
 await dispatchAppNotifications(db,'home');await dispatchAppNotifications(db,'home');
 assert.equal(sends.length,['success','uncertain','multiple'].includes(mode)?1:0);
 assert.equal(notices[0].delivery_status,mode==='uncertain'?'uncertain':['disabled','no-device','removed'].includes(mode)?'suppressed':'sent');
 if(mode==='multiple')assert.equal(sends[0].data.mobileHref,'/shared');if(mode==='success')assert.match(sends[0].data.mobileHref,/^\/shared\//);
 checks.push(mode);
}
console.log('Passed notification delivery cases:',checks.join(', '),'(network mocked; no pushes sent)');
})().catch(e=>{console.error(e);process.exitCode=1});
