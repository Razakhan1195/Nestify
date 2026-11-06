from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,os,time
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/release-config-20261021';root=out/'load-acceptance';runs=[];deadline=time.monotonic()+3600
while time.monotonic()<deadline:
 s=json.loads((root/'status.json').read_text())
 if s['stage'].startswith('finished') or s['stage']=='cleaning-fixtures':break
 report=root/'soak-load-report.json';elapsed=json.loads(report.read_text()).get('elapsedSeconds',0) if report.exists() else 0
 if s['stage']=='running-30-minute-soak' and (len(runs)==0 or len(runs)==1 and elapsed>=900):
  target=out/('concurrent-functional-'+str(len(runs)+1));target.mkdir(exist_ok=False)
  with (target/'controller.log').open('w') as log:
   result=subprocess.run(['/usr/local/bin/node','scripts/qa/verify-release-hosted-20261021.mjs'],cwd=r,env=dict(os.environ,REZLEE_RELEASE_HOSTED_OUTPUT=str(target)),stdout=log,stderr=subprocess.STDOUT,timeout=180)
  entry={'at':datetime.now(timezone.utc).isoformat(),'run':len(runs)+1,'soakElapsedAtStart':elapsed,'exitCode':result.returncode,'summary':str(target/'hosted-summary.json')};runs.append(entry)
  (out/'concurrent-functional-summary.json').write_text(json.dumps({'runs':runs,'allPassed':all(x['exitCode']==0 for x in runs)},indent=2)+'\n');print(json.dumps(entry),flush=True)
 time.sleep(20)
print('Functional watcher complete',flush=True)
