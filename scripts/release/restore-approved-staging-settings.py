from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,base64,re,sys
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
source=Path('/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/hosted-qa-settings.json')
local=r/'.env.mobile-staging.local'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
def api(path,body=None):
 cmd=cli+[path+('&' if '?' in path else '?')+'teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=90)
 if p.returncode:raise RuntimeError('Vercel request failed; response withheld')
 return json.loads(p.stdout)
# Explicit user approval granted Oct21 for these two staging configuration files only.
raw=json.loads(source.read_text());assert isinstance(raw,dict)
assert raw.get('NEXT_PUBLIC_SUPABASE_URL')=='https://gjwvalpxnfbvryosmcbj.supabase.co','Source does not identify staging'
for name,role in [('NEXT_PUBLIC_SUPABASE_ANON_KEY','anon'),('SUPABASE_SECRET_KEY','service_role')]:
 value=raw.get(name,'')
 if value.startswith(('sb_publishable_','sb_secret_')):continue
 claims=json.loads(base64.urlsafe_b64decode(value.split('.')[1]+'==='))
 assert claims.get('ref')=='gjwvalpxnfbvryosmcbj' and claims.get('role')==role,'Staging credential mismatch'
mobile=local.read_text()
match=re.search(r'(?m)^EXPO_PUBLIC_SUPABASE_URL\s*=\s*[\"\x27]?([^\s\"\x27]+)',mobile)
assert match and match.group(1)=='https://gjwvalpxnfbvryosmcbj.supabase.co','Mobile source does not identify staging'
metadata=api('/v10/projects/'+project+'/env').get('envs',[])
saved={x['key'] for x in metadata if 'preview' in x.get('target',[]) and not x.get('gitBranch')}
contract=json.loads(subprocess.run(['/usr/local/bin/node','-e',"console.log(JSON.stringify(require('./scripts/release/verify-staging-runtime.cjs').requiredNames))"],cwd=r,capture_output=True,text=True,check=True).stdout)
wanted=set(contract)-saved
if raw.get('REZLEE_GMAIL_ENABLED')=='true':wanted.update(k for k in ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','REZLEE_GMAIL_ENCRYPTION_KEY'] if k not in saved)
available={k:raw[k] for k in wanted if isinstance(raw.get(k),str) and raw[k].strip()}
missing=sorted(wanted-set(available))
state={'at':datetime.now(timezone.utc).isoformat(),'source':'User-authorized existing staging configuration','sourceDatabaseVerified':True,'mobileSourceDatabaseVerified':True,'target':'preview','projectId':project,'restorableNames':sorted(available),'remainingNames':missing,'valuesDisplayed':False,'productionTargetsModified':False,'writtenNames':[]}
if '--apply' in sys.argv:
 for name,value in sorted(available.items()):
  sensitive=any(x in name for x in ['SECRET','API_KEY','WEBHOOK_AUTH','ENCRYPTION_KEY'])
  result=api('/v10/projects/'+project+'/env',{'key':name,'value':value,'type':'sensitive' if sensitive else 'plain','target':['preview'],'comment':'Restored from existing approved staging source; user authorized 2026-10-21'})
  state['writtenNames'].append(name)
  (o/'secure-staging-restoration.json').write_text(json.dumps(state,indent=2)+'\n')
state['at']=datetime.now(timezone.utc).isoformat()
(o/'secure-staging-restoration.json').write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps(state,indent=2))
