#!/usr/bin/python3
"""Local fallback trigger only. No backup contents or credentials written to logs."""
from pathlib import Path
import datetime, json, os, subprocess, urllib.request, urllib.error, fcntl
os.umask(0o077)
ROOT=Path('/Users/razakhan/Library/Application Support/Rezlee')
STATE=ROOT/'backup-watchdog-status.json'
lock=open(ROOT/'backup-watchdog.lock','w')
try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError: raise SystemExit(0)
now=datetime.datetime.now(datetime.timezone.utc)
result={'checkedAt':now.isoformat(),'trigger':'macOS launchd fallback','productionWrites':0}
try:
 c=subprocess.run(['/usr/bin/git','credential','fill'],input='protocol=https\nhost=github.com\n\n',cwd=ROOT,text=True,capture_output=True,check=True,timeout=20,env={**os.environ,'GIT_TERMINAL_PROMPT':'0'})
 credentials=dict(line.split('=',1) for line in c.stdout.splitlines() if '=' in line)
 def gh(route,method='GET',data=None):
  req=urllib.request.Request('https://api.github.com/repos/Razakhan1195/rezlee-recovery/'+route,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Authorization':'Bearer '+credentials['password'],'Accept':'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RezleeBackupWatchdog'})
  with urllib.request.urlopen(req,timeout=30) as response: return json.loads(response.read() or b'{}')
 artifacts=gh('actions/artifacts?per_page=100')['artifacts']
 valid=[a for a in artifacts if a['name'].startswith('rezlee-recovery-') and not a['expired'] and a['size_in_bytes']>0]
 latest=max(valid,key=lambda a:a['created_at']) if valid else None
 age=(now-datetime.datetime.fromisoformat(latest['created_at'].replace('Z','+00:00'))).total_seconds()/3600 if latest else None
 if age is not None and age < -0.0834: raise RuntimeError('Backup timestamp is unexpectedly in the future')
 result.update({'latestArtifactId':latest['id'] if latest else None,'ageHours':round(age,2) if age is not None else None})
 if age is not None and age<20:
  result['action']='fresh_backup_no_dispatch'
 else:
  recent=gh('actions/workflows/backup.yml/runs?per_page=10')['workflow_runs']
  if any(r['status'] in ['queued','in_progress','waiting','requested','pending'] for r in recent): result['action']='backup_already_running'
  else:
   gh('actions/workflows/backup.yml/dispatches','POST',{'ref':'main','inputs':{'respect_freshness':True}})
   result['action']='backup_dispatched'
 result['ok']=True
except Exception as error:
 result.update({'ok':False,'errorType':type(error).__name__})
 if isinstance(error, subprocess.CalledProcessError):
  result['credentialDiagnostics']={'exit':error.returncode,'home':os.environ.get('HOME'),'hints':[hint for hint in ['terminal prompts disabled','could not read Username','could not read Password','not found','User interaction is not allowed'] if hint in (error.stderr or '')]}
STATE.write_text(json.dumps(result,indent=2))
print(json.dumps(result))
raise SystemExit(0 if result['ok'] else 1)
