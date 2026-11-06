from pathlib import Path
import os,json,subprocess,urllib.request,datetime,shutil
os.umask(0o077)
R=Path('/Users/razakhan/Documents/rezlee-mobile-test')
K=Path('/Users/razakhan/Library/Application Support/Rezlee')
O=K/'performance-causal-20261021'
run_name=os.environ.get('REZLEE_CONNECTION_RUN','connection-probe')
assert run_name in ('connection-probe','connection-probe-alias')
out=O/run_name
dest=R/'docs/checkpoints/performance-causal-20261021/connection-observation'/run_name
assert not out.exists()
out.mkdir(mode=0o700);dest.mkdir(parents=True,exist_ok=True)
env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','REZLEE_QA_OUTPUT':str(out),'REZLEE_QA_USERS':'1','REZLEE_STAGING_QA_SETTINGS':str(K/'overnight-20261019/hosted-qa-settings.json'),'REZLEE_CONNECTION_CANDIDATE':str(O/'connection-deployment-candidate.json')}
owned=False;probe_code=None;cleanup_code=None
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def status(stage,**kw):
 d={'at':stamp(),'controllerPid':os.getpid(),'stage':stage,**kw}
 (out/'status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d),flush=True)
def run(script,log_name,timeout=360):
 with (out/log_name).open('w') as log:
  p=subprocess.Popen(['/usr/local/bin/node','scripts/qa/'+script],cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT)
  status(script,childPid=p.pid)
  try:return p.wait(timeout=timeout)
  except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=20);raise
try:
 subprocess.run(['/usr/local/bin/node','--check','scripts/qa/performance-connection-observation.mjs'],cwd=R,check=True,capture_output=True)
 candidate=json.loads((O/'connection-deployment-candidate.json').read_text());assert candidate['exitCode']==0 and len(candidate['urls'])==1
 vt=json.loads((Path.home()/'Library/Application Support/com.vercel.cli/auth.json').read_text())['token']
 req=urllib.request.Request('https://api.vercel.com/v13/deployments/'+candidate['urls'][0].split('://')[1]+'?teamId=team_RWL45V0YAuHJ7DvygUtJNB8o',headers={'Authorization':'Bearer '+vt})
 with urllib.request.urlopen(req,timeout=25) as res:deployment=json.load(res)
 assert deployment['projectId']=='prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS' and deployment['readyState']=='READY'
 if os.environ.get('REZLEE_CONNECTION_ORIGIN'):
  assert os.environ['REZLEE_CONNECTION_ORIGIN']=='https://rezlee-performance-staging.vercel.app'
  req=urllib.request.Request('https://api.vercel.com/v4/aliases/rezlee-performance-staging.vercel.app?teamId=team_RWL45V0YAuHJ7DvygUtJNB8o',headers={'Authorization':'Bearer '+vt})
  with urllib.request.urlopen(req,timeout=25) as res:alias=json.load(res)
  assert alias['deploymentId']==deployment['id'] and alias['projectId']==deployment['projectId']
 assert set(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED']).issubset(set(deployment['env']))
 (out/'deployment.json').write_text(json.dumps({'at':stamp(),'id':deployment['id'],'projectId':deployment['projectId'],'url':candidate['urls'][0],'target':deployment.get('target')},indent=2))
 token=subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
 def sql(query,read_only=True):
  req=urllib.request.Request('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps({'query':query,'read_only':read_only}).encode())
  with urllib.request.urlopen(req,timeout=25) as res:return json.load(res)
 previous=sql("select c from pg_roles r cross join lateral unnest(r.rolconfig) c where r.rolname='authenticator' and c like 'pgrst.server_timing_enabled=%'")
 assert not previous,'Another timing owner is active'
 if run('prepare-cloud-load-staging.mjs','preparation.log')!=0:raise RuntimeError('Preparation failed')
 owned=True
 sql("alter role authenticator set pgrst.server_timing_enabled='true'; notify pgrst,'reload config';",False)
 probe_code=run('performance-connection-observation.mjs','probe.log')
except Exception as e:status('failed',error=type(e).__name__,detail=str(e)[:160])
finally:
 if owned:
  try:
   sql("alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload config';",False)
   (out/'timing-restored.json').write_text(json.dumps({'at':stamp(),'restored':True}))
  except Exception as e:status('restore-failed',error=type(e).__name__)
 if (out/'cloud-load-fixtures.json').exists():
  cleanup_code=run('cleanup-overnight-load.mjs','cleanup.log')
  if cleanup_code==0:(out/'cloud-load-sessions.json').unlink(missing_ok=True)
 for n in ['summary.json','deployment.json','load-cleanup-report.json','timing-restored.json']:
  if (out/n).exists():shutil.copy2(out/n,dest/n)
 status('complete',probeExitCode=probe_code,cleanupExitCode=cleanup_code,tokensRemoved=not (out/'cloud-load-sessions.json').exists())
 shutil.copy2(out/'status.json',dest/'status.json')
