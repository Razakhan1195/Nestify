from pathlib import Path
import json,subprocess,sys
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
p=subprocess.run(cli+['/v10/projects/'+project+'/env?teamId='+team],capture_output=True,text=True,timeout=60)
if p.returncode:raise RuntimeError('Vercel metadata request failed; output suppressed')
envs=json.loads(p.stdout).get('envs',[])
saved={x['key'] for x in envs if 'preview' in x.get('target',[]) and not x.get('gitBranch')}
contract=json.loads(subprocess.run(['/usr/local/bin/node','-e',"console.log(JSON.stringify(require('./scripts/release/verify-staging-runtime.cjs').required))"],cwd=r,capture_output=True,text=True,check=True).stdout)
baseline=json.loads((o/'canonical-staging-metadata.json').read_text())['canonicalStaging']['applicationEnvironmentNames']
missing={cap:[name for name in names if name not in saved] for cap,names in contract.items()}
missing={k:v for k,v in missing.items() if v}
secrets={k for names in missing.values() for k in names if any(x in k for x in ['SECRET','API_KEY','WEBHOOK_AUTH'])}
result={'at':datetime.now(timezone.utc).isoformat(),'projectId':project,'target':'preview','savedKeyCount':len(saved),'missingRequiredSettings':missing,'missingSensitiveSettings':sorted(secrets),'deploymentOnlySettings':sorted(set(baseline)-saved),'readyToDeploy':not missing,'scope':'Presence audit only; values never printed or saved. Runtime build preflight checks database/key roles and capabilities.','safeOwnerAction':'Restore these settings directly into Vercel Preview from the existing secure configuration. Do not send secret values in chat. No current deployment or production settings changed.'}
(o/'staging-configuration-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
sys.exit(0 if result['readyToDeploy'] else 2)
