from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import subprocess,json,base64,hashlib,sys
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
stamp=lambda:datetime.now(timezone.utc).isoformat()
def api(path,body=None):
 cmd=cli+[path+('&' if '?' in path else '?')+'teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=90)
 if p.returncode:raise RuntimeError('Vercel request failed; response suppressed to protect values')
 return json.loads(p.stdout)
source=json.loads((r/'docs/checkpoints/expense-groups-20261021/candidate-deployment-source.json').read_text())
files=source['files']
for item in files:
 path=PurePosixPath(item['file'])
 assert not path.is_absolute() and '..' not in path.parts
 assert not any(x.startswith('.env') or x in ['hosted-qa-settings.json','cloud-load-sessions.json','credentials.json'] for x in path.parts)
 assert path.suffix not in ['.p8','.pem','.p12','.jks','.mobileprovision']
guard=r/'scripts/release/verify-staging-runtime.cjs'
assert not any(x['file']=='scripts/release/verify-staging-runtime.cjs' for x in files)
files=files+[{'file':'scripts/release/verify-staging-runtime.cjs','data':base64.b64encode(guard.read_bytes()).decode(),'encoding':'base64'}]
# Explicitly reviewed referral overlay; fail if source moved since its recorded review.
referral=json.loads((r/'docs/checkpoints/referral-design-20261021/backend-overlays.json').read_text())
by_path={x['file']:x for x in files}
manifest=json.loads((r/'docs/checkpoints/expense-groups-20261021/candidate-source-manifest.json').read_text())
hashes={x['path']:x for x in manifest['files']}
for item in referral['files']:
 assert item['file'] in ['src/app/api/mobile/v1/rewards/route.ts','src/lib/membership/referral-link.ts']
 data=(r/item['file']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==item['sha256'],'Reviewed referral source changed'
 by_path[item['file']]={'file':item['file'],'data':base64.b64encode(data).decode(),'encoding':'base64'}
 hashes[item['file']]={'path':item['file'],'bytes':len(data),'sha256':item['sha256'],'changed':True}
hashes['scripts/release/verify-staging-runtime.cjs']={'path':'scripts/release/verify-staging-runtime.cjs','bytes':guard.stat().st_size,'sha256':hashlib.sha256(guard.read_bytes()).hexdigest(),'changed':True}
files=list(by_path.values())
(o/'release-source-manifest.json').write_text(json.dumps({'at':stamp(),'baseManifest':'docs/checkpoints/expense-groups-20261021/candidate-source-manifest.json','reviewedReferralOverlay':'docs/checkpoints/referral-design-20261021/backend-overlays.json','files':list(hashes.values()),'fileCount':len(hashes)},indent=2)+'\n')
metadata=api('/v9/projects/'+project)
assert metadata['id']==project
payload={'name':metadata['name'],'project':project,'files':files,'autoAssignCustomDomains':False,'alias':[],'projectSettings':{'buildCommand':'node scripts/release/verify-staging-runtime.cjs && npm run build'},'meta':{'rezleeCandidate':'launch-20261021','rezleeConfiguration':'saved-preview-only','rezleeSource':'baseline-plus-reviewed-provider-group-referral-overlays'}}
# Omit target to create a Preview deployment. Do not copy inline secrets or use a production target.
assert 'env' not in payload and 'deploymentId' not in payload and 'target' not in payload
encoded=json.dumps(payload,sort_keys=True,separators=(',',':')).encode()
(o/'release-deployment-source.json').write_bytes(encoded)
audit=subprocess.run(['python3',str(r/'scripts/release/audit-staging-configuration.py')],cwd=r,capture_output=True,text=True)
if audit.returncode not in [0,2]:raise RuntimeError('Configuration audit failed; deployment not attempted')
a=json.loads((o/'staging-configuration-audit.json').read_text())
state={'at':stamp(),'projectId':project,'environment':'preview','fileCount':len(files),'sourcePayloadSha256':hashlib.sha256(encoded).hexdigest(),'guardSha256':hashlib.sha256(guard.read_bytes()).hexdigest(),'configurationComplete':a['readyToDeploy'],'missingSensitiveSettings':a['missingSensitiveSettings'],'automaticAliasAssignment':False,'productionDeploymentAuthorizedByThisScript':False,'deployed':False}
if '--deploy' in sys.argv:
 if not a['readyToDeploy']:
  state['stage']='blocked_missing_configuration'
 else:
  current=api('/v4/aliases/staging.rezlee.com')
  assert current['projectId']==project
  prod=api('/v4/aliases/rezlee.com')
  d=api('/v13/deployments',payload)
  state.update({'stage':'deployment_created_not_aliased','deployed':True,'deploymentId':d['id'],'url':d['url'],'readyState':d['readyState'],'previousStagingDeploymentId':current['deploymentId'],'productionDeploymentId':prod['deploymentId']})
else:state['stage']='prepared' if a['readyToDeploy'] else 'prepared_but_blocked'
(o/'release-preparation.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state,indent=2))
if not a['readyToDeploy']:sys.exit(2)
