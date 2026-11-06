from pathlib import Path
import os,signal,time,json,subprocess,datetime
root=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021')
repo=Path('/Users/razakhan/Documents/rezlee-mobile-test')
parent=51592;paused=False
def status(stage,**kw):
 d={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pid':os.getpid(),'stage':stage,**kw};(root/'post-diagnostic-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d),flush=True)
try:
 command=subprocess.run(['ps','-p',str(parent),'-o','args='],capture_output=True,text=True).stdout
 if 'performance-causal-controller.py' not in command:raise RuntimeError('Controller identity mismatch')
 # Hold only the cleanup supervisor. The measured child runs unchanged.
 os.kill(parent,signal.SIGSTOP);paused=True
 status('waiting-for-unchanged-four-phase-diagnostic',measuredChildPid=51836)
 deadline=time.monotonic()+720
 while time.monotonic()<deadline:
  p=root/'matched-summary.json'
  if p.exists() and json.loads(p.read_text()).get('complete') and (root/'timing-restored.json').exists():break
  alive=subprocess.run(['ps','-p','51836','-o','pid='],capture_output=True,text=True).stdout.strip()
  if not alive:raise RuntimeError('Measured child stopped before diagnostic completion')
  time.sleep(5)
 else:raise RuntimeError('Diagnostic wait deadline')
 script=repo/'scripts/qa/performance-wire-staging.mjs'
 if not script.exists():raise RuntimeError('Post-diagnostic script unavailable')
 env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','REZLEE_QA_OUTPUT':str(root),'REZLEE_LOAD_SESSIONS':str(root/'fixtures/cloud-load-sessions.json'),'REZLEE_STAGING_QA_SETTINGS':'/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/hosted-qa-settings.json'}
 status('post-diagnostic-running')
 with open(root/'wire.log','w') as log:
  p=subprocess.Popen(['/usr/local/bin/node',str(script)],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT)
  status('post-diagnostic-running',testPid=p.pid)
  try:code=p.wait(timeout=240)
  except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=20);raise RuntimeError('Post-diagnostic deadline')
 status('post-diagnostic-finished',exitCode=code)
except Exception as e:status('post-diagnostic-error',error=type(e).__name__,detail=str(e)[:160])
finally:
 if paused:os.kill(parent,signal.SIGCONT)
 status('cleanup-supervisor-resumed',controllerPid=parent)
