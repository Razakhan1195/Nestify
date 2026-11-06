from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,sys
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
d=json.loads((o/'release-preparation.json').read_text());cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];team='team_RWL45V0YAuHJ7DvygUtJNB8o'
def api(path,body=None):
 cmd=cli+[path+'?teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=60)
 assert p.returncode==0,'Vercel operation failed; response suppressed'
 return json.loads(p.stdout)
assert d['deploymentId']=='dpl_6nsQKQ2yDjKxN4jf7wVKYim5njif'
v=api('/v13/deployments/'+d['deploymentId']);assert v['readyState']=='READY' and v['projectId']==d['projectId']
current=api('/v4/aliases/staging.rezlee.com');assert current['deploymentId']==d['previousStagingDeploymentId']
assert api('/v4/aliases/rezlee.com')['deploymentId']==d['productionDeploymentId']
changed=False;rc=1
try:
 api('/v2/deployments/'+d['deploymentId']+'/aliases',{'alias':'staging.rezlee.com'});changed=True
 assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==d['deploymentId']
 print('Staging candidate alias applied. Hosted acceptance starting.',flush=True)
 with (o/'hosted-acceptance/controller.log').open('w') as log:
  rc=subprocess.run(['/usr/local/bin/node','scripts/qa/verify-release-hosted-20261021.mjs'],cwd=r,stdout=log,stderr=subprocess.STDOUT).returncode
 print('Hosted acceptance exit '+str(rc),flush=True)
finally:
 if changed and rc!=0:
  assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==d['deploymentId'],'Concurrent staging alias change; do not overwrite'
  api('/v2/deployments/'+d['previousStagingDeploymentId']+'/aliases',{'alias':'staging.rezlee.com'})
 state={'at':datetime.now(timezone.utc).isoformat(),'candidateDeploymentId':d['deploymentId'],'hostedExitCode':rc,'stagingDeploymentId':api('/v4/aliases/staging.rezlee.com')['deploymentId'],'productionDeploymentId':api('/v4/aliases/rezlee.com')['deploymentId'],'rolledBack':changed and rc!=0}
 (o/'staging-alias-acceptance.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state),flush=True)
sys.exit(rc)
