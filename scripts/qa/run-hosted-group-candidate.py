from pathlib import Path
import subprocess,json,time,sys
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/expense-groups-20261021'
p=r/'scripts/qa/verify-hosted-expense-groups.mjs';s=p.read_text().replace('p_job:job','p_id:job');p.write_text(s)
d=json.loads((out/'candidate-deployment.json').read_text());previous=d['previousDeploymentId'];alias='rezlee-performance-staging.vercel.app'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];team='team_RWL45V0YAuHJ7DvygUtJNB8o'
def api(path,body=None):
 cmd=cli+[path+('&' if '?' in path else '?')+'teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=45)
 if p.returncode:raise Exception('Vercel API operation failed')
 return json.loads(p.stdout) if p.stdout.strip() else {}
changed=False;rc=1;events=[]
try:
 for i in range(30):
  v=api('/v13/deployments/'+d['id'])
  print('Candidate state',v['readyState'],flush=True)
  assert v['projectId']=='prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS'
  if v['readyState']=='READY':break
  assert v['readyState'] not in ['ERROR','CANCELED']
  time.sleep(10)
 else:raise Exception('Build did not become ready')
 assert set(d['explicitEnvironmentNames']).issubset(set(v['env'])),'Explicit configuration missing'
 assert api('/v4/aliases/'+alias)['deploymentId']==previous,'Baseline alias changed'
 api('/v2/deployments/'+d['id']+'/aliases',{'alias':alias});changed=True
 assert api('/v4/aliases/'+alias)['deploymentId']==d['id']
 print('Temporary staging alias verified. Hosted checks starting.',flush=True)
 with (out/'hosted.log').open('w') as f: rc=subprocess.run(['/usr/local/bin/node','scripts/qa/verify-hosted-expense-groups.mjs'],cwd=r,stdout=f,stderr=subprocess.STDOUT).returncode
 print('Hosted check exit',rc,flush=True)
 print('\n'.join((out/'hosted.log').read_text().splitlines()[-15:]),flush=True)
finally:
 if changed:
  current=api('/v4/aliases/'+alias)
  assert current['deploymentId']==d['id'],'Concurrent alias change; do not overwrite'
  api('/v2/deployments/'+previous+'/aliases',{'alias':alias})
 restored=api('/v4/aliases/'+alias)
 result={'at':datetime.now(timezone.utc).isoformat(),'alias':alias,'deploymentId':restored['deploymentId'],'restored':restored['deploymentId']==previous,'testExitCode':rc,'customerProduction':api('/v4/aliases/rezlee.com')['deploymentId']}
 (out/'hosted-alias-restoration.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
sys.exit(rc)
