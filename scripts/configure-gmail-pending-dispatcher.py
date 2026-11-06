"""Staging-only pending-import recovery. Secrets never printed or committed."""
from pathlib import Path
import json,subprocess,tempfile,os,sys
root=Path(__file__).resolve().parents[1]
if '--apply' not in sys.argv:raise SystemExit('Use --apply for authorized staging setup.')
s=json.loads(Path('/tmp/rezlee-staging-deploy-settings.json').read_text())
assert s['NEXT_PUBLIC_SUPABASE_URL']=='https://gjwvalpxnfbvryosmcbj.supabase.co'
assert s['NEXT_PUBLIC_APP_URL']=='https://staging.rezlee.com'
assert s.get('REZLEE_GMAIL_SCHEDULE_READY')!='true'
def quote(v):return "'"+v.replace("'","''")+"'"
sql="create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;\n"
for name,value in [('rezlee_gmail_pending_origin',s['NEXT_PUBLIC_APP_URL']),('rezlee_gmail_pending_token',s['CRON_SECRET'])]:
 sql+="do $$ begin if not exists(select 1 from vault.secrets where name="+quote(name)+") then perform vault.create_secret("+quote(value)+","+quote(name)+"); end if; end $$;\n"
sql+=(root/'scripts/gmail-pending-dispatcher.sql').read_text()
fd,path=tempfile.mkstemp(prefix='rezlee-pending-',suffix='.sql');os.fchmod(fd,0o600)
try:
 with os.fdopen(fd,'w') as f:f.write(sql)
 p=subprocess.run(['npx','supabase','db','query','--linked','--project-ref','gjwvalpxnfbvryosmcbj','--file',path,'--output','json'],cwd=root,text=True,capture_output=True,timeout=120)
 text=p.stdout+p.stderr
 for v in s.values():
  if isinstance(v,str) and len(v)>6:text=text.replace(v,'[redacted]')
 (root/'docs/qa/gmail-pending-dispatcher-20261002.log').write_text(text)
 if p.returncode:raise SystemExit('Dispatcher setup failed; inspect redacted log.')
 print('Staging pending-import recovery configured. Recurring mailbox searches remain off.')
finally:os.unlink(path)
