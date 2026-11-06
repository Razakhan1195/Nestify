from pathlib import Path
import os,json,subprocess,datetime,urllib.request,shutil
os.umask(0o077)
repo=Path('/Users/razakhan/Documents/rezlee-mobile-test');root=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021/cache-setting-retry');root.mkdir(parents=True,exist_ok=True)
fixture=root/'fixtures';fixture.mkdir(exist_ok=True)
env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','REZLEE_QA_OUTPUT':str(fixture),'REZLEE_QA_USERS':'25','REZLEE_STAGING_QA_SETTINGS':'/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/hosted-qa-settings.json','REZLEE_LOAD_SESSIONS':str(fixture/'cloud-load-sessions.json')}
def status(stage,**kw):
 d={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pid':os.getpid(),'stage':stage,**kw};(root/'status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d),flush=True)
def run(args,name,seconds,runenv):
 with open(root/(name+'.log'),'w') as log:
  p=subprocess.Popen(args,cwd=repo,env=runenv,stdout=log,stderr=subprocess.STDOUT)
  status(name,childPid=p.pid)
  try:return p.wait(timeout=seconds)
  except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=20);return 124
code=None;cleanup=None
try:
 if run(['/usr/local/bin/node','scripts/qa/prepare-cloud-load-staging.mjs'],'preparing-25',300,env):raise RuntimeError('Preparation failed')
 code=run(['/usr/local/bin/node','scripts/qa/performance-cache-setting-staging.mjs'],'configuration-diagnostic',240,{**env,'REZLEE_QA_OUTPUT':str(root)})
finally:
 if (root/'settings-owned.json').exists() and not (root/'settings-restored.json').exists():
  token=subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
  q={'query':"alter role authenticator reset pgrst.jwt_cache_max_entries; alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload config';",'read_only':False}
  req=urllib.request.Request('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(q).encode())
  try:
   with urllib.request.urlopen(req,timeout=25) as res:res.read()
   (root/'settings-restored.json').write_text(json.dumps({'restored':True,'recovery':True}))
  except Exception as e:status('restore-error',error=type(e).__name__)
 if (fixture/'cloud-load-fixtures.json').exists():
  cleanup=run(['/usr/local/bin/node','scripts/qa/cleanup-overnight-load.mjs'],'cleaning',300,env)
  if cleanup==0:(fixture/'cloud-load-sessions.json').unlink(missing_ok=True)
 dest=repo/'docs/checkpoints/performance-causal-20261021/cache-setting-retry';dest.mkdir(exist_ok=True)
 for p in [root/'summary.json',root/'settings-restored.json',fixture/'load-cleanup-report.json']:
  if p.exists():shutil.copy2(p,dest/p.name)
 status('complete',testExitCode=code,cleanupExitCode=cleanup,tokensRemoved=not (fixture/'cloud-load-sessions.json').exists())
 shutil.copy2(root/'status.json',dest/'status.json')
