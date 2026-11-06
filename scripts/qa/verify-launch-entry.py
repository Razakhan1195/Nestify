import pathlib,subprocess,json,os,time,datetime
r=pathlib.Path('/Users/razakhan/Documents/rezlee-mobile-test')
o=r/'docs/checkpoints/native-entry-20261021'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def status(stage,**extra):
 d={'at':now(),'pid':os.getpid(),'stage':stage,**extra};(o/'required-gates-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d),flush=True)
status('waiting-for-idle-diagnostic')
deadline=time.monotonic()+300
while not (r/'docs/checkpoints/performance-entry-journey-20261021/cleanup.json').exists():
 if time.monotonic()>deadline: status('blocked',reason='Idle diagnostic not complete; no verification load started');raise SystemExit(1)
 time.sleep(5)
d=json.loads((r/'docs/checkpoints/performance-entry-journey-20261021/cleanup.json').read_text())
if not d.get('verifiedAbsent'):status('blocked',reason='Fixture cleanup unverified');raise SystemExit(1)
env={**os.environ,'PATH':'/usr/local/bin:/opt/homebrew/bin:'+os.environ.get('PATH',''),'EXPO_NO_DOTENV':'1','NEXT_TELEMETRY_DISABLED':'1'}
checks=[]
commands=[('entry-journeys',['/usr/local/bin/node','scripts/qa/verify-entry-journey.cjs'],r),('regression',['/usr/local/bin/npm','test'],r),('root-types',['/usr/local/bin/npm','run','typecheck'],r),('mobile-types',['/usr/local/bin/npm','run','typecheck'],r/'apps/mobile'),('lint',['/usr/local/bin/npm','run','lint'],r),('web-build',['/usr/local/bin/npm','run','build'],r)]
for name,command,cwd in commands:
 status(name)
 start=time.monotonic()
 with (o/('required-'+name+'.log')).open('w') as log:
  p=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 checks.append({'name':name,'exitCode':p.returncode,'seconds':round(time.monotonic()-start,1)})
 (o/'required-gates.json').write_text(json.dumps({'at':now(),'checks':checks},indent=2))
 if p.returncode:
  status('failed',check=name,exitCode=p.returncode);raise SystemExit(1)
status('finished',checks=checks)
