from pathlib import Path
from datetime import datetime,timezone
import subprocess,json,os
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/experience-refinement-20261021';env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','EXPO_NO_DOTENV':'1','NEXT_TELEMETRY_DISABLED':'1'}
checks=[('regression',['npm','test'],r,600),('root-types',['npm','run','typecheck'],r,180),('mobile-types',['/usr/local/bin/node',str(r/'apps/mobile/node_modules/typescript/bin/tsc'),'--noEmit'],r/'apps/mobile',180),('lint',['npm','run','lint'],r,300),('web-build',['npm','run','build'],r,600)]
results=[]
def save(stage):
 d={'at':datetime.now(timezone.utc).isoformat(),'pid':os.getpid(),'stage':stage,'checks':results};(out/'verification-status.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d),flush=True)
for name,cmd,cwd,timeout in checks:
 save('running-'+name)
 with (out/(name+'.log')).open('w') as log:
  try:p=subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=timeout);code=p.returncode
  except subprocess.TimeoutExpired:code=124
 results.append({'name':name,'exitCode':code,'passed':code==0,'log':name+'.log'})
save('finished-pass' if all(x['passed'] for x in results) else 'finished-failed')
