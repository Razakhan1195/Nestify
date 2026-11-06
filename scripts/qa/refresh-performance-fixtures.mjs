import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const path=process.env.REZLEE_LOAD_SESSIONS;if(!path)throw Error('Explicit fixture session path required');
const state=JSON.parse(fs.readFileSync(path));const url='https://gjwvalpxnfbvryosmcbj.supabase.co';
const minimumMinutes=Number(process.env.REZLEE_SESSION_MIN_LIFE_MINUTES||40);
if(!Number.isFinite(minimumMinutes)||minimumMinutes<34||minimumMinutes>60)throw Error('Invalid session life budget');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let refreshed=0;
for(const u of state.users){
 const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));
 if(c.iss!==url+'/auth/v1'||c.sub!==u.id||c.user_metadata?.qa_run!==state.run||c.user_metadata?.qa_marker!==true||!/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(c.email||''))throw Error('Synthetic staging session guard');
 if(c.exp*1000>=Date.now()+minimumMinutes*60000)continue;
 if(!u.refreshToken)throw Error('Missing refresh material; do not change account credentials');
 const client=createClient(url,state.anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 await sleep(2100);
 const {data,error}=await client.auth.refreshSession({refresh_token:u.refreshToken});
 if(error)console.error('REFRESH_FAILURE',JSON.stringify({index:state.users.indexOf(u),name:error.name,status:error.status,code:error.code}));
 if(error||data.user?.id!==u.id||data.user.user_metadata?.qa_run!==state.run||!data.session)throw Error('Synthetic refresh failed');
 u.token=data.session.access_token;u.refreshToken=data.session.refresh_token;
 fs.writeFileSync(path+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(path+'.tmp',path);
 refreshed++;await sleep(400);
}
console.log('SESSION_LIFE_READY',state.users.length,'refreshed',refreshed);
