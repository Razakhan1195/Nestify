from pathlib import Path
import os,json,subprocess,datetime,urllib.request,shutil
os.umask(0o077)
repo=Path('/Users/razakhan/Documents/rezlee-mobile-test')
root=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021')
root.mkdir(parents=True,exist_ok=True)
fixtures=root/'fixtures';fixtures.mkdir(exist_ok=True)
checkpoint=repo/'docs/checkpoints/performance-causal-20261021';checkpoint.mkdir(parents=True,exist_ok=True)
settings=Path('/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/hosted-qa-settings.json')
env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','REZLEE_QA_OUTPUT':str(fixtures),'REZLEE_STAGING_QA_SETTINGS':str(settings),'REZLEE_LOAD_SESSIONS':str(fixtures/'cloud-load-sessions.json')}
def status(stage,**kw):
 d={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'controllerPid':os.getpid(),'stage':stage,**kw}
 for base in [root,checkpoint]:(base/'status.json').write_text(json.dumps(d,indent=2))
 print(json.dumps(d),flush=True)
def api(route):
 token=subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,timeout=15,check=True).stdout.strip()
 q=urllib.request.Request('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/'+route,headers={'Authorization':'Bearer '+token})
 with urllib.request.urlopen(q,timeout=30) as res:return json.load(res)
testCode=None
try:
 cfg=api('postgrest');addons=api('billing/addons')
 if cfg.get('db_pool')!=5 or not any(x['type']=='compute_instance' and x['variant']['id']=='ci_small' for x in addons['selected_addons']):raise RuntimeError('Configuration mismatch')
 (checkpoint/'configuration.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'compute':'Small 2GB','db_pool':5,'db_pool_acquisition_timeout':cfg.get('db_pool_acquisition_timeout'),'target':'https://rezlee-performance-staging.vercel.app','jobs':'unchanged','productionTouched':False},indent=2))
 status('preparing-300-synthetic-fixtures')
 with open(root/'preparation.log','w') as log:
  p=subprocess.Popen(['/usr/local/bin/node','scripts/qa/prepare-cloud-load-staging.mjs'],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT)
  status('preparing-300-synthetic-fixtures',preparerPid=p.pid)
  try:code=p.wait(timeout=1800)
  except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=20);raise RuntimeError('Preparation deadline')
 if code or 'CLOUD_FIXTURES_READY 300' not in (root/'preparation.log').read_text():raise RuntimeError('Preparation failed')
 script=repo/'scripts/qa/performance-matched-staging.mjs'
 if not script.exists():raise RuntimeError('Diagnostic not prepared; cleaning safely')
 status('matched-diagnostic-running')
 with open(root/'matched.log','w') as log:
  p=subprocess.Popen(['/usr/local/bin/node',str(script)],cwd=repo,env={**env,'REZLEE_QA_OUTPUT':str(root)},stdout=log,stderr=subprocess.STDOUT)
  status('matched-diagnostic-running',testPid=p.pid)
  try:testCode=p.wait(timeout=1200)
  except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=20);raise RuntimeError('Diagnostic deadline')
except Exception as e:status('diagnostic-error',error=type(e).__name__,detail=str(e)[:180])
finally:
 status('cleaning-fixtures',testExitCode=testCode)
 cleanupCode=None
 if (fixtures/'cloud-load-fixtures.json').exists():
  with open(root/'cleanup.log','w') as log:
   p=subprocess.Popen(['/usr/local/bin/node','scripts/qa/cleanup-overnight-load.mjs'],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT)
   try:cleanupCode=p.wait(timeout=600)
   except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=20);cleanupCode=124
  if cleanupCode==0:(fixtures/'cloud-load-sessions.json').unlink(missing_ok=True)
  if (fixtures/'load-cleanup-report.json').exists():shutil.copy2(fixtures/'load-cleanup-report.json',checkpoint/'load-cleanup-report.json')
 for name in ['matched-summary.json','matched-harness-audit.json']:
  if (root/name).exists():shutil.copy2(root/name,checkpoint/name)
 status('complete',testExitCode=testCode,cleanupExitCode=cleanupCode,tokensRemoved=not (fixtures/'cloud-load-sessions.json').exists())
