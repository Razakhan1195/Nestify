from pathlib import Path
import json,subprocess,re
root=Path('/Users/razakhan/Documents/rezlee-mobile-test');target=Path('/tmp/rezlee-gta-provider-scope-staging-20261011')
s=json.loads((Path.home()/'Library/Application Support/Rezlee/rogers-hosted-staging-settings.json').read_text())
assert s['NEXT_PUBLIC_SUPABASE_URL']=='https://gjwvalpxnfbvryosmcbj.supabase.co'
s.pop('RESEND_API_KEY',None);s.pop('RESEND_FROM_EMAIL',None)
args=['npx','vercel','deploy','--yes','--scope','razakhan1195s-projects']
for k,v in s.items():
 if v is not None:
  args+=['--env',k+'='+str(v)]
  if not k.startswith('GMAIL_') and k!='REZLEE_GMAIL_ENCRYPTION_KEY':args+=['--build-env',k+'='+str(v)]
r=subprocess.run(args,cwd=target,capture_output=True,text=True,timeout=900);output=r.stdout+r.stderr
for v in s.values():
 if isinstance(v,str) and len(v)>8:output=output.replace(v,'[redacted-setting]')
Path('/tmp/rezlee-gta-deploy.log').write_text(output)
print('Deployment command exit',r.returncode);print(output[-2500:])
if r.returncode:raise SystemExit(r.returncode)
urls=re.findall(r'https://nestify-[a-z0-9]+-razakhan1195s-projects\.vercel\.app',r.stdout+r.stderr);assert urls
(root/'docs/checkpoints/gta-provider-scope-20261011/deployment.json').write_text(json.dumps({'url':urls[-1],'aliasApplied':False,'productionChanged':False},indent=2))
