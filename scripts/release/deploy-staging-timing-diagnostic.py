from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/release-config-20261021/performance-recovery';out.mkdir(exist_ok=True)
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
def api(path,body=None):
 cmd=cli+[path+'?teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=60);assert not p.returncode,'Vercel operation failed; response suppressed';return json.loads(p.stdout)
assert not (out/'diagnostic-deployment.json').exists()
envs=api('/v10/projects/'+project+'/env')['envs'];assert not any(e['key']=='REZLEE_PERF_DIAGNOSTICS' and 'preview' in e.get('target',[]) for e in envs)
api('/v10/projects/'+project+'/env',{'key':'REZLEE_PERF_DIAGNOSTICS','value':'true','type':'plain','target':['preview'],'comment':'Temporary numeric staging request timings for release regression diagnosis; no SQL sampling, credentials or payload logging.'})
payload=json.loads((r/'docs/checkpoints/release-config-20261021/release-deployment-source.json').read_text());payload['meta']['rezleeCandidate']='release-regression-timing-diagnostic'
current=api('/v4/aliases/staging.rezlee.com');assert current['deploymentId']=='dpl_6nsQKQ2yDjKxN4jf7wVKYim5njif'
d=api('/v13/deployments',payload);state={'at':datetime.now(timezone.utc).isoformat(),'id':d['id'],'url':d['url'],'projectId':project,'previousDeploymentId':current['deploymentId'],'sourceChanged':False,'onlyRuntimeChange':'REZLEE_PERF_DIAGNOSTICS=true','aliasApplied':False};(out/'diagnostic-deployment.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state),flush=True)
for _ in range(40):
 d=api('/v13/deployments/'+state['id']);state['readyState']=d['readyState']
 if d['readyState']=='READY':break
 assert d['readyState'] not in ['ERROR','CANCELED'],'Diagnostic build failed'
 time.sleep(10)
else:raise RuntimeError('Diagnostic readiness deadline')
assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==state['previousDeploymentId']
api('/v2/deployments/'+state['id']+'/aliases',{'alias':'staging.rezlee.com'});state.update(aliasApplied=True,at=datetime.now(timezone.utc).isoformat());(out/'diagnostic-deployment.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state),flush=True)
