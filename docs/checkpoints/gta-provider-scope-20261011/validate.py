from pathlib import Path
import subprocess,json,concurrent.futures
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');cp=r/'docs/checkpoints/gta-provider-scope-20261011'
def run(job):
 name,args,cwd=job
 with open(cp/(name+'.log'),'w') as f:code=subprocess.run(args,cwd=cwd,stdout=f,stderr=subprocess.STDOUT).returncode
 return name,code
files=[p for p in json.loads((cp/'before.json').read_text())['files'] if p.endswith(('.ts','.tsx'))]
jobs=[('full-tests',['npm','test'],r),('types',['npx','tsc','--noEmit'],r),('mobile-types',['npx','tsc','--noEmit'],r/'apps/mobile'),('lint',['npx','eslint',*files],r)]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=dict(pool.map(run,jobs))
(cp/'verification-exit-codes.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
