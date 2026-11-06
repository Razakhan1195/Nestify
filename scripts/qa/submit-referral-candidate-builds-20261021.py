from pathlib import Path
import json,subprocess,os,shlex,re
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/referral-design-20261021'
m=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/referral-mobile')
status=out/'build-submission.json'
assert not status.exists(),'Submission already attempted; inspect remote jobs before retrying'
assert json.loads((out/'eas-preflight.json').read_text())['socialFlagsEnabled']
manifest=json.loads((out/'mobile-source-manifest.json').read_text())
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
stamp=lambda:datetime.now(timezone.utc).isoformat()
state={'at':stamp(),'stage':'submitting','profile':'apple-beta','candidateCommit':manifest['candidateCommit'],'sourceFileCount':manifest['fileCount'],'automaticSubmission':False,'testerDelivery':'held pending backend acceptance'}
status.write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state),flush=True)
cmd=shlex.join(['env','EAS_BUILD_PROFILE=apple-beta']+cli+['build','--platform','all','--profile','apple-beta','--non-interactive','--no-wait','--json','--message','Reviewed staging candidate plus premium referral invitation; delivery pending backend acceptance'])
try:
 p=subprocess.run(cli+['env:exec','preview',cmd,'--non-interactive'],cwd=m,env=dict(os.environ,EXPO_NO_DOTENV='1',CI='1'),capture_output=True,text=True,timeout=240)
 output=re.sub(r'\x1b\[[0-9;]*m','',p.stdout)
 parsed=None
 decoder=json.JSONDecoder()
 for match in re.finditer(r'\[\s*\{',output):
  try:
   value,_=decoder.raw_decode(output[match.start():])
   if isinstance(value,list) and value and all(isinstance(x,dict) and 'id' in x for x in value):parsed=value
  except ValueError:continue
 fields=['id','platform','status','buildProfile','distribution','appVersion','appBuildVersion','createdAt','updatedAt','gitCommitHash']
 state.update({'at':stamp(),'stage':'submitted' if parsed else 'submission_failed','exitCode':p.returncode,'builds':[{k:x.get(k) for k in fields} for x in (parsed or [])]})
 if not parsed:
  errors=[]
  for line in (output+'\n'+p.stderr).splitlines():
   if any(x in line.lower() for x in ['error:','error ', 'failed', 'cannot ', 'must ', 'required', 'requires', 'config', 'unable', 'credentials', 'permission']):
    line=re.sub(r'https?://\S+','[URL]',line)
    line=re.sub(r'eyJ[A-Za-z0-9_.-]+|(?:sk_|sntrys_|sk-)[A-Za-z0-9_-]+','[REDACTED]',line)
    errors.append(line[:350])
  state['errors']=errors[-12:]
except subprocess.TimeoutExpired:
 state.update({'at':stamp(),'stage':'submission_timeout','nextAction':'Inspect remote build list before any retry; builds may already exist'})
status.write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state),flush=True)
