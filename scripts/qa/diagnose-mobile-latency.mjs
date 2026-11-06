import fs from 'node:fs';
const p='/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019';
const s=JSON.parse(fs.readFileSync(p+'/cloud-load-sessions.json'));
const paths=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'];
const out=[];
for(const count of [5,25,75]) {
 const rows=await Promise.all(s.users.slice(-count).map(async(u,i)=>{const t=Date.now();let status=0,error=null;try{const r=await fetch('https://staging.rezlee.com/api/mobile/v1/'+paths[i%6],{headers:{Authorization:'Bearer '+u.token},signal:AbortSignal.timeout(20000)});status=r.status;await r.arrayBuffer();}catch(e){error=e.name;}return {route:paths[i%6],status,error,ms:Date.now()-t};}));
 out.push({count,rows});fs.writeFileSync(p+'/dependency-diagnostic-results.json',JSON.stringify(out,null,2));console.log(count,'requests',rows.filter(x=>x.status===200).length,'passed','max',Math.max(...rows.map(x=>x.ms)));
 if(rows.some(x=>x.status===0||x.status>=500))break;
 await new Promise(r=>setTimeout(r,3000));
}
