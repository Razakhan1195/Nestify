from pathlib import Path
import hashlib,json,shutil,subprocess,re,base64
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test')
src=r/'apps/mobile'
dst=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/mobile')
out=r/'docs/checkpoints/native-candidate-20261021'
assert not dst.exists(), 'Candidate already exists; inspect rather than overwrite'
dst.mkdir(parents=True)
roots=['app','src','assets','plugins','vendor']
files=['app.config.js','app.json','babel.config.js','metro.config.js','package.json','package-lock.json','tsconfig.json','eas.json','scripts/release-config.cjs','scripts/crash-config.cjs']
exclude={'.git','node_modules','.expo','dist','build','ios','android','hosted-qa-settings.json','cloud-load-sessions.json','credentials.json'}
items=[]
for folder in roots:
 for p in (src/folder).rglob('*'):
  rel=p.relative_to(src)
  if any(x in exclude or x.startswith('.env') for x in rel.parts):continue
  if p.is_symlink():raise RuntimeError('Unexpected symlink in app inputs: '+str(rel))
  if p.is_file():items.append(p)
items += [src/f for f in files]
manifest=[]
for p in sorted(set(items)):
 rel=p.relative_to(src)
 if any(x in p.name.lower() for x in ['credential','recovery-key','session-token']) or p.suffix in ['.p8','.pem','.p12','.jks','.key','.mobileprovision']:raise RuntimeError('Restricted input rejected: '+str(rel))
 data=p.read_bytes()
 if p.suffix in ['.ts','.tsx','.js','.cjs','.json']:
  s=data.decode()
  if '-----BEGIN PRIVATE KEY-----' in s or '-----BEGIN RSA PRIVATE KEY-----' in s:raise RuntimeError('Private key marker rejected: '+str(rel))
  for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',s):
   try:claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
   except Exception:continue
   if claims.get('role')=='service_role':raise RuntimeError('Privileged key rejected: '+str(rel))
 target=dst/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 manifest.append({'file':str(rel),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(dst/'.gitignore').write_text('node_modules/\n.expo/\nios/\nandroid/\n.env*\n*.p8\n*.p12\n*.pem\n*.jks\ncredentials.json\n')
(dst/'.easignore').write_bytes((dst/'.gitignore').read_bytes())
subprocess.run(['git','init','-q'],cwd=dst,check=True)
subprocess.run(['git','add','.'],cwd=dst,check=True)
subprocess.run(['git','-c','user.name=Rezlee Release Preparation','-c','user.email=release@rezlee.local','commit','-qm','Freeze reviewed mobile candidate for staging acceptance'],cwd=dst,check=True)
commit=subprocess.run(['git','rev-parse','HEAD'],cwd=dst,capture_output=True,text=True,check=True).stdout.strip()
result={'at':datetime.now(timezone.utc).isoformat(),'sourceRepoHead':'aaa9e123f165340d4e83981f9986b8673f247737','candidateCommit':commit,'candidateDirectory':str(dst),'files':manifest,'fileCount':len(manifest),'totalBytes':sum(x['bytes'] for x in manifest),'credentialFilesRead':False,'buildStarted':False,'runtimeAcceptance':'pending coherent backend'}
(out/'mobile-source-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'}),flush=True)
