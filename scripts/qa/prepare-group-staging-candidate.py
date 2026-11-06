from pathlib import Path,PurePosixPath
import subprocess,json,hashlib,base64,shutil
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test')
baseline=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021/membership-source')
out=r/'docs/checkpoints/expense-groups-20261021'
snapshot=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/backend')
assert not snapshot.exists(),'Use a new candidate directory'
snapshot.mkdir(parents=True)
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
team='team_RWL45V0YAuHJ7DvygUtJNB8o'
def api(path):
 p=subprocess.run(cli+[path+('&' if '?' in path else '?')+'teamId='+team],capture_output=True,text=True,timeout=45)
 if p.returncode:raise Exception('Vercel source inspection failed')
 return json.loads(p.stdout)
tree=api('/v6/deployments/dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ/files')
files=[]
def walk(nodes,prefix=''):
 for item in nodes:
  path=prefix+item['name']
  if item['type']=='directory':walk(item.get('children',[]),path+'/')
  elif item['type']=='file':files.append({'path':path,'sha':item['uid']})
  else:raise Exception('Unexpected source node')
walk(next(n['children'] for n in tree if n['name']=='src'))
# Do not read or redistribute secret files even if a prior deployment included one.
for row in files:
 p=PurePosixPath(row['path'])
 assert not p.is_absolute() and '..' not in p.parts
 assert not any(part.startswith('.env') or part in ['node_modules','.git','hosted-qa-settings.json','cloud-load-sessions.json','credentials.json'] for part in p.parts), 'Disallowed source path'
 assert p.suffix not in ['.p12','.pem','.key','.mobileprovision'],'Disallowed signing file'
changed=[v for v in json.loads((r/'docs/checkpoints/provider-ux-20261021/changed-files.json').read_text()) if v.startswith('src/')]
changed+=['src/app/api/mobile/v1/onboarding/route.ts','src/app/api/mobile/v1/expense-groups/route.ts']
changed=sorted(set(changed))
filemap={v['path']:v for v in files};manifest=[];deployfiles=[]
for rel in sorted(set(filemap)|set(changed)):
 source=r/rel if rel in changed else baseline/rel
 assert source.is_file(),'Baseline file missing: '+rel
 data=source.read_bytes()
 if rel not in changed:assert hashlib.sha1(data).hexdigest()==filemap[rel]['sha'],'Baseline mismatch: '+rel
 destination=snapshot/rel;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
 sha=hashlib.sha1(data).hexdigest()
 manifest.append({'path':rel,'sha1':sha,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'changed':rel in changed})
 deployfiles.append({'file':rel,'data':base64.b64encode(data).decode(),'encoding':'base64'} if rel in changed else {'file':rel,'sha':sha,'size':len(data)})
(out/'candidate-source-manifest.json').write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'basedOn':'dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ','snapshot':str(snapshot),'changed':changed,'files':manifest},indent=2))
# Source only; no environment or credentials in this payload.
payload={'name':'rezlee-performance-staging','project':'prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS','deploymentId':'dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ','target':'production','autoAssignCustomDomains':False,'alias':[],'files':deployfiles,'meta':{'rezleeCandidate':'launch-groups-20261021','rezleeSource':'isolated-reviewed-overlay'}}
(out/'candidate-deployment-source.json').write_text(json.dumps(payload))
print(json.dumps({'candidate':str(snapshot),'sourceFiles':len(files),'changed':changed,'bodyBytes':len(json.dumps(payload))}))
