from pathlib import Path
import subprocess,json,urllib.request
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/expense-groups-20261021'
ref='gjwvalpxnfbvryosmcbj';team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS'
access=subprocess.run(['/usr/bin/security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
req=urllib.request.Request('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',headers={'Authorization':'Bearer '+access})
keys=json.load(urllib.request.urlopen(req,timeout=30))
anon=next(v['api_key'] for v in keys if v['name']=='anon');secret=next(v['api_key'] for v in keys if v['name']=='service_role')
env={
 'NEXT_PUBLIC_SUPABASE_URL':'https://'+ref+'.supabase.co','NEXT_PUBLIC_SUPABASE_ANON_KEY':anon,'SUPABASE_SECRET_KEY':secret,
 'NEXT_PUBLIC_APP_URL':'https://rezlee-performance-staging.vercel.app','NEXT_PUBLIC_SITE_URL':'https://rezlee-performance-staging.vercel.app',
 'ACCOUNT_DELETION_ENABLED':'true','REZLEE_APPLE_NOTIFICATIONS_ENABLED':'true',
 'REZLEE_MOBILE_AUTH_CONTEXT_ENABLED':'true','REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED':'true',
 'REZLEE_HOME_SNAPSHOT_ENABLED':'true','REZLEE_MOBILE_READ_BUDGET_ENABLED':'true',
 'REZLEE_BILL_RECORD_REVIEW':'true','REZLEE_RECEIPT_DEDUP':'true',
 'REZLEE_AI_DISABLED':'true','DECK_MOCK_MODE':'true'
}
# This explicitly scoped configuration validates the hosted group/onboarding APIs.
# It does not reproduce provider/email/AI configuration or qualify as a full release runtime.
payload=json.loads((out/'candidate-deployment-source.json').read_text())
payload['env']=env;payload['build']={'env':env};payload['meta']['rezleeScope']='group-onboarding-API-only'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
p=subprocess.run(cli+['/v13/deployments?teamId='+team,'--method','POST','--input','-'],input=json.dumps(payload),capture_output=True,text=True,timeout=90)
if p.returncode:raise Exception('Explicit staging runtime creation failed')
d=json.loads(p.stdout);assert d['projectId']==project
old=out/'candidate-deployment.json';(out/'candidate-incomplete-config.json').write_bytes(old.read_bytes())
result={'at':datetime.now(timezone.utc).isoformat(),'id':d['id'],'url':d['url'],'projectId':project,'readyState':d['readyState'],'previousDeploymentId':'dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ','customerProductionTouched':False,'scope':'Group/onboarding API validation only; core Supabase credentials in memory through approved Management API. No credential files read. Full provider/email/AI runtime configuration remains a release dependency.','explicitEnvironmentNames':sorted(env)}
old.write_text(json.dumps(result,indent=2));print(json.dumps({k:result[k] for k in ['at','id','url','readyState','scope']}),flush=True)
# Keep the first failed attempt and its cleanup as evidence.
archive=out/'hosted-attempt-1';archive.mkdir(exist_ok=False)
for p in out.glob('hosted*'):
 if p.is_file():p.rename(archive/p.name)
