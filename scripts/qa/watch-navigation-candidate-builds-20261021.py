from pathlib import Path
from datetime import datetime,timezone
import subprocess,json,time,os,shlex
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/navigation-audit-20261021'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
m='/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/navigation-mobile'
os.environ['EXPO_NO_DOTENV']='1';os.environ['CI']='1'
stamp=lambda:datetime.now(timezone.utc).isoformat()
state={'startedAt':stamp(),'pid':os.getpid(),'purpose':'Monitor existing iOS65/Android54 and inspect completed archives; never submit stores','automaticStoreUpload':False,'stage':'checking'}
def save():
 state['checkedAt']=stamp();(o/'build-watch-status.json').write_text(json.dumps(state,indent=2)+'\n')
save()
try:
 last=None
 for tick in range(120):
  p=subprocess.run(['python3',str(r/'scripts/qa/inspect-navigation-candidate-builds-20261021.py')],cwd=r,capture_output=True,text=True,timeout=100)
  if p.returncode:
   state.update(stage='status_read_failed_will_retry',attempt=tick+1);save();time.sleep(30);continue
  report=json.loads((o/'build-status.json').read_text());jobs=report['builds']
  state.update(stage='waiting_for_builds',builds=jobs);save()
  now=tuple((x['id'],x.get('status')) for x in jobs)
  if now!=last:print(json.dumps({'at':stamp(),'builds':now}),flush=True);last=now
  if all(x.get('status') in ['FINISHED','ERRORED','CANCELED'] for x in jobs):
   state['stage']='inspecting_completed_archives';save()
   cmd=shlex.join(['env','EAS_BUILD_PROFILE=apple-beta','python3',str(r/'scripts/qa/inspect-navigation-candidate-artifacts-20261021.py')])
   q=subprocess.run(cli+['env:exec','preview',cmd,'--non-interactive'],cwd=m,capture_output=True,text=True,timeout=600)
   state.update(stage='archives_inspected' if q.returncode==0 else 'artifact_inspection_failed',inspectionExitCode=q.returncode,finishedAt=stamp(),rawToolOutputSuppressed=True)
   if (o/'artifact-inspection.json').exists():
    a=json.loads((o/'artifact-inspection.json').read_text())
    state['archiveResults']=[{'platform':x['platform'],'build':x['build'],'status':x['status'],'inspected':'embeddingChecks' in x,'checks':x.get('embeddingChecks',{})} for x in a['builds']]
   save();print(json.dumps({'at':stamp(),'stage':state['stage'],'inspectionExitCode':q.returncode}),flush=True);break
  time.sleep(30)
 else:
  state.update(stage='watch_deadline_reached',finishedAt=stamp());save()
except Exception as error:
 state.update(stage='watch_stopped_with_error',errorType=type(error).__name__,finishedAt=stamp());save();raise SystemExit('Build monitor stopped; sanitized status saved.')
