from pathlib import Path
import subprocess,json,urllib.request,urllib.error,hashlib
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/expense-groups-20261021'
ref='gjwvalpxnfbvryosmcbj';project='prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS';team='team_RWL45V0YAuHJ7DvygUtJNB8o'
stamp=lambda:datetime.now(timezone.utc).isoformat()
assert all(c['exitCode']==0 for c in json.loads((out/'deletion-fix-checks.json').read_text())['checks'])
g=json.loads((out/'final-gates.json').read_text())
assert all(c['exitCode']==0 for c in g['checks'] if c['name']!='mobile-types')
assert all(c['exitCode']==0 for c in json.loads((out/'final-gates-followup.json').read_text())['checks'])
access=subprocess.run(['/usr/bin/security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
def sql(query,read_only=False):
 req=urllib.request.Request('https://api.supabase.com/v1/projects/'+ref+'/database/query',data=json.dumps({'query':query,'read_only':read_only}).encode(),headers={'Authorization':'Bearer '+access,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=60) as res:return json.load(res)
 except urllib.error.HTTPError as e:
  (out/'migration-error.json').write_text(json.dumps({'at':stamp(),'status':e.code,'details':e.read().decode()[:3000]},indent=2))
  raise Exception('Staging migration API error '+str(e.code)) from None
before=sql("select to_regclass('public.expense_groups')::text as group_table",(True))
assert before[0]['group_table'] is None,'Migration already present; do not reapply'
migration=(r/'supabase/migrations/202610210010_independent_expense_groups.sql').read_text()
body=migration.strip().removeprefix('begin;').removesuffix('commit;').strip()
guard="""do $$ begin if to_regclass('public.expense_groups') is not null or exists(select 1 from supabase_migrations.schema_migrations where version='202610210010') then raise exception 'Migration already present';end if;end $$;"""
journal="insert into supabase_migrations.schema_migrations(version,name,statements) values('202610210010','independent_expense_groups',array[$rezlee_migration_content$"+body+"$rezlee_migration_content$]);"
sql('begin;set local lock_timeout=\'5s\';set local statement_timeout=\'45s\';'+guard+body+journal+'commit;')
after=sql("select version,name from supabase_migrations.schema_migrations where version='202610210010'",True)
(out/'staging-migration.json').write_text(json.dumps({'at':stamp(),'projectRef':ref,'version':'202610210010','sha256':hashlib.sha256(migration.encode()).hexdigest(),'verified':after,'customerProductionTouched':False},indent=2))
print('Staging migration applied and journal verified.',flush=True)
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
def api(path,body=None):
 cmd=cli+[path+('&' if '?' in path else '?')+'teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=90)
 if p.returncode:
  # No credentials are present in this request or output.
  (out/'deployment-error.txt').write_text(p.stderr[:3000])
  raise Exception('Staging deployment request failed')
 return json.loads(p.stdout)
a=api('/v4/aliases/rezlee-performance-staging.vercel.app')
assert a['projectId']==project and a['deploymentId']=='dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ','Staging alias changed'
payload=json.loads((out/'candidate-deployment-source.json').read_text())
assert payload['project']==project and payload['autoAssignCustomDomains'] is False
d=api('/v13/deployments',payload)
result={'at':stamp(),'id':d['id'],'url':d['url'],'projectId':d.get('projectId'),'readyState':d['readyState'],'previousDeploymentId':payload['deploymentId'],'customerProductionTouched':False}
(out/'candidate-deployment.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result),flush=True)
