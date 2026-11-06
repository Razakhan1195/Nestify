import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const p=process.env.REZLEE_QA_OUTPUT||'/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019';
const s=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS||p+'/hosted-qa-settings.json'));
const fixture=JSON.parse(fs.readFileSync(p+'/cloud-load-fixtures.json'));const ownedIds=new Set(fixture.userIds);
if(s.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function list(){let out=[];for(let page=1;;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)throw error;out.push(...data.users);if(data.users.length<1000)break;}return out;}
const mine=u=>/^load-[0-9a-f-]{36}-\d+@example\.invalid$/.test(u.email||'')&&u.user_metadata?.qa_marker===true&&u.user_metadata?.qa_run===fixture.run&&ownedIds.has(u.id)&&u.created_at>='2026-10-19T00:00:00Z';
const users=(await list()).filter(mine);let removed=0;
for(const u of users){const r=await admin.auth.admin.deleteUser(u.id);if(r.error)throw Error('Disposable load cleanup failed');removed++;if(removed%25===0)console.log("REMOVED",removed);}
const remaining=(await list()).filter(mine).length;if(remaining)throw Error('Disposable load accounts remain');
const report={checkedAt:new Date().toISOString(),environment:'staging',disposableLoadAccountsRemoved:removed,remainingDisposableLoadAccounts:remaining,productionTouched:false};
fs.writeFileSync(p+'/load-cleanup-report.json',JSON.stringify(report,null,2));if(!process.env.REZLEE_QA_OUTPUT)fs.writeFileSync('docs/checkpoints/overnight-20261019/load-cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
