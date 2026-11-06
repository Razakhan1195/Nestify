from pathlib import Path
from datetime import datetime,timezone
import subprocess,json,os,re,shlex
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
cwd=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/referral-mobile')
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
state={'at':datetime.now(timezone.utc).isoformat(),'scope':'TestFlight upload and Android internal draft only','submissions':{}}
p=o/'testing-store-submissions-ios-final.json';assert not p.exists(),'Do not duplicate uploads'
assert json.loads((o/'staging-alias-acceptance.json').read_text())['hostedExitCode']==0
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=cwd,text=True).strip()=='109cc7a88c8eb84cdc03296902f745d8547bd32c'
for platform,build,number in [('ios','8888993c-5074-4737-916f-d930570e234c',64)]:
 env=dict(os.environ,EXPO_NO_DOTENV='1',CI='1');env.pop('EAS_BUILD_PROFILE',None)
 cmd=cli+['submit','--platform',platform,'--profile','beta','--id',build,'--non-interactive','--no-wait']
 wrapped=cli+['env:exec','preview',shlex.join(['env','EAS_BUILD_PROFILE=apple-beta']+cmd),'--non-interactive']
 q=subprocess.run(wrapped,cwd=cwd,env=env,capture_output=True,text=True,timeout=240)
 text=q.stdout+'\n'+q.stderr
 text=re.sub(r'(?:sk_|eyJ|AIza)[A-Za-z0-9_.-]+','[REDACTED]',text)
 (o/(platform+'-store-submit-final.log')).write_text(text)
 state['submissions'][platform]={'buildId':build,'buildNumber':number,'cliExitCode':q.returncode,'outputTail':text[-6000:],'uploaded':False,'testerAvailable':False}
 p.write_text(json.dumps(state,indent=2)+'\n')
 print(json.dumps({'platform':platform,'buildNumber':number,'cliExitCode':q.returncode,'output':text[-6000:]}),flush=True)
