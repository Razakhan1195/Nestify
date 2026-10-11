from pathlib import Path
import json,subprocess
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');cp=r/'docs/checkpoints/gta-provider-scope-20261011';cwd='/tmp/rezlee-gta-provider-scope-staging-20261011'
s=json.loads((cp/'staging-smoke.json').read_text());assert len(s['checks'])==39 and all(c['ok'] for c in s['checks']) and s['syntheticUserRemoved']
v=json.loads((cp/'verification-exit-codes.json').read_text());assert v['types']==v['mobile-types']==v['lint']==0
full=(cp/'full-tests.log').read_text();assert 'ℹ pass 840' in full and 'ℹ fail 1' in full and 'statement-only activation preserves the database cap' in full
prior='https://nestify-h11icx3qq-razakhan1195s-projects.vercel.app';d=json.loads((cp/'deployment.json').read_text());assert d['url']==s['base']
def cli(args):
 q=subprocess.run(['npx','vercel',*args,'--scope','razakhan1195s-projects'],cwd=cwd,capture_output=True,text=True,timeout=60)
 assert q.returncode==0,q.stderr[-500:]
 return q.stdout+q.stderr
current=cli(['inspect','staging.rezlee.com']);assert prior in current,'Staging changed concurrently; alias untouched'
out=cli(['alias','set',d['url'],'staging.rezlee.com']);(cp/'alias.log').write_text(out)
after=cli(['inspect','staging.rezlee.com']);assert d['url'] in after
(cp/'alias-verified.log').write_text(after)
d.update(aliasApplied=True,productionChanged=False,previousStaging=prior,backendSource=cwd,nativeSource=str(r/'apps/mobile'))
(cp/'deployment.json').write_text(json.dumps(d,indent=2));print('Staging updated and alias verified:',d['url']);print('39 hosted checks passed; no paid provider runs; no production change')
