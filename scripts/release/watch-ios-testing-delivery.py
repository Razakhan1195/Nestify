from pathlib import Path
from datetime import datetime,timezone
import os,subprocess,json,time
cwd=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/referral-mobile');out=Path('/Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/release-config-20261021')
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run'];env=dict(os.environ,EXPO_NO_DOTENV='1');env.pop('EAS_BUILD_PROFILE',None)
for attempt in range(30):
 state={'at':datetime.now(timezone.utc).isoformat(),'pid':os.getpid(),'submissionId':'220cfd84-90a9-4118-b8ab-2fce7e0ef922','buildNumber':64,'attempt':attempt}
 p=subprocess.run(cli+['submit:view',state['submissionId'],'--json'],cwd=cwd,env=env,capture_output=True,text=True,timeout=45)
 if not p.returncode:
  d=json.loads(p.stdout);state['submissionStatus']=d.get('status');state['submittedBuildId']=d.get('submittedBuild',{}).get('id')
  if d.get('status') in ['ERRORED','CANCELED']:state['error']=d.get('error',{}).get('message','Submission failed')
 else:state['submissionStatus']='status_lookup_failed'
 p=subprocess.run(cli+['submit:status','--platform','ios','--profile','beta','--json','--non-interactive'],cwd=cwd,env=env,capture_output=True,text=True,timeout=45)
 if not p.returncode:
  d=json.loads(p.stdout);matches=[b for b in d.get('ios',{}).get('testFlightBuilds',[]) if b.get('buildNumber')=='64'];state['testFlightBuild']=matches[0] if matches else None
 (out/'ios-testing-delivery-status.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state),flush=True)
 if (state.get('testFlightBuild') or {}).get('internalState')=='IN_BETA_TESTING' or state.get('error'):break
 time.sleep(30)
print('iOS delivery watcher finished',flush=True)
