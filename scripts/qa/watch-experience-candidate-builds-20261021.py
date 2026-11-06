from pathlib import Path
from datetime import datetime,timezone
import subprocess,json,time,os,shlex
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/experience-refinement-20261021'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
m='/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/experience-mobile'
env=os.environ.copy();env['EXPO_NO_DOTENV']='1';env['CI']='1';env.pop('EAS_BUILD_PROFILE',None)
stamp=lambda:datetime.now(timezone.utc).isoformat()
state={'startedAt':stamp(),'pid':os.getpid(),'stage':'checking','automaticStoreUpload':False}
def save():
 state['checkedAt']=stamp();(o/'build-watch-status.json').write_text(json.dumps(state,indent=2)+'\n')
save();inspected=set()
try:
 for tick in range(120):
  p=subprocess.run(['python3',str(r/'scripts/qa/inspect-experience-candidate-builds-20261021.py')],cwd=r,capture_output=True,text=True,timeout=100)
  if p.returncode:state.update(stage='status_read_failed_will_retry');save();time.sleep(30);continue
  jobs=json.loads((o/'build-status.json').read_text())['builds'];state.update(stage='waiting_for_builds',builds=jobs);save()
  completed={x['id'] for x in jobs if x.get('status')=='FINISHED'}
  if completed-inspected:
   cmd=shlex.join(['env','EAS_BUILD_PROFILE=apple-beta','python3',str(r/'scripts/qa/inspect-experience-candidate-artifacts-20261021.py')])
   q=subprocess.run(cli+['env:exec','preview',cmd,'--non-interactive'],cwd=m,env=env,capture_output=True,text=True,timeout=600)
   if q.returncode:state.update(stage='artifact_inspection_failed',inspectionExitCode=q.returncode);save();break
   report=json.loads((o/'artifact-inspection.json').read_text())
   inspected.update(x['id'] for x in report['builds'] if 'embeddingChecks' in x)
   state['inspectedBuilds']=list(inspected);save()
  if all(x.get('status') in ['FINISHED','ERRORED','CANCELED'] for x in jobs):
   state.update(stage='archives_inspected' if completed.issubset(inspected) else 'artifact_inspection_incomplete',finishedAt=stamp());save();break
  time.sleep(30)
 else:state.update(stage='watch_deadline_reached',finishedAt=stamp());save()
except Exception as e:
 state.update(stage='watch_stopped_with_error',errorType=type(e).__name__,finishedAt=stamp());save()
print(json.dumps(state),flush=True)
