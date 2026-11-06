from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time,os,shutil
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');root=r/'docs/checkpoints/release-config-20261021';out=root/'performance-recovery/corrected-candidate';out.mkdir()
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
def api(p,body=None):
 cmd=cli+[p+('&' if '?' in p else '?')+'teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 x=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=90);assert x.returncode==0,'Vercel request failed; suppressed';return json.loads(x.stdout)
def save(v):v['at']=datetime.now(timezone.utc).isoformat();(out/'status.json').write_text(json.dumps(v,indent=2)+'\n');print(json.dumps(v),flush=True)
previous=api('/v4/aliases/staging.rezlee.com');assert previous['deploymentId']=='dpl_GSkktgeKJL5MJzhws8RkMBLV1UDm'
prod=api('/v4/aliases/rezlee.com')['deploymentId']
state={'pid':os.getpid(),'stage':'restoring-validated-runtime-flags','previousDeploymentId':previous['deploymentId'],'productionDeploymentId':prod};save(state)
envs=api('/v10/projects/'+project+'/env')['envs']
for key in ['REZLEE_APPLE_NOTIFICATIONS_ENABLED','REZLEE_MOBILE_SCREEN_SNAPSHOT_ENABLED']:
 assert not any(e['key']==key and 'preview' in e.get('target',[]) for e in envs),'Unexpected existing flag requires review'
 api('/v10/projects/'+project+'/env',{'key':key,'value':'true','type':'plain','target':['preview'],'comment':'Required dependency of validated mobile combined-read/authentication path; enforced by staging build guard.'})
for name in ['release-preparation.json','release-source-manifest.json','release-deployment-source.json']:
 shutil.copyfile(root/name,out/('before-'+name))
p=subprocess.run(['python3',str(r/'scripts/release/prepare-staging-candidate.py'),'--deploy'],cwd=r,capture_output=True,text=True,timeout=180);(out/'preparation.log').write_text(p.stdout);assert p.returncode==0,'Preparation failed'
d=json.loads((root/'release-preparation.json').read_text());state.update(stage='building',deploymentId=d['deploymentId']);save(state)
for _ in range(45):
 v=api('/v13/deployments/'+d['deploymentId'])
 if v['readyState']=='READY':break
 assert v['readyState'] not in ['ERROR','CANCELED'],'Build rejected'
 time.sleep(10)
else:raise RuntimeError('Build readiness deadline')
assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==previous['deploymentId']
api('/v2/deployments/'+d['deploymentId']+'/aliases',{'alias':'staging.rezlee.com'})
state.update(stage='hosted-validation',aliasApplied=True);save(state)
env={**os.environ,'REZLEE_RELEASE_HOSTED_OUTPUT':str(out/'hosted'),'REZLEE_RELEASE_EXPECTED_DEPLOYMENT':d['deploymentId'],'REZLEE_REQUIRE_COMBINED_READS':'true'}
with (out/'hosted-controller.log').open('w') as log:
 p=subprocess.run(['/usr/local/bin/node',str(r/'scripts/qa/verify-release-hosted-20261021.mjs')],cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=360)
state['hostedExitCode']=p.returncode
if p.returncode:
 assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==d['deploymentId']
 api('/v2/deployments/'+previous['deploymentId']+'/aliases',{'alias':'staging.rezlee.com'});state.update(stage='failed-rolled-back',aliasApplied=False);save(state);raise SystemExit(1)
assert api('/v4/aliases/rezlee.com')['deploymentId']==prod
state.update(stage='accepted-ready-for-load',productionUnchanged=True);save(state)
(root/'staging-alias-acceptance.json').write_text(json.dumps({'at':state['at'],'stagingDeploymentId':d['deploymentId'],'hostedExitCode':0,'productionDeploymentId':prod,'productionUnchanged':True,'combinedReadPathVerified':True},indent=2)+'\n')
