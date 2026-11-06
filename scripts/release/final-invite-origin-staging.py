from pathlib import Path
import subprocess,json,datetime,base64,hashlib
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/launch-closeout-20261021'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
def api(route,body=None,method='POST'):
 cmd=cli+[route+('&' if '?' in route else '?')+'teamId='+team]
 if body is not None:cmd+=['--method',method,'--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=60)
 if p.returncode:raise RuntimeError('Vercel request failed; response suppressed')
 return json.loads(p.stdout)
def save(s):
 s['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'invite-origin-staging-status.json').write_text(json.dumps(s,indent=2));print(json.dumps(s),flush=True)
assert not (out/'invite-origin-staging-status.json').exists(),'Inspect prior status; do not duplicate deployment'
previous=api('/v4/aliases/staging.rezlee.com')['deploymentId'];assert previous=='dpl_6oyRYrRs1A5RepHrdnwWWLmoXdVE'
prod=api('/v4/aliases/rezlee.com')['deploymentId']
before=api('/v10/projects/'+project+'/env')['envs'];entry=next(e for e in before if e['key']=='HOUSEHOLD_INVITE_BASE_URL' and e.get('target')==['preview'] and not e.get('gitBranch'))
old=api('/v1/projects/'+project+'/env/'+entry['id']);assert old['value'].rstrip('/')=='https://ezgb-test.rezlee.com'
api('/v9/projects/'+project+'/env/'+entry['id'],{'value':'https://staging.rezlee.com'},'PATCH')
assert api('/v1/projects/'+project+'/env/'+entry['id'])['value']=='https://staging.rezlee.com'
after=api('/v10/projects/'+project+'/env')['envs'];assert {(e['id'],e.get('updatedAt')) for e in before if 'production' in e.get('target',[])}=={(e['id'],e.get('updatedAt')) for e in after if 'production' in e.get('target',[])}
s={'previousStaging':previous,'productionDeployment':prod,'productionSettingsUnchanged':True,'settingSaved':True,'stage':'preparing'};save(s)
payload=json.loads((out/'production-package/deployment-request.json').read_text());payload.pop('target');payload['files']=[x for x in payload['files'] if x['file'] not in ['scripts/release/verify-staging-runtime.cjs','scripts/release/verify-production-runtime.cjs']]
guard=r/'scripts/release/verify-staging-runtime.cjs';payload['files'].append({'file':'scripts/release/verify-staging-runtime.cjs','data':base64.b64encode(guard.read_bytes()).decode(),'encoding':'base64'})
payload['projectSettings']['buildCommand']='node scripts/release/verify-staging-runtime.cjs && npm run build';payload['meta']={'rezleeCandidate':'staging-household-invite-origin-20261022','rezleeSource':'accepted-AI-recovery-plus-build-time-origin-guard'}
assert 'env' not in payload and 'target' not in payload and payload['autoAssignCustomDomains']==False
(out/'invite-origin-staging-payload.json').write_text(json.dumps(payload,separators=(',',':')))
s['payloadSha256']=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest();s['stage']='creating';save(s)
d=api('/v13/deployments',payload);s.update({'deploymentId':d['id'],'url':d['url'],'stage':'building','aliased':False});save(s)
