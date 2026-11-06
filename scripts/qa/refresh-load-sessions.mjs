import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const dir = '/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019';
const url = 'https://gjwvalpxnfbvryosmcbj.supabase.co';
const config = JSON.parse(fs.readFileSync(dir+'/staging-diagnostic-config.json','utf8')).env;
if(config.NEXT_PUBLIC_SUPABASE_URL !== url) throw Error('Staging only');
const path = dir+'/refreshed-load-progress.json';
const journal = JSON.parse(fs.readFileSync(path,'utf8'));
if(journal.users.length !== 300) throw Error('Expected 300 synthetic sessions');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function save(){fs.writeFileSync(path+'.tmp',JSON.stringify(journal),{mode:0o600});fs.renameSync(path+'.tmp',path);}
let done=0;
for(const old of journal.users){
 const claims=JSON.parse(Buffer.from(old.token.split('.')[1],'base64url').toString());
 if(claims.iss !== url+'/auth/v1' || claims.sub !== old.id || !claims.user_metadata?.qa_marker || claims.user_metadata.qa_run !== journal.run || !/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(claims.email||'')) throw Error('Synthetic identity guard failed');
 if(claims.exp*1000 < Date.now()+40*60000){
  const client=createClient(url,config.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})},auth:{persistSession:false,autoRefreshToken:false}});
  let refreshed=false;
  for(let attempt=0;attempt<4;attempt++){
   const {data,error}=await client.auth.refreshSession({refresh_token:old.refreshToken});
   if(error){if(error.status===429){await sleep(10000*(attempt+1));continue;}throw Error('Refresh failed: '+(error.code||error.status));}
   if(data.user?.id!==old.id || !data.session || data.user.user_metadata?.qa_run!==journal.run)throw Error('Refreshed identity mismatch');
   old.token=data.session.access_token;old.refreshToken=data.session.refresh_token;save();refreshed=true;break;
  }
  if(!refreshed)throw Error('Refresh rate limited; progress retained');
  await sleep(350);
 }
 if(++done%25===0)console.log('REFRESHED',done);
}
fs.writeFileSync(dir+'/cloud-load-sessions.json',JSON.stringify({run:journal.run,createdAt:new Date().toISOString(),users:journal.users.map(({refreshToken,...u})=>u),anonKey:config.NEXT_PUBLIC_SUPABASE_ANON_KEY}),{mode:0o600});
console.log('FRESH_SYNTHETIC_SESSIONS',done);
