from pathlib import Path
import json,subprocess,urllib.request
root=Path('/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021')
if (root/'timing-owned.json').exists() and not (root/'timing-restored.json').exists():
 status=json.loads((root/'status.json').read_text())
 if status.get('stage') not in ['complete','diagnostic-error','cleaning-fixtures']:raise SystemExit('Active diagnostic still owns timing setting')
 token=subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
 query={"query":"alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload config';","read_only":False}
 req=urllib.request.Request('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(query).encode())
 with urllib.request.urlopen(req,timeout=30) as res:res.read()
 (root/'timing-restored.json').write_text(json.dumps({'restored':True,'recovery':True}))
 print('Timing restored')
else:print('No timing recovery needed')
