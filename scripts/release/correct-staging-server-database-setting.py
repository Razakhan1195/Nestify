from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,base64
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
source=Path('/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/hosted-qa-settings.json')
raw=json.loads(source.read_text())
assert raw['NEXT_PUBLIC_SUPABASE_URL']=='https://gjwvalpxnfbvryosmcbj.supabase.co'
key=raw['SUPABASE_SECRET_KEY']
if not key.startswith('sb_secret_'):
 claims=json.loads(base64.urlsafe_b64decode(key.split('.')[1]+'==='))
 assert claims['ref']=='gjwvalpxnfbvryosmcbj' and claims['role']=='service_role'
import urllib.request
try:
 with urllib.request.urlopen(urllib.request.Request(raw['NEXT_PUBLIC_SUPABASE_URL']+'/auth/v1/settings',headers={'apikey':key}),timeout=10) as response:
  assert response.status==200
except Exception:
 raise RuntimeError('Approved source server key failed staging verification; no changes made') from None
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
def api(path,body=None):
 cmd=cli+[path+'?teamId='+team]
 if body is not None:cmd+=['--method','PATCH','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=60)
 assert p.returncode==0,'Vercel update failed; response suppressed'
 return json.loads(p.stdout)
envs=api('/v10/projects/'+project+'/env')['envs']
changed=[]
for name in ['SUPABASE_SECRET_KEY']:
 rows=[x for x in envs if x['key']==name and x.get('target')==['preview'] and not x.get('gitBranch')]
 assert len(rows)==1,'Require an existing Preview-only entry'
 api('/v9/projects/'+project+'/env/'+rows[0]['id'],{'value':raw[name],'target':['preview'],'type':'sensitive','comment':'Corrected to verified existing staging source after fail-closed release guard rejected mismatched public database settings.'})
 changed.append(name)
report={'at':datetime.now(timezone.utc).isoformat(),'changedNames':changed,'sourceDatabaseVerified':True,'target':'preview','productionChanged':False,'failedDeploymentPreserved':'dpl_4Z6Na2WudCHVQTbfWkbzcFsZd3ch','secretValuesDisplayed':False}
(o/'server-database-config-correction.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
