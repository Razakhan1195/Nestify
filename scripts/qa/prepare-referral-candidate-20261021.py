from pathlib import Path
import hashlib,json,shutil,subprocess
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test')
base=r/'docs/checkpoints/native-candidate-20261021'
out=r/'docs/checkpoints/referral-design-20261021'
dst=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/referral-mobile')
old=json.loads((base/'mobile-source-manifest.json').read_text())
src=Path(old['candidateDirectory'])
assert not dst.exists(),'Candidate exists; inspect rather than overwrite'
assert old['candidateCommit']=='510db2ff5d85a08e0d856e6fce8a79e9750c9d07'
files={x['file']:x for x in old['files']}
for rel,entry in files.items():
 data=(src/rel).read_bytes()
 assert hashlib.sha256(data).hexdigest()==entry['sha256'],'Frozen baseline changed: '+rel
 target=dst/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
overlays=['app/rewards.tsx','src/components/ReferralPass.tsx']
for rel in overlays:
 data=(r/'apps/mobile'/rel).read_bytes()
 target=dst/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 files[rel]={'file':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
for name in ['.gitignore','.easignore']:(dst/name).write_bytes((src/name).read_bytes())
subprocess.run(['git','init','-q'],cwd=dst,check=True)
subprocess.run(['git','add','.'],cwd=dst,check=True)
subprocess.run(['git','-c','user.name=Rezlee Release Preparation','-c','user.email=release@rezlee.local','commit','-qm','Add reviewed native referral invitation to staging release candidate'],cwd=dst,check=True)
commit=subprocess.run(['git','rev-parse','HEAD'],cwd=dst,capture_output=True,text=True,check=True).stdout.strip()
(dst/'node_modules').symlink_to(r/'apps/mobile/node_modules',target_is_directory=True)
state={'at':datetime.now(timezone.utc).isoformat(),'candidateCommit':commit,'candidateDirectory':str(dst),'basedOnCommit':old['candidateCommit'],'changed':overlays,'files':list(sorted(files.values(),key=lambda x:x['file'])),'fileCount':len(files),'runtimeAcceptance':'pending coherent backend and real phones','credentialFilesRead':False}
(out/'mobile-source-manifest.json').write_text(json.dumps(state,indent=2)+'\n')
backend=[]
for rel in ['src/app/api/mobile/v1/rewards/route.ts','src/lib/membership/referral-link.ts']:
 data=(r/rel).read_bytes();backend.append({'file':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(out/'backend-overlays.json').write_text(json.dumps({'at':state['at'],'files':backend,'migrationsChanged':False,'grantRulesChanged':False},indent=2)+'\n')
preflight=(r/'scripts/qa/native-candidate-preflight.cjs').read_text().replace(str(src),str(dst)).replace('docs/checkpoints/native-candidate-20261021','docs/checkpoints/referral-design-20261021')
(r/'scripts/qa/referral-candidate-preflight.cjs').write_text(preflight)
submission=(r/'scripts/qa/submit-native-candidate-builds-20261021.py').read_text().replace(str(src),str(dst)).replace('docs/checkpoints/native-candidate-20261021','docs/checkpoints/referral-design-20261021').replace('Reviewed staging candidate: startup, Home, provider UX and expense groups; delivery pending backend acceptance','Reviewed staging candidate plus premium referral invitation; delivery pending backend acceptance')
(r/'scripts/qa/submit-referral-candidate-builds-20261021.py').write_text(submission)
print(json.dumps({k:v for k,v in state.items() if k!='files'}))
