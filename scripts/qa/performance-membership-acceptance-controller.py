from pathlib import Path
import os,json,time,subprocess,datetime,urllib.request,threading,shutil,base64,hashlib
os.umask(0o077)
repo=Path('/Users/razakhan/Documents/rezlee-mobile-test')
parent=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021')
run_name=os.environ.get('REZLEE_PERFORMANCE_RUN','acceptance-after-idle-retry')
if run_name not in ('acceptance-after-idle-retry','acceptance-repeat','capacity-bounded'):raise RuntimeError('Unrecognized isolated run directory')
out=parent/run_name;fixtures=out/'fixtures';dest=repo/'docs/checkpoints/performance-causal-20261021'/run_name;dest.mkdir(parents=True,exist_ok=True)
env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','REZLEE_QA_OUTPUT':str(out),'REZLEE_STAGING_QA_SETTINGS':'/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/hosted-qa-settings.json','REZLEE_LOAD_SESSIONS':str(fixtures/'cloud-load-sessions.json')}
monitor=None;mixed=None;owned=False;testCode=None;cleanupCode=None;load_done=threading.Event();functional_rows=[]
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def status(stage,**kw):
 d={'at':stamp(),'controllerPid':os.getpid(),'stage':stage,**kw}
 (out/'status.json').write_text(json.dumps(d,indent=2));(dest/'status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d),flush=True)
token=subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
def api(route,data=None):
 req=urllib.request.Request('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/'+route,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(data).encode() if data is not None else None)
 with urllib.request.urlopen(req,timeout=30) as res:return json.load(res)
def sql(q,read_only=True):return api('database/query',{'query':q,'read_only':read_only})
def functionals():
 if load_done.wait(90):return
 base=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-cold-20261020/qa')
 suites=[('shared-expenses','/tmp/rezlee-shared-hosted-results.json'),('care-household','/tmp/rezlee-care-hosted-results.json'),('capture-files',None),('inventory-recovery',None),('storage-recovery','/tmp/rezlee-storage-recovery-results.json')]
 for name,tmp in suites:
  if load_done.is_set():break
  folder=out/('mixed-'+name);folder.mkdir(exist_ok=True);began=time.time()
  try:
   with (folder/'run.log').open('w') as log:p=subprocess.run(['/usr/local/bin/node',str(base/(name+'.mjs'))],cwd=repo,env={**env,'REZLEE_QA_OUTPUT':str(folder)},stdout=log,stderr=subprocess.STDOUT,timeout=600)
   report=Path(tmp) if tmp else folder/'hosted-results.json'
   if not report.exists() or report.stat().st_mtime<began:raise RuntimeError('Missing fresh report')
   d=json.loads(report.read_text())
   if tmp:shutil.copy2(report,folder/'hosted-results.json')
   row={'suite':name,'startedAt':datetime.datetime.fromtimestamp(began,datetime.timezone.utc).isoformat(),'completedAt':stamp(),'exitCode':p.returncode,'checks':len(d.get('checks',[])),'failure':bool(d.get('failure')),'fixturesCleaned':d.get('fixturesCleaned')}
  except Exception as e:row={'suite':name,'failure':True,'error':type(e).__name__}
  functional_rows.append(row);(out/'mixed-soak-hosted-summary.json').write_text(json.dumps(functional_rows,indent=2));print('FUNCTIONAL',json.dumps(row),flush=True)
  if row.get('exitCode') or row.get('failure'):break
try:
 status('waiting-for-fixture-preparation')
 deadline=time.monotonic()+1800
 while time.monotonic()<deadline:
  prep=json.loads((out/'preparation-status.json').read_text())
  if prep.get('stage')=='preparation-complete':
   if prep.get('exitCode')!=0:raise RuntimeError('Preparation failed')
   break
  status('preparing-300-fixtures',preparerPid=prep.get('preparerPid'))
  time.sleep(30)
 else:raise RuntimeError('Preparation timed out')
 deployment=json.loads((parent/'membership-deployment.json').read_text());assert deployment['projectId']=='prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS'
 vt=json.loads((Path.home()/'Library/Application Support/com.vercel.cli/auth.json').read_text())['token']
 req=urllib.request.Request('https://api.vercel.com/v4/aliases/rezlee-performance-staging.vercel.app?teamId=team_RWL45V0YAuHJ7DvygUtJNB8o',headers={'Authorization':'Bearer '+vt})
 with urllib.request.urlopen(req,timeout=25) as res:alias=json.load(res)
 if alias.get('deploymentId')!=deployment['id'] or alias.get('projectId')!=deployment['projectId']:raise RuntimeError('Isolated staging alias changed')
 cfg=api('postgrest');addons=api('billing/addons')
 if cfg.get('db_pool')!=5 or not any(x['type']=='compute_instance' and x['variant']['id']=='ci_small' for x in addons['selected_addons']):raise RuntimeError('Unexpected infrastructure')
 actual=sql("select pg_get_functiondef('public.rezlee_activate_member(uuid)'::regprocedure) as definition")[0]['definition'].strip()
 migration=(repo/'supabase/migrations/202610210001_membership_repeat_activation.sql').read_text();expected=migration[migration.index('CREATE OR REPLACE'):].strip()
 if actual!=expected:raise RuntimeError('Membership migration differs from reviewed code')
 sessions=json.loads((fixtures/'cloud-load-sessions.json').read_text());users=sessions['users']
 claims=[json.loads(base64.urlsafe_b64decode(u['token'].split('.')[1]+'==')) for u in users]
 if len(users)!=300 or len(set(u['id'] for u in users))!=300 or len(set(u['token'] for u in users))!=300 or len(set(c['session_id'] for c in claims))!=300:raise RuntimeError('Distinct session guard')
 for u,c in zip(users,claims):
  if c.get('iss')!='https://gjwvalpxnfbvryosmcbj.supabase.co/auth/v1' or c.get('sub')!=u['id'] or c.get('user_metadata',{}).get('qa_run')!=sessions['run']:raise RuntimeError('Staging synthetic identity mismatch')
 if min(c['exp'] for c in claims)-time.time()<43*60:raise RuntimeError('Insufficient token life before idle')
 previous=sql("select c from pg_roles r cross join lateral unnest(r.rolconfig) c where r.rolname='authenticator' and c like 'pgrst.server_timing_enabled=%'")
 if previous:raise RuntimeError('Another timing owner is active')
 (out/'timing-owned.json').write_text(json.dumps({'at':stamp(),'originallyUnset':True}));owned=True
 sql("alter role authenticator set pgrst.server_timing_enabled='true'; notify pgrst,'reload config';",False)
 status('readiness-12-requests-one-synthetic-account')
 ready=[]
 for route in ['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions']*2:
  t=time.monotonic();req=urllib.request.Request('https://rezlee-performance-staging.vercel.app/api/mobile/v1/'+route,headers={'Authorization':'Bearer '+users[0]['token']})
  with urllib.request.urlopen(req,timeout=20) as res:d=json.load(res);code=res.status
  valid=code==200 and not d.get('error') and not d.get('needsOnboarding')
  if route.startswith('home'):valid=valid and d.get('home',{}).get('id')==users[0]['home']
  if not valid:raise RuntimeError('Readiness payload invalid')
  ready.append({'route':route,'status':code,'ms':round((time.monotonic()-t)*1000)})
 idle_until=time.time()+600
 config={'at':stamp(),'deployment':deployment,'compute':'Small 2GB','pool':5,'poolAcquisitionTimeout':cfg.get('db_pool_acquisition_timeout'),'sessions':300,'distinctTokens':300,'sessionRefreshDuringMeasurement':False,'fixtureCounts':{'bills':12,'documents':8,'tasks':6},'readiness':ready,'idleSeconds':600,'idleUntilEpoch':idle_until,'ordinaryJobs':'unchanged','isolatedProjectCronCount':0,'monitoring':'metrics-only; no SQL sampling during load','migrationSha256':hashlib.sha256(actual.encode()).hexdigest(),'interpretation':'Two membership corrections; six-route reads unchanged. This tests current acceptance, not proof that the prior six-route spike is explained.'}
 (out/'configuration.json').write_text(json.dumps(config,indent=2))
 while time.time()<idle_until:
  status('idle-observation',idleUntilEpoch=idle_until,remainingSeconds=max(0,round(idle_until-time.time())))
  time.sleep(min(30,idle_until-time.time()))
 with (out/'metrics.log').open('w') as log:monitor=subprocess.Popen(['python3','scripts/qa/performance-metrics-staging.py','acceptance','2100'],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT)
 mixed=threading.Thread(target=functionals,daemon=True);mixed.start()
 with (out/'soak.log').open('w') as log:
  p=subprocess.Popen(['/usr/local/bin/node','scripts/qa/performance-membership-acceptance.mjs'],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT)
  deadline=time.monotonic()+1950
  while p.poll() is None and time.monotonic()<deadline:
   status('measuring-300-sessions',testPid=p.pid,targetRps=30,targetRequests=54000,targetMinutes=30)
   time.sleep(30)
  if p.poll() is None:p.terminate();p.wait(timeout=25);raise RuntimeError('Load deadline exceeded')
  testCode=p.returncode
 load_done.set()
 if mixed and mixed.is_alive():status('waiting-for-functional-cleanup',testExitCode=testCode);mixed.join(timeout=650)
except Exception as e:status('error',error=type(e).__name__,detail=str(e)[:180])
finally:
 load_done.set()
 if mixed and mixed.is_alive():mixed.join(timeout=650)
 if monitor:
  (out/'capacity-acceptance/stop').touch()
  try:monitor.wait(timeout=30)
  except subprocess.TimeoutExpired:monitor.terminate()
 if owned:
  try:
   sql("alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload config';",False)
   (out/'timing-restored.json').write_text(json.dumps({'at':stamp(),'restored':True}))
  except Exception as e:status('timing-restore-error',error=type(e).__name__)
 status('cleaning-fixtures',testExitCode=testCode)
 prep=json.loads((out/'preparation-status.json').read_text())
 if prep.get('stage')!='preparation-complete' and prep.get('preparerPid'):
  pid=prep['preparerPid'];comm=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
  if 'prepare-cloud-load-staging.mjs' in comm:
   import signal
   os.kill(pid,signal.SIGTERM);time.sleep(2)
 if (fixtures/'cloud-load-fixtures.json').exists():
  with (out/'cleanup.log').open('w') as log:cleanupCode=subprocess.run(['/usr/local/bin/node','scripts/qa/cleanup-overnight-load.mjs'],cwd=repo,env={**env,'REZLEE_QA_OUTPUT':str(fixtures)},stdout=log,stderr=subprocess.STDOUT,timeout=600).returncode
  if cleanupCode==0:(fixtures/'cloud-load-sessions.json').unlink(missing_ok=True)
 report=json.loads((out/'soak-load-report.json').read_text()) if (out/'soak-load-report.json').exists() else {}
 passed=bool(testCode==0 and report.get('pass') and len(functional_rows)==5 and all(x.get('exitCode')==0 and not x.get('failure') for x in functional_rows) and cleanupCode==0 and (out/'timing-restored.json').exists())
 for n in ['configuration.json','soak-load-report.json','mixed-soak-hosted-summary.json','timing-restored.json']:
  if (out/n).exists():shutil.copy2(out/n,dest/n)
 if (fixtures/'load-cleanup-report.json').exists():shutil.copy2(fixtures/'load-cleanup-report.json',dest/'load-cleanup-report.json')
 status('complete',testExitCode=testCode,passed=passed,cleanupExitCode=cleanupCode,tokensRemoved=not (fixtures/'cloud-load-sessions.json').exists())
