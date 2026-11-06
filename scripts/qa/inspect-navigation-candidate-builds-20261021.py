from pathlib import Path
import subprocess,json,concurrent.futures
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/navigation-audit-20261021'
m=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/navigation-mobile')
jobs=json.loads((o/'build-submission.json').read_text())['builds']
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
def inspect(job):
 p=subprocess.run(cli+['build:view',job['id'],'--json'],cwd=m,capture_output=True,text=True,timeout=60)
 if p.returncode:return {'id':job['id'],'readError':True}
 data=json.loads(p.stdout)
 result={k:data.get(k) for k in ['id','platform','status','appVersion','appBuildVersion','createdAt','updatedAt','completedAt','gitCommitHash']}
 result['artifactAvailable']=bool(data.get('artifacts',{}).get('buildUrl'))
 result['errorCode']=data.get('error',{}).get('errorCode') if isinstance(data.get('error'),dict) else None
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(inspect,jobs))
result={'at':datetime.now(timezone.utc).isoformat(),'builds':results,'storeUploaded':False,'testerDelivery':'awaiting archive inspection and testing-store upload'}
(o/'build-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
